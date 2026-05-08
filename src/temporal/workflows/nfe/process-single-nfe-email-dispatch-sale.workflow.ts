import { log, proxyActivities, workflowInfo } from "@temporalio/workflow";
import type {
  FinalizeNfeEmailDispatchSaleActivityResult,
  ProcessSingleNfeEmailDispatchSaleWorkflowInput,
  ProcessSingleNfeEmailDispatchSaleWorkflowResult,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import { NFE_EMAIL_DISPATCH_EMAIL_SUBJECT } from "../../../domain/nfe/nfe-email-dispatch.types.js";
import { temporalTaskQueues } from "../../../infra/config/temporal-task-queues.js";
import type * as nfeControlActivities from "../../activities/nfe/claim-nfe-email-dispatch-sale.activity.js";
import type * as nfeControlFinalizeActivities from "../../activities/nfe/finalize-nfe-email-dispatch-sale.activity.js";
import type * as nfeLockActivities from "../../activities/nfe/nfe-email-dispatch-sale-attempt-lock.activity.js";
import type * as nfeIxcActivities from "../../activities/nfe/fetch-nfe-pdf-from-ixc.activity.js";
import type * as nfeErpReadActivities from "../../activities/nfe/fetch-nfe-sale-email-context-from-erp.activity.js";
import type * as nfeTemplateActivities from "../../activities/nfe/render-nfe-email-template.activity.js";
import type * as sharedSmtpActivities from "../../activities/shared/send-smtp-email.activity.js";
import { normalizeAutomationRuntimePolicy } from "../shared/automation-runtime-policy.workflow.js";
import {
  NFE_PROCESSING_ACTIVITY_RETRY_POLICY,
  formatWorkflowNowAsDateTime3,
  readWorkflowErrorMessage,
} from "./process-nfe-email-dispatch-sales.shared.js";
import {
  buildNfeAttachmentFilename,
  buildSmtpIdempotencyKey,
  classifyUnhandledProcessingFailure,
  resolveSmtpResultToFinalization,
  type NfeEmailDispatchProcessingStage,
} from "./process-single-nfe-email-dispatch-sale.shared.js";

const { claimNfeEmailDispatchSaleActivity } =
  proxyActivities<typeof nfeControlActivities>({
    taskQueue: temporalTaskQueues.control,
    startToCloseTimeout: "5 minutes",
    retry: NFE_PROCESSING_ACTIVITY_RETRY_POLICY,
  });

const {
  acquireNfeEmailDispatchSaleAttemptLockActivity,
  cancelNfeEmailDispatchSaleAttemptLockActivity,
  completeNfeEmailDispatchSaleAttemptLockActivity,
} = proxyActivities<typeof nfeLockActivities>({
  taskQueue: temporalTaskQueues.control,
  startToCloseTimeout: "2 minutes",
  retry: NFE_PROCESSING_ACTIVITY_RETRY_POLICY,
});

const { fetchNfeSaleEmailContextFromErpActivity } =
  proxyActivities<typeof nfeErpReadActivities>({
    taskQueue: temporalTaskQueues.erpRead,
    startToCloseTimeout: "5 minutes",
    retry: NFE_PROCESSING_ACTIVITY_RETRY_POLICY,
  });

const { fetchNfePdfFromIxcActivity } = proxyActivities<typeof nfeIxcActivities>({
  taskQueue: temporalTaskQueues.ixc,
  startToCloseTimeout: "5 minutes",
  retry: NFE_PROCESSING_ACTIVITY_RETRY_POLICY,
});

const { renderNfeEmailTemplateActivity } =
  proxyActivities<typeof nfeTemplateActivities>({
    taskQueue: temporalTaskQueues.control,
    startToCloseTimeout: "5 minutes",
    retry: NFE_PROCESSING_ACTIVITY_RETRY_POLICY,
  });

const { sendSmtpEmailActivity } = proxyActivities<typeof sharedSmtpActivities>({
  taskQueue: temporalTaskQueues.smtp,
  startToCloseTimeout: "10 minutes",
  retry: {
    maximumAttempts: 1,
  },
});

const { finalizeNfeEmailDispatchSaleActivity } =
  proxyActivities<typeof nfeControlFinalizeActivities>({
    taskQueue: temporalTaskQueues.control,
    startToCloseTimeout: "5 minutes",
    retry: NFE_PROCESSING_ACTIVITY_RETRY_POLICY,
  });

export async function processSingleNfeEmailDispatchSaleWorkflow(
  input: ProcessSingleNfeEmailDispatchSaleWorkflowInput,
): Promise<ProcessSingleNfeEmailDispatchSaleWorkflowResult> {
  const attemptStartedAt = formatWorkflowNowAsDateTime3();
  const currentWorkflowInfo = workflowInfo();
  const runtimePolicy = normalizeAutomationRuntimePolicy(input.runtimePolicy);
  const attemptNumber = input.currentAttemptCount + 1;
  const lockResult = await acquireNfeEmailDispatchSaleAttemptLockActivity({
    requestId: currentWorkflowInfo.workflowId,
    workflowId: currentWorkflowInfo.workflowId,
    nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
    attemptNumber,
    runtimeScope: runtimePolicy.idempotencyScope,
  });

  if (lockResult.status !== "ACQUIRED") {
    return buildSkippedResult(input);
  }

  let lockDisposition: "cancel" | "complete" | "keep-pending" = "cancel";
  let finalResult: ProcessSingleNfeEmailDispatchSaleWorkflowResult | null = null;

  try {
    const claimResult = await claimNfeEmailDispatchSaleActivity({
      nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
      attemptStartedAt,
      maxSendAttempts: input.maxSendAttempts,
      runtimeScope: runtimePolicy.idempotencyScope,
    });

    if (claimResult.status === "SKIPPED") {
      return buildSkippedResult(input);
    }

    const attemptCount = claimResult.attemptCount;
    let processingStage: NfeEmailDispatchProcessingStage = "erp";
    lockDisposition = "keep-pending";

    try {
      const emailContextResult = await fetchNfeSaleEmailContextFromErpActivity({
        erpSaleId: input.erpSaleId,
      });

      if (emailContextResult.status === "FAILED_FINAL") {
        finalResult = await finalizeAttempt({
          saleId: input.nfeEmailDispatchSaleId,
          erpSaleId: input.erpSaleId,
          attemptStartedAt,
          attemptCount,
          maxSendAttempts: input.maxSendAttempts,
          status: "FAILED_FINAL",
          errorMessage: emailContextResult.errorMessage,
          runtimeScope: runtimePolicy.idempotencyScope,
        });
        lockDisposition = "complete";

        return finalResult;
      }

      processingStage = "ixc";

      const pdfResult = await fetchNfePdfFromIxcActivity({
        nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
        erpSaleId: input.erpSaleId,
        attemptCount,
      });

      processingStage = "render";

      const renderedEmail = await renderNfeEmailTemplateActivity({
        emailContext: emailContextResult.data,
      });

      processingStage = "smtp";

      const smtpResult = await sendSmtpEmailActivity({
        requestId: currentWorkflowInfo.workflowId,
        executionContext: {
          workflowId: currentWorkflowInfo.workflowId,
          workflowName: currentWorkflowInfo.workflowType,
          idempotencyScope: runtimePolicy.idempotencyScope,
        },
        idempotencyKey: buildSmtpIdempotencyKey(
          input.nfeEmailDispatchSaleId,
          attemptCount,
        ),
        message: {
          to: emailContextResult.data.recipients,
          subject: NFE_EMAIL_DISPATCH_EMAIL_SUBJECT,
          html: renderedEmail.html,
          text: renderedEmail.text,
          attachments: [
            {
              filename: buildNfeAttachmentFilename(emailContextResult.data.numeroNf),
              path: pdfResult.pdfPath,
              contentType: "application/pdf",
              contentDisposition: "attachment",
            },
          ],
        },
      });
      const resolvedSmtpFinalization = resolveSmtpResultToFinalization(smtpResult);

      finalResult = await finalizeAttempt({
        saleId: input.nfeEmailDispatchSaleId,
        erpSaleId: input.erpSaleId,
        attemptStartedAt,
        attemptCount,
        maxSendAttempts: input.maxSendAttempts,
        status: resolvedSmtpFinalization.status,
        runtimeScope: runtimePolicy.idempotencyScope,
        ...(resolvedSmtpFinalization.errorMessage === undefined
          ? {}
          : { errorMessage: resolvedSmtpFinalization.errorMessage }),
      });
      lockDisposition = "complete";

      return finalResult;
    } catch (error) {
      const failure = classifyUnhandledProcessingFailure(processingStage, error);

      log.warn("NF-e processing child encountered a classified activity failure", {
        workflowId: currentWorkflowInfo.workflowId,
        nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
        erpSaleId: input.erpSaleId,
        processingStage,
        finalStatus: failure.finalStatus,
        errorMessage: failure.errorMessage,
        technicalMessage: readWorkflowErrorMessage(error),
      });

      finalResult = await finalizeAttempt({
        saleId: input.nfeEmailDispatchSaleId,
        erpSaleId: input.erpSaleId,
        attemptStartedAt,
        attemptCount,
        maxSendAttempts: input.maxSendAttempts,
        status: failure.finalStatus,
        errorMessage: failure.errorMessage,
        runtimeScope: runtimePolicy.idempotencyScope,
      });
      lockDisposition = "complete";

      return finalResult;
    }
  } finally {
    if (
      lockDisposition === "complete" &&
      finalResult !== null &&
      finalResult.status !== "SKIPPED"
    ) {
      await completeAttemptLockBestEffort({
        workflowId: currentWorkflowInfo.workflowId,
        nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
        attemptNumber,
        runtimeScope: runtimePolicy.idempotencyScope,
        leaseToken: lockResult.leaseToken,
        finalStatus: finalResult.status,
      });
    }

    if (lockDisposition === "cancel") {
      await cancelAttemptLockBestEffort({
        nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
        attemptNumber,
        runtimeScope: runtimePolicy.idempotencyScope,
        leaseToken: lockResult.leaseToken,
      });
    }
  }
}

async function finalizeAttempt(input: {
  saleId: number;
  erpSaleId: number;
  attemptStartedAt: string;
  attemptCount: number;
  maxSendAttempts: number;
  status: "SENT" | "FAILED_TRANSIENT" | "FAILED_FINAL" | "DELIVERY_UNKNOWN";
  errorMessage?: string;
  runtimeScope: string;
}): Promise<ProcessSingleNfeEmailDispatchSaleWorkflowResult> {
  const finalizationResult = await finalizeNfeEmailDispatchSaleActivity({
    nfeEmailDispatchSaleId: input.saleId,
    attemptStartedAt: input.attemptStartedAt,
    attemptCount: input.attemptCount,
    maxSendAttempts: input.maxSendAttempts,
    status: input.status,
    runtimeScope: input.runtimeScope,
    ...(input.errorMessage === undefined
      ? {}
      : { errorMessage: input.errorMessage }),
  });

  return mapFinalizationResultToWorkflowResult(finalizationResult, input.erpSaleId);
}

function mapFinalizationResultToWorkflowResult(
  result: FinalizeNfeEmailDispatchSaleActivityResult,
  erpSaleId: number,
): ProcessSingleNfeEmailDispatchSaleWorkflowResult {
  return {
    nfeEmailDispatchSaleId: result.nfeEmailDispatchSaleId,
    erpSaleId,
    status: result.status,
    attemptCount: result.attemptCount,
    ...(result.errorMessage === undefined
      ? {}
      : { errorMessage: result.errorMessage }),
  };
}

function buildSkippedResult(
  input: ProcessSingleNfeEmailDispatchSaleWorkflowInput,
): ProcessSingleNfeEmailDispatchSaleWorkflowResult {
  return {
    nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
    erpSaleId: input.erpSaleId,
    status: "SKIPPED",
  };
}

async function completeAttemptLockBestEffort(input: {
  workflowId: string;
  nfeEmailDispatchSaleId: number;
  attemptNumber: number;
  runtimeScope: string;
  leaseToken: string;
  finalStatus: Exclude<ProcessSingleNfeEmailDispatchSaleWorkflowResult["status"], "SKIPPED">;
}): Promise<void> {
  try {
    await completeNfeEmailDispatchSaleAttemptLockActivity(input);
  } catch (error) {
    log.warn("NF-e processing child could not complete the shared attempt lock", {
      workflowId: input.workflowId,
      nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
      attemptNumber: input.attemptNumber,
      technicalMessage: readWorkflowErrorMessage(error),
    });
  }
}

async function cancelAttemptLockBestEffort(input: {
  nfeEmailDispatchSaleId: number;
  attemptNumber: number;
  runtimeScope: string;
  leaseToken: string;
}): Promise<void> {
  try {
    await cancelNfeEmailDispatchSaleAttemptLockActivity(input);
  } catch (error) {
    log.warn("NF-e processing child could not cancel the shared attempt lock", {
      workflowId: workflowInfo().workflowId,
      nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
      attemptNumber: input.attemptNumber,
      technicalMessage: readWorkflowErrorMessage(error),
    });
  }
}
