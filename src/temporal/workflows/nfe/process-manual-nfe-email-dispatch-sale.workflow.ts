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
import type * as nfeManualRecoverActivities from "../../activities/nfe/recover-manual-nfe-email-dispatch-sale.activity.js";
import type * as nfeIxcActivities from "../../activities/nfe/fetch-nfe-pdf-from-ixc.activity.js";
import type * as nfeErpReadActivities from "../../activities/nfe/fetch-nfe-sale-email-context-from-erp.activity.js";
import type * as nfeTemplateActivities from "../../activities/nfe/render-nfe-email-template.activity.js";
import type * as sharedSmtpActivities from "../../activities/shared/send-smtp-email.activity.js";
import { normalizeAutomationRuntimePolicy } from "../shared/automation-runtime-policy.workflow.js";
import {
  NFE_PROCESSING_ACTIVITY_RETRY_POLICY,
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
const MANUAL_SALE_ALREADY_RUNNING_FAILURE_TYPE = "NFE_MANUAL_ALREADY_RUNNING";
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
  taskQueue: temporalTaskQueues.smtp,
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

const { recoverManualNfeEmailDispatchSaleActivity } =
  proxyActivities<typeof nfeManualRecoverActivities>({
    taskQueue: temporalTaskQueues.control,
    startToCloseTimeout: "5 minutes",
    retry: NFE_PROCESSING_ACTIVITY_RETRY_POLICY,
  });

export async function processManualNfeEmailDispatchSaleWorkflow(
  input: ManualProcessNfeEmailDispatchSaleWorkflowInput,
): Promise<ManualProcessNfeEmailDispatchSaleWorkflowResult> {
  const currentWorkflowInfo = workflowInfo();
  const runtimePolicy = normalizeAutomationRuntimePolicy(input.runtimePolicy);
  let leaseToken: string | null = null;
  let finalResult: FinalizeManualNfeEmailDispatchSaleActivityResult | null = null;
  let finalizationTarget: {
    status: "SENT" | "FAILED_TRANSIENT" | "FAILED_FINAL" | "DELIVERY_UNKNOWN";
    errorMessage?: string;
  } | null = null;

  try {
    const loadedSale = await loadManualSaleOrFail(
      input.nfeEmailDispatchSaleId,
      runtimePolicy.idempotencyScope,
    );
    const idempotentResult = mapLoadedSaleToIdempotentWorkflowResult(
      loadedSale,
      input.erpSaleId,
      input.attemptCount,
      input.attemptStartedAt,
    );

    if (idempotentResult !== null) {
      return idempotentResult;
    }

    validateManualWorkflowInput(input, loadedSale);

    const lockResult = await acquireNfeEmailDispatchSaleAttemptLockActivity({
      requestId: input.requestId,
      workflowId: currentWorkflowInfo.workflowId,
      nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
      attemptNumber: input.attemptCount,
      runtimeScope: runtimePolicy.idempotencyScope,
    });

    switch (lockResult.status) {
      case "ACQUIRED":
        leaseToken = lockResult.leaseToken;
        break;
      case "PENDING":
        return throwAlreadyRunning(
          `NF-e sale ${input.nfeEmailDispatchSaleId} is already being processed for attempt ${input.attemptCount}`,
        );
      case "ALREADY_PROCESSED": {
        const reloadedSale = await loadManualSaleOrFail(
          input.nfeEmailDispatchSaleId,
          runtimePolicy.idempotencyScope,
        );
        const idempotentAttemptResult = mapLoadedSaleToIdempotentWorkflowResult(
          reloadedSale,
          input.erpSaleId,
          input.attemptCount,
          input.attemptStartedAt,
        );

        if (idempotentAttemptResult !== null) {
          return idempotentAttemptResult;
        }

        throw new Error(
          `NF-e sale ${input.nfeEmailDispatchSaleId} reported a completed manual attempt ${input.attemptCount}, ` +
            `but its persisted snapshot is status ${reloadedSale.status} with attemptCount ${reloadedSale.attemptCount}`,
        );
      }
    }

    finalizationTarget = await executeManualSaleProcessing({
      input,
      runtimeScope: runtimePolicy.idempotencyScope,
      workflowId: currentWorkflowInfo.workflowId,
      workflowType: currentWorkflowInfo.workflowType,
    });

    finalResult = await finalizeManualNfeEmailDispatchSaleActivity({
      nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
      attemptStartedAt: input.attemptStartedAt,
      attemptCount: input.attemptCount,
      status: finalizationTarget.status,
      runtimeScope: runtimePolicy.idempotencyScope,
      ...(finalizationTarget.errorMessage === undefined
        ? {}
        : { errorMessage: finalizationTarget.errorMessage }),
    });

    return mapFinalizationResultToWorkflowResult(finalResult, input.erpSaleId);
  } catch (error) {
    if (shouldRethrowWithoutRecovery(error)) {
      throw error;
    }

    finalizationTarget ??= buildUnexpectedManualRecoveryTarget(error);
    finalResult = await recoverManualNfeEmailDispatchSaleActivity({
      nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
      attemptStartedAt: input.attemptStartedAt,
      attemptCount: input.attemptCount,
      status: finalizationTarget.status,
      runtimeScope: runtimePolicy.idempotencyScope,
      ...(finalizationTarget.errorMessage === undefined
        ? {}
        : { errorMessage: finalizationTarget.errorMessage }),
    });

    log.warn("Manual NF-e processing workflow recovered after an unexpected failure", {
      workflowId: currentWorkflowInfo.workflowId,
      nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
      erpSaleId: input.erpSaleId,
      recoveredStatus: finalResult.status,
      technicalMessage: readWorkflowErrorMessage(error),
    });

    return mapFinalizationResultToWorkflowResult(finalResult, input.erpSaleId);
  } finally {
    if (finalResult !== null && leaseToken !== null) {
      await completeAttemptLockBestEffort({
        workflowId: currentWorkflowInfo.workflowId,
        nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
        attemptNumber: input.attemptCount,
        runtimeScope: runtimePolicy.idempotencyScope,
        leaseToken,
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

  if (loadedSale.status !== "IN_PROGRESS") {
    throwInvalidInput(
      `NF-e sale ${input.nfeEmailDispatchSaleId} is ${loadedSale.status}, but attempt ${input.attemptCount} requires IN_PROGRESS`,
    );
  }

  if (loadedSale.attemptCount !== input.attemptCount) {
    throwInvalidInput(
      `NF-e sale ${input.nfeEmailDispatchSaleId} is at attemptCount ${loadedSale.attemptCount}, but the workflow received ${input.attemptCount}`,
    );
  }

  if (loadedSale.lastAttemptAt !== normalizeAttemptStartedAt(input.attemptStartedAt)) {
    throwInvalidInput(
      `NF-e sale ${input.nfeEmailDispatchSaleId} is linked to lastAttemptAt ${loadedSale.lastAttemptAt}, but the workflow received ${input.attemptStartedAt}`,
    );
  }
}

async function executeManualSaleProcessing(input: {
  input: ManualProcessNfeEmailDispatchSaleWorkflowInput;
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
      attemptCount: input.input.attemptCount,
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
        input.input.attemptCount,
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

function mapLoadedSaleToIdempotentWorkflowResult(
  sale: NfeEmailDispatchSaleManualProcessingSnapshot,
  erpSaleId: number,
  attemptCount: number,
  attemptStartedAt: string,
): ManualProcessNfeEmailDispatchSaleWorkflowResult | null {
  if (
    sale.attemptCount !== attemptCount ||
    sale.lastAttemptAt !== normalizeAttemptStartedAt(attemptStartedAt)
  ) {
    return null;
  }

  switch (sale.status) {
    case "SENT":
    case "FAILED_TRANSIENT":
    case "FAILED_FINAL":
    case "DELIVERY_UNKNOWN":
      return {
        nfeEmailDispatchSaleId: sale.nfeEmailDispatchSaleId,
        erpSaleId,
        status: sale.status,
        attemptCount: sale.attemptCount,
        ...(sale.lastErrorMessage === null
          ? {}
          : { errorMessage: sale.lastErrorMessage }),
      };
    case "PENDING":
    case "IN_PROGRESS":
      return null;
  }
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

function normalizeAttemptStartedAt(value: string): string {
  return value.trim();
}

function buildUnexpectedManualRecoveryTarget(error: unknown): {
  status: "FAILED_TRANSIENT";
  errorMessage: string;
} {
  return {
    status: "FAILED_TRANSIENT",
    errorMessage: readWorkflowErrorMessage(error),
  };
}

function shouldRethrowWithoutRecovery(error: unknown): boolean {
  return (
    isApplicationFailureType(error, MANUAL_SALE_NOT_FOUND_FAILURE_TYPE) ||
    isApplicationFailureType(error, MANUAL_SALE_ALREADY_RUNNING_FAILURE_TYPE)
  );
}

function isApplicationFailureType(error: unknown, expectedType: string): boolean {
  return (
    error instanceof ApplicationFailure &&
    error.type === expectedType
  );
}

function throwNotFound(message: string): never {
  throw ApplicationFailure.nonRetryable(message, MANUAL_SALE_NOT_FOUND_FAILURE_TYPE);
}

function throwAlreadyRunning(message: string): never {
  throw ApplicationFailure.nonRetryable(
    message,
    MANUAL_SALE_ALREADY_RUNNING_FAILURE_TYPE,
  );
}

function throwInvalidInput(message: string): never {
  throw ApplicationFailure.nonRetryable(
    message,
    MANUAL_SALE_INVALID_INPUT_FAILURE_TYPE,
  );
}
