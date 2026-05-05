import { ApplicationFailure, log, proxyActivities, workflowInfo } from "@temporalio/workflow";
import type {
  FinalizeManualNfeEmailDispatchSaleActivityResult,
  LoadNfeEmailDispatchSaleForManualProcessingActivityResult,
  ManualProcessNfeEmailDispatchSaleWorkflowInput,
  ManualProcessNfeEmailDispatchSaleWorkflowResult,
  NfeEmailDispatchSaleManualProcessingSnapshot,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import { NFE_EMAIL_DISPATCH_EMAIL_SUBJECT } from "../../../domain/nfe/nfe-email-dispatch.types.js";
import { temporalTaskQueues } from "../../../infra/config/temporal-task-queues.js";
import type * as nfeLockActivities from "../../activities/nfe/nfe-email-dispatch-sale-attempt-lock.activity.js";
import type * as nfeManualSaleActivities from "../../activities/nfe/load-nfe-email-dispatch-sale-for-manual-processing.activity.js";
import type * as nfeManualFinalizeActivities from "../../activities/nfe/finalize-manual-nfe-email-dispatch-sale.activity.js";
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

const MANUAL_SALE_NOT_FOUND_FAILURE_TYPE = "NFE_MANUAL_SALE_NOT_FOUND";
const MANUAL_SALE_CONFLICT_FAILURE_TYPE = "NFE_MANUAL_SALE_CONFLICT";
const MANUAL_SALE_INVALID_INPUT_FAILURE_TYPE = "NFE_MANUAL_SALE_INVALID_INPUT";

const { loadNfeEmailDispatchSaleForManualProcessingActivity } =
  proxyActivities<typeof nfeManualSaleActivities>({
    taskQueue: temporalTaskQueues.control,
    startToCloseTimeout: "5 minutes",
    retry: NFE_PROCESSING_ACTIVITY_RETRY_POLICY,
  });

const {
  acquireNfeEmailDispatchSaleAttemptLockActivity,
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
  taskQueue: temporalTaskQueues.control,
  startToCloseTimeout: "10 minutes",
  retry: {
    maximumAttempts: 1,
  },
});

const { finalizeManualNfeEmailDispatchSaleActivity } =
  proxyActivities<typeof nfeManualFinalizeActivities>({
    taskQueue: temporalTaskQueues.control,
    startToCloseTimeout: "5 minutes",
    retry: NFE_PROCESSING_ACTIVITY_RETRY_POLICY,
  });

export async function processManualNfeEmailDispatchSaleWorkflow(
  input: ManualProcessNfeEmailDispatchSaleWorkflowInput,
): Promise<ManualProcessNfeEmailDispatchSaleWorkflowResult> {
  const currentWorkflowInfo = workflowInfo();
  const runtimePolicy = normalizeAutomationRuntimePolicy(input.runtimePolicy);
  const attemptStartedAt = formatWorkflowNowAsDateTime3();
  const loadedSale = await loadManualSaleOrFail(
    input.nfeEmailDispatchSaleId,
    runtimePolicy.idempotencyScope,
  );

  validateManualWorkflowInput(input, loadedSale);

  if (loadedSale.status === "SENT") {
    throwConflict(
      `NF-e sale ${input.nfeEmailDispatchSaleId} was already sent and cannot be reprocessed manually`,
    );
  }

  const attemptNumber = loadedSale.attemptCount + 1;
  const lockResult = await acquireNfeEmailDispatchSaleAttemptLockActivity({
    requestId: input.requestId,
    workflowId: currentWorkflowInfo.workflowId,
    nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
    attemptNumber,
    runtimeScope: runtimePolicy.idempotencyScope,
  });

  if (lockResult.status !== "ACQUIRED") {
    throwConflict(
      `NF-e sale ${input.nfeEmailDispatchSaleId} is already being processed for attempt ${attemptNumber}`,
    );
  }

  let finalResult: FinalizeManualNfeEmailDispatchSaleActivityResult | null = null;

  try {
    const finalizationInput = await executeManualSaleProcessing({
      input,
      attemptNumber,
      runtimeScope: runtimePolicy.idempotencyScope,
      workflowId: currentWorkflowInfo.workflowId,
      workflowType: currentWorkflowInfo.workflowType,
    });

    finalResult = await finalizeManualNfeEmailDispatchSaleActivity({
      nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
      expectedStatus: loadedSale.status,
      expectedAttemptCount: loadedSale.attemptCount,
      attemptStartedAt,
      maxSendAttempts: input.maxSendAttempts,
      status: finalizationInput.status,
      runtimeScope: runtimePolicy.idempotencyScope,
      ...(finalizationInput.errorMessage === undefined
        ? {}
        : { errorMessage: finalizationInput.errorMessage }),
    });

    return mapFinalizationResultToWorkflowResult(finalResult, input.erpSaleId);
  } finally {
    if (finalResult !== null) {
      await completeAttemptLockBestEffort({
        workflowId: currentWorkflowInfo.workflowId,
        nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
        attemptNumber,
        runtimeScope: runtimePolicy.idempotencyScope,
        leaseToken: lockResult.leaseToken,
        finalStatus: finalResult.status,
      });
    }
  }
}

