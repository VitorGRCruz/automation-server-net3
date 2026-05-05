import { ApplicationFailure, log, workflowInfo } from "@temporalio/workflow";
import type {
  EquipmentRetrievalVerificationInvalidRecord,
  EquipmentRetrievalVerificationTriggerWorkflowInput,
  EquipmentRetrievalVerificationTriggerWorkflowResult,
} from "../../../domain/cobrancas/equipment-retrieval-verification.types.js";
import type { NormalizedAutomationRuntimePolicy } from "../../../domain/shared/automation-runtime-policy.types.js";
import { scopeWorkflowId } from "../shared/automation-runtime-policy.workflow.js";
import {
  findRootApplicationFailure,
  readWorkflowFailureMessage,
} from "../shared/workflow-failure.workflow.js";

export interface TriggerFetchFailureDetails {
  errorKind: "transient" | "permanent";
  message: string;
}

export function normalizeTriggerInput(
  input: EquipmentRetrievalVerificationTriggerWorkflowInput,
): EquipmentRetrievalVerificationTriggerWorkflowInput {
  const requestId = resolveRequestId(input);
  const startAt = input.startAt.trim();

  if (startAt.length === 0) {
    throw ApplicationFailure.nonRetryable(
      "Equipment retrieval verification trigger requires a non-empty startAt",
      "INVALID_WORKFLOW_INPUT",
    );
  }

  return {
    requestId,
    source: input.source,
    startAt,
    ...(input.runtimePolicy === undefined
      ? {}
      : { runtimePolicy: input.runtimePolicy }),
    ...(input.originRequestId?.trim()
      ? { originRequestId: input.originRequestId.trim() }
      : {}),
  };
}

export function buildProcessItemWorkflowId(
  idReceber: number,
  runtimePolicy: NormalizedAutomationRuntimePolicy,
): string {
  return scopeWorkflowId(
    `cobrancas-equipment-retrieval-verification/item/${idReceber}`,
    runtimePolicy,
  );
}

export function buildRecoveryWorkflowId(
  originRequestId: string,
  runtimePolicy: NormalizedAutomationRuntimePolicy,
): string {
  return scopeWorkflowId(
    `cobrancas-equipment-retrieval-verification/recovery/${originRequestId}`,
    runtimePolicy,
  );
}

export function logInvalidRecords(
  input: EquipmentRetrievalVerificationTriggerWorkflowInput,
  invalidRecords: EquipmentRetrievalVerificationInvalidRecord[],
): void {
  const info = workflowInfo();

  for (const record of invalidRecords) {
    log.warn("Equipment retrieval verification skipped an invalid eligible record", {
      requestId: input.requestId,
      workflowId: info.workflowId,
      source: input.source,
      idReceber: record.idReceber,
      idCobranca: record.idCobranca,
      missingFields: record.missingFields,
    });
  }
}

export function buildTriggerResult(
  input: EquipmentRetrievalVerificationTriggerWorkflowInput,
  status: EquipmentRetrievalVerificationTriggerWorkflowResult["status"],
  totalRecords = 0,
  validRecords = 0,
  invalidRecords = 0,
  childWorkflowsStarted = 0,
  skippedAlreadyRunning = 0,
  skippedStartFailures = 0,
  triggerFailureReason?: string,
): EquipmentRetrievalVerificationTriggerWorkflowResult {
  return {
    requestId: input.requestId,
    source: input.source,
    startAt: input.startAt,
    status,
    totalRecords,
    validRecords,
    invalidRecords,
    childWorkflowsStarted,
    skippedAlreadyRunning,
    skippedStartFailures,
    ...(triggerFailureReason === undefined ? {} : { triggerFailureReason }),
  };
}

export function classifyTriggerFetchFailure(
  error: unknown,
): TriggerFetchFailureDetails {
  const causeError = findRootApplicationFailure(error);
  const workflowError = typeof error === "object" && error !== null ? error : null;

  if (causeError !== null) {
    if (causeError.nonRetryable || causeError.type === "PermanentIntegrationError") {
      return {
        errorKind: "permanent",
        message: causeError.message,
      };
    }

    return {
      errorKind: "transient",
      message: causeError.message,
    };
  }

  if (workflowError instanceof ApplicationFailure) {
    if (workflowError.nonRetryable || workflowError.type === "PermanentIntegrationError") {
      return {
        errorKind: "permanent",
        message: workflowError.message,
      };
    }

    return {
      errorKind: "transient",
      message: workflowError.message,
    };
  }

  if (workflowError instanceof Error) {
    return {
      errorKind: "transient",
      message: workflowError.message,
    };
  }

  return {
    errorKind: "transient",
    message: "Equipment retrieval verification trigger failed with an unknown error",
  };
}

export function buildTriggerFailureDetails(
  round: 1 | 2,
  failure: TriggerFetchFailureDetails,
): string {
  return (
    `Equipment retrieval verification trigger failed terminally after round ${round} ` +
    `with ${failure.errorKind} error: ${failure.message}`
  );
}

export function isWorkflowAlreadyRunning(error: unknown): boolean {
  return readErrorMessage(error).includes("Workflow execution already started");
}

export function readErrorMessage(error: unknown): string {
  return readWorkflowFailureMessage(error);
}

function resolveRequestId(input: EquipmentRetrievalVerificationTriggerWorkflowInput): string {
  const providedRequestId = input.requestId.trim();

  if (providedRequestId.length > 0) {
    return providedRequestId;
  }

  return workflowInfo().workflowId;
}
