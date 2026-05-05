import { ApplicationFailure, log, proxyActivities, workflowInfo } from "@temporalio/workflow";
import type {
  EquipmentRetrievalVerificationActivityExecutionContext,
  EquipmentRetrievalVerificationCreateOrderActivityResult,
  EquipmentRetrievalVerificationCreateOrderActivityFailureResult,
  EquipmentRetrievalVerificationProcessItemWorkflowInput,
  EquipmentRetrievalVerificationProcessItemWorkflowResult,
} from "../../../domain/cobrancas/equipment-retrieval-verification.types.js";
import { temporalTaskQueues } from "../../../infra/config/temporal-task-queues.js";
import type * as cobrancasIxcActivities from "../../activities/cobrancas/create-equipment-retrieval-verification-order.activity.js";
import { normalizeAutomationRuntimePolicy } from "../shared/automation-runtime-policy.workflow.js";
import {
  findRootApplicationFailure,
  readWorkflowFailureMessage,
} from "../shared/workflow-failure.workflow.js";

const { createEquipmentRetrievalVerificationOrderActivity } =
  proxyActivities<typeof cobrancasIxcActivities>({
    taskQueue: temporalTaskQueues.ixc,
    startToCloseTimeout: "2 minutes",
    retry: {
      initialInterval: "30 seconds",
      backoffCoefficient: 1,
      maximumAttempts: 6,
      nonRetryableErrorTypes: ["PermanentIntegrationError"],
    },
  });

export async function equipmentRetrievalVerificationProcessItemWorkflow(
  input: EquipmentRetrievalVerificationProcessItemWorkflowInput,
): Promise<EquipmentRetrievalVerificationProcessItemWorkflowResult> {
  const runtimePolicy = normalizeAutomationRuntimePolicy(input.runtimePolicy);
  const executionContext = buildExecutionContext(runtimePolicy);

  log.info("Equipment retrieval verification child started", {
    requestId: input.requestId,
    workflowId: executionContext.workflowId,
    idReceber: input.item.idReceber,
    idCobranca: input.item.idCobranca,
  });

  try {
    const createOrderResult = await createEquipmentRetrievalVerificationOrderActivity({
      requestId: input.requestId,
      executionContext,
      item: input.item,
    });

    if (createOrderResult.status === "success") {
      return buildSuccessResult(input, executionContext, createOrderResult);
    }

    if (isPermanentCreateOrderFailure(createOrderResult)) {
      return buildPermanentFailureResult(input, executionContext, createOrderResult);
    }

    log.error("Equipment retrieval verification child failed with non-terminal order result", {
      requestId: input.requestId,
      workflowId: executionContext.workflowId,
      idReceber: input.item.idReceber,
      idCobranca: input.item.idCobranca,
      failureType: createOrderResult.failureType,
      failureMessage: createOrderResult.message,
    });

    throw buildNonTerminalFailure(input, createOrderResult);
  } catch (error) {
    const failureMessage = readExecutionFailureMessage(error);
    const failureKind = classifyActivityFailureKind(error);

    log.error("Equipment retrieval verification child exhausted with activity error", {
      requestId: input.requestId,
      workflowId: executionContext.workflowId,
      idReceber: input.item.idReceber,
      idCobranca: input.item.idCobranca,
      failureKind,
      failureMessage,
    });

    throw ApplicationFailure.create({
      message: buildExecutionFailureMessage(input, failureMessage),
      type:
        failureKind === "permanent"
          ? "COBRANCAS_PROCESS_ITEM_PERMANENT_ACTIVITY_FAILURE"
          : "COBRANCAS_PROCESS_ITEM_ACTIVITY_RETRY_EXHAUSTED",
      nonRetryable: failureKind === "permanent",
      ...(error instanceof Error ? { cause: error } : {}),
    });
  }
}

function buildExecutionContext(
  runtimePolicy: ReturnType<typeof normalizeAutomationRuntimePolicy>,
): EquipmentRetrievalVerificationActivityExecutionContext {
  const info = workflowInfo();

  return {
    workflowId: info.workflowId,
    workflowName: info.workflowType,
    idempotencyScope: runtimePolicy.idempotencyScope,
  };
}