async function loadManualSaleOrFail(
  nfeEmailDispatchSaleId: number,
  runtimeScope: string,
): Promise<NfeEmailDispatchSaleManualProcessingSnapshot> {
  const result: LoadNfeEmailDispatchSaleForManualProcessingActivityResult =
    await loadNfeEmailDispatchSaleForManualProcessingActivity({
      nfeEmailDispatchSaleId,
      runtimeScope,
    });

  if (result.status === "NOT_FOUND") {
    throwNotFound(`NF-e sale ${nfeEmailDispatchSaleId} was not found in automation storage`);
  }

  return result.sale;
}

function validateManualWorkflowInput(
  input: ManualProcessNfeEmailDispatchSaleWorkflowInput,
  loadedSale: NfeEmailDispatchSaleManualProcessingSnapshot,
): void {
  if (loadedSale.erpSaleId !== input.erpSaleId) {
    throwInvalidInput(
      `NF-e sale ${input.nfeEmailDispatchSaleId} is linked to erpSaleId ${loadedSale.erpSaleId}, but the request received ${input.erpSaleId}`,
    );
  }
}

async function executeManualSaleProcessing(input: {
  input: ManualProcessNfeEmailDispatchSaleWorkflowInput;
  attemptNumber: number;
  runtimeScope: string;
  workflowId: string;
  workflowType: string;
}): Promise<{
  status: "SENT" | "FAILED_TRANSIENT" | "FAILED_FINAL" | "DELIVERY_UNKNOWN";
  errorMessage?: string;
}> {
  let processingStage: NfeEmailDispatchProcessingStage = "erp";

  try {
    const emailContextResult = await fetchNfeSaleEmailContextFromErpActivity({
      erpSaleId: input.input.erpSaleId,
    });

    if (emailContextResult.status === "FAILED_FINAL") {
      return {
        status: "FAILED_FINAL",
        errorMessage: emailContextResult.errorMessage,
      };
    }

    processingStage = "ixc";

    const pdfResult = await fetchNfePdfFromIxcActivity({
      nfeEmailDispatchSaleId: input.input.nfeEmailDispatchSaleId,
      erpSaleId: input.input.erpSaleId,
      attemptCount: input.attemptNumber,
    });

    processingStage = "render";

    const renderedEmail = await renderNfeEmailTemplateActivity({
      emailContext: emailContextResult.data,
    });

    processingStage = "smtp";

    const smtpResult = await sendSmtpEmailActivity({
      requestId: input.input.requestId,
      executionContext: {
        workflowId: input.workflowId,
        workflowName: input.workflowType,
        idempotencyScope: input.runtimeScope,
      },
      idempotencyKey: buildSmtpIdempotencyKey(
        input.input.nfeEmailDispatchSaleId,
        input.attemptNumber,
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

    return resolveSmtpResultToFinalization(smtpResult);
  } catch (error) {
    const failure = classifyUnhandledProcessingFailure(processingStage, error);

    log.warn("Manual NF-e processing workflow classified an activity failure", {
      workflowId: input.workflowId,
      nfeEmailDispatchSaleId: input.input.nfeEmailDispatchSaleId,
      erpSaleId: input.input.erpSaleId,
      processingStage,
      finalStatus: failure.finalStatus,
      errorMessage: failure.errorMessage,
      technicalMessage: readWorkflowErrorMessage(error),
    });

    return {
      status: failure.finalStatus,
      errorMessage: failure.errorMessage,
    };
  }
}

function mapFinalizationResultToWorkflowResult(
  result: FinalizeManualNfeEmailDispatchSaleActivityResult,
  erpSaleId: number,
): ManualProcessNfeEmailDispatchSaleWorkflowResult {
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

async function completeAttemptLockBestEffort(input: {
  workflowId: string;
  nfeEmailDispatchSaleId: number;
  attemptNumber: number;
  runtimeScope: string;
  leaseToken: string;
  finalStatus: FinalizeManualNfeEmailDispatchSaleActivityResult["status"];
}): Promise<void> {
  try {
    await completeNfeEmailDispatchSaleAttemptLockActivity(input);
  } catch (error) {
    log.warn("Manual NF-e processing workflow could not complete the shared attempt lock", {
      workflowId: input.workflowId,
      nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
      attemptNumber: input.attemptNumber,
      technicalMessage: readWorkflowErrorMessage(error),
    });
  }
}

function throwNotFound(message: string): never {
  throw ApplicationFailure.nonRetryable(message, MANUAL_SALE_NOT_FOUND_FAILURE_TYPE);
}

function throwConflict(message: string): never {
  throw ApplicationFailure.nonRetryable(message, MANUAL_SALE_CONFLICT_FAILURE_TYPE);
}

function throwInvalidInput(message: string): never {
  throw ApplicationFailure.nonRetryable(
    message,
    MANUAL_SALE_INVALID_INPUT_FAILURE_TYPE,
  );
}