function buildSuccessResult(
  input: EquipmentRetrievalVerificationProcessItemWorkflowInput,
  executionContext: EquipmentRetrievalVerificationActivityExecutionContext,
  result: Extract<EquipmentRetrievalVerificationCreateOrderActivityResult, { status: "success" }>,
): EquipmentRetrievalVerificationProcessItemWorkflowResult {
  log.info("Equipment retrieval verification child created the verification order", {
    requestId: input.requestId,
    workflowId: executionContext.workflowId,
    idReceber: input.item.idReceber,
    idCobranca: input.item.idCobranca,
    createdServiceOrderId: result.data.createdServiceOrderId,
  });

  return {
    requestId: input.requestId,
    status: "order-created",
    item: input.item,
    createdServiceOrderId: result.data.createdServiceOrderId,
    recordedAt: result.data.recordedAt,
  };
}

function buildPermanentFailureResult(
  input: EquipmentRetrievalVerificationProcessItemWorkflowInput,
  executionContext: EquipmentRetrievalVerificationActivityExecutionContext,
  result: EquipmentRetrievalVerificationCreateOrderActivityFailureResult & {
    failureType: "permanent";
  },
): EquipmentRetrievalVerificationProcessItemWorkflowResult {
  log.warn("Equipment retrieval verification child finished with permanent business failure", {
    requestId: input.requestId,
    workflowId: executionContext.workflowId,
    idReceber: input.item.idReceber,
    idCobranca: input.item.idCobranca,
    failureType: result.failureType,
    failureMessage: result.message,
  });

  return {
    requestId: input.requestId,
    status: "permanent-failure",
    item: input.item,
    failureMessage: result.message,
  };
}

function buildNonTerminalFailure(
  input: EquipmentRetrievalVerificationProcessItemWorkflowInput,
  result: EquipmentRetrievalVerificationCreateOrderActivityFailureResult,
): ApplicationFailure {
  return ApplicationFailure.retryable(
    buildExecutionFailureMessage(input, result.message),
    readCreateOrderFailureCode(result.failureType),
  );
}

function readCreateOrderFailureCode(
  failureType: EquipmentRetrievalVerificationCreateOrderActivityFailureResult["failureType"],
): string {
  switch (failureType) {
    case "pending":
      return "COBRANCAS_PROCESS_ITEM_PENDING_CONFIRMATION";
    case "response-error":
      return "COBRANCAS_PROCESS_ITEM_RESPONSE_ERROR";
    case "html":
      return "COBRANCAS_PROCESS_ITEM_HTML_RESPONSE";
    case "permanent":
      return "COBRANCAS_PROCESS_ITEM_PERMANENT_FAILURE";
  }
}

function isPermanentCreateOrderFailure(
  result: EquipmentRetrievalVerificationCreateOrderActivityResult,
): result is EquipmentRetrievalVerificationCreateOrderActivityFailureResult & {
  failureType: "permanent";
} {
  return result.status === "failure" && result.failureType === "permanent";
}

function buildExecutionFailureMessage(
  input: EquipmentRetrievalVerificationProcessItemWorkflowInput,
  failureMessage: string,
): string {
  return (
    `Equipment retrieval verification child workflow failed for idReceber ${input.item.idReceber}: ` +
    failureMessage
  );
}

function classifyActivityFailureKind(error: unknown): "transient" | "permanent" {
  const causeError = findRootApplicationFailure(error);
  const workflowError = typeof error === "object" && error !== null ? error : null;

  if (causeError !== null) {
    return causeError.nonRetryable || causeError.type === "PermanentIntegrationError"
      ? "permanent"
      : "transient";
  }

  if (workflowError instanceof ApplicationFailure) {
    return workflowError.nonRetryable || workflowError.type === "PermanentIntegrationError"
      ? "permanent"
      : "transient";
  }

  return "transient";
}

function readExecutionFailureMessage(error: unknown): string {
  return readWorkflowFailureMessage(
    error,
    "Equipment retrieval verification child failed with an unknown error",
  );
}
