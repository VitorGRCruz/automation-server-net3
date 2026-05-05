import type {
  EquipmentRetrievalVerificationCreateOrderActivityFailureResult,
  EquipmentRetrievalVerificationCreateOrderActivityInput,
  EquipmentRetrievalVerificationCreateOrderActivityResult,
  EquipmentRetrievalVerificationEligibleRecord,
} from "../../../domain/cobrancas/equipment-retrieval-verification.types.js";
import {
  EQUIPMENT_RETRIEVAL_VERIFICATION_CREATE_ORDER_SECTOR_ID,
  EQUIPMENT_RETRIEVAL_VERIFICATION_CREATE_ORDER_STATUS,
  EQUIPMENT_RETRIEVAL_VERIFICATION_CREATE_ORDER_SUBJECT_ID,
} from "../../../domain/cobrancas/equipment-retrieval-verification.types.js";
import {
  PermanentIntegrationError,
  TransientIntegrationError,
  isPermanentIntegrationError,
  isTransientIntegrationError,
} from "../../../domain/shared/integration-error.types.js";
import { stepSuccess } from "../../../domain/shared/step-result.types.js";
import { getSharedSystemDbClient } from "../../../infra/system-db/system-db.client.js";
import {
  markWorkflowStepIdempotencyCompleted,
  markWorkflowStepIdempotencyFailed,
  reserveWorkflowStepIdempotency,
} from "../../../infra/system-db/workflow-step-idempotency.repository.js";
import { createIxcClient } from "../../../integrations/ixc/ixc.client.js";
import { parseIxcMutationResponse } from "../../../integrations/ixc/ixc-mutation-response.js";
import type { CreateServiceOrderResponse } from "../../../integrations/ixc/ixc.types.js";
import {
  buildCobrancasDurableIdempotencyKey,
  buildCobrancasDurablePayloadHash,
} from "./cobrancas-durable-idempotency.js";
import { scopeActivityIdempotencyParts } from "../shared/activity-idempotency-scope.js";

const CREATE_ORDER_STEP_NAME = "cobrancas-create-equipment-retrieval-order";
const PENDING_ATTEMPT_MESSAGE =
  "Equipment retrieval verification order creation is awaiting confirmation from a previous attempt";
const HTML_RESPONSE_MESSAGE =
  "IXC returned text/html while creating the equipment retrieval verification service order";
const RESPONSE_ERROR_MESSAGE =
  "IXC returned type=error while creating the equipment retrieval verification service order";
const CREATE_ORDER_MUTATION_CONTEXT = {
  errorCodePrefix: "COBRANCAS_CREATE_ORDER",
  operationLabel: "IXC equipment retrieval verification order creation",
} as const;

export async function createEquipmentRetrievalVerificationOrderActivity(
  input: EquipmentRetrievalVerificationCreateOrderActivityInput,
): Promise<EquipmentRetrievalVerificationCreateOrderActivityResult> {
  const validatedInput = validateCreateOrderInput(input);
  const systemDbClient = getSharedSystemDbClient();

  const payload = buildCreateServiceOrderPayload(validatedInput.item);
  const idempotencyKey = buildCobrancasDurableIdempotencyKey(
    scopeActivityIdempotencyParts(
      [
        validatedInput.requestId,
        String(validatedInput.item.idReceber),
        String(validatedInput.item.idCobranca),
        EQUIPMENT_RETRIEVAL_VERIFICATION_CREATE_ORDER_SUBJECT_ID,
      ],
      validatedInput.executionContext.idempotencyScope,
    ),
  );
  const reservation = await reserveWorkflowStepIdempotency(systemDbClient, {
    workflowName: validatedInput.executionContext.workflowName,
    workflowId: validatedInput.executionContext.workflowId,
    stepName: CREATE_ORDER_STEP_NAME,
    idempotencyKey,
    requestId: validatedInput.requestId,
    payloadHash: buildCobrancasDurablePayloadHash(payload),
    parseResult: parseCreateOrderActivityResult,
  });

  if (reservation.reservationStatus === "completed") {
    return reservation.result;
  }

  if (reservation.reservationStatus === "failed") {
    return reservation.result;
  }

  if (reservation.reservationStatus === "pending") {
    throw new TransientIntegrationError({
      code: "COBRANCAS_CREATE_ORDER_PENDING_CONFIRMATION",
      message: PENDING_ATTEMPT_MESSAGE,
    });
  }

  const { leaseToken } = reservation;
  const ixcClient = createIxcClient();

  try {
    const response = await ixcClient.createServiceOrder(payload);
    const result = mapCreateOrderResponse(response);

    if (result.status === "success") {
      await markWorkflowStepIdempotencyCompleted(systemDbClient, {
        workflowName: validatedInput.executionContext.workflowName,
        stepName: CREATE_ORDER_STEP_NAME,
        idempotencyKey,
        leaseToken,
        result,
        externalReference:
          result.data.createdServiceOrderId === null
            ? `subject:${EQUIPMENT_RETRIEVAL_VERIFICATION_CREATE_ORDER_SUBJECT_ID}`
            : `service-order:${result.data.createdServiceOrderId}`,
      });
    } else {
      await markWorkflowStepIdempotencyFailed(systemDbClient, {
        workflowName: validatedInput.executionContext.workflowName,
        stepName: CREATE_ORDER_STEP_NAME,
        idempotencyKey,
        leaseToken,
        result,
        externalReference: `subject:${EQUIPMENT_RETRIEVAL_VERIFICATION_CREATE_ORDER_SUBJECT_ID}`,
      });
    }

    return result;
  } catch (error) {
    const result = classifyCreateOrderError(error);

    if (result === null) {
      throw normalizeCreateOrderError(error);
    }

    await markWorkflowStepIdempotencyFailed(systemDbClient, {
      workflowName: validatedInput.executionContext.workflowName,
      stepName: CREATE_ORDER_STEP_NAME,
      idempotencyKey,
      leaseToken,
      result,
      externalReference: `subject:${EQUIPMENT_RETRIEVAL_VERIFICATION_CREATE_ORDER_SUBJECT_ID}`,
    });

    return result;
  }
}

function validateCreateOrderInput(
  input: EquipmentRetrievalVerificationCreateOrderActivityInput,
): EquipmentRetrievalVerificationCreateOrderActivityInput {
  const requestId = input.requestId.trim();
  const workflowId = input.executionContext.workflowId.trim();
  const workflowName = input.executionContext.workflowName.trim();

  if (requestId.length === 0) {
    throw new PermanentIntegrationError({
      code: "COBRANCAS_CREATE_ORDER_INVALID_REQUEST_ID",
      message: "Equipment retrieval verification order creation requires a non-empty requestId",
    });
  }

  if (workflowId.length === 0) {
    throw new PermanentIntegrationError({
      code: "COBRANCAS_CREATE_ORDER_INVALID_WORKFLOW_ID",
      message:
        "Equipment retrieval verification order creation requires a non-empty executionContext.workflowId",
    });
  }

  if (workflowName.length === 0) {
    throw new PermanentIntegrationError({
      code: "COBRANCAS_CREATE_ORDER_INVALID_WORKFLOW_NAME",
      message:
        "Equipment retrieval verification order creation requires a non-empty executionContext.workflowName",
    });
  }

  validateEligibleRecord(input.item);

  return {
    requestId,
    executionContext: {
      workflowId,
      workflowName,
      ...(input.executionContext.idempotencyScope === undefined
        ? {}
        : { idempotencyScope: input.executionContext.idempotencyScope }),
    },
    item: input.item,
  };
}

function validateEligibleRecord(item: EquipmentRetrievalVerificationEligibleRecord): void {
  for (const [fieldName, value] of Object.entries(item)) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new PermanentIntegrationError({
        code: "COBRANCAS_CREATE_ORDER_INVALID_ITEM",
        message: `Equipment retrieval verification order creation requires a positive integer for ${fieldName}`,
      });
    }
  }
}

function buildCreateServiceOrderPayload(item: EquipmentRetrievalVerificationEligibleRecord) {
  return {
    type: "C",
    serviceOrderSubjectId: EQUIPMENT_RETRIEVAL_VERIFICATION_CREATE_ORDER_SUBJECT_ID,
    idCliente: item.idCliente,
    idFilial: item.idFilial,
    idContratoKit: item.idContratoKit,
    addressOrigin: "C",
    priority: "A",
    sectorId: EQUIPMENT_RETRIEVAL_VERIFICATION_CREATE_ORDER_SECTOR_ID,
    message:
      `EXECUCAO AUTOMATICA COBRANCA # ${item.idCobranca} - ` +
      `CONFERIR O.S DE RETIRADA DE EQUIPAMENTOS ID: ${item.idOsRetirada}`,
    status: EQUIPMENT_RETRIEVAL_VERIFICATION_CREATE_ORDER_STATUS,
    bestScheduleWindow: "Q",
    released: "1",
    idReceber: item.idReceber,
    idCidade: item.idCidade,
  };
}

function mapCreateOrderResponse(
  response: CreateServiceOrderResponse,
): EquipmentRetrievalVerificationCreateOrderActivityResult {
  const parsedResponse = parseIxcMutationResponse(response, CREATE_ORDER_MUTATION_CONTEXT);

  if (parsedResponse.responseType === "html") {
    return buildFailureResult("html", HTML_RESPONSE_MESSAGE);
  }

  if (parsedResponse.envelope.type === "error") {
    return buildFailureResult(
      "response-error",
      buildResponseErrorMessage(parsedResponse.envelope.message),
    );
  }

  return stepSuccess({
    createdServiceOrderId: parsedResponse.envelope.id,
    recordedAt: new Date().toISOString(),
  });
}

function classifyCreateOrderError(
  error: unknown,
): EquipmentRetrievalVerificationCreateOrderActivityFailureResult | null {
  if (isPermanentIntegrationError(error)) {
    return buildFailureResult("permanent", error.message);
  }

  if (isTransientIntegrationError(error)) {
    return null;
  }

  return null;
}

function normalizeCreateOrderError(error: unknown): Error {
  if (isTransientIntegrationError(error)) {
    return error;
  }

  return new TransientIntegrationError({
    code: "COBRANCAS_CREATE_ORDER_UNKNOWN_FAILURE",
    message:
      "Equipment retrieval verification order creation failed with an unknown transient condition",
    cause: error,
  });
}

function buildFailureResult(
  failureType: "pending" | "response-error" | "html" | "permanent",
  message: string,
): EquipmentRetrievalVerificationCreateOrderActivityFailureResult {
  return {
    status: "failure",
    failureType,
    message,
  };
}

function buildResponseErrorMessage(message: string | null): string {
  if (message === null) {
    return RESPONSE_ERROR_MESSAGE;
  }

  return `${RESPONSE_ERROR_MESSAGE}: ${message}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseCreateOrderActivityResult(
  value: unknown,
): EquipmentRetrievalVerificationCreateOrderActivityResult | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    value.status === "success" &&
    "data" in value &&
    isRecord(value.data) &&
    typeof value.data.recordedAt === "string" &&
    readCreatedServiceOrderId(value.data) !== undefined
  ) {
    return stepSuccess({
      createdServiceOrderId: readCreatedServiceOrderId(value.data) ?? null,
      recordedAt: value.data.recordedAt,
    });
  }

  if (
    value.status === "failure" &&
    (value.failureType === "pending" ||
      value.failureType === "response-error" ||
      value.failureType === "html" ||
      value.failureType === "permanent") &&
    typeof value.message === "string"
  ) {
    return buildFailureResult(value.failureType, value.message);
  }

  return null;
}

function readCreatedServiceOrderId(
  value: Record<string, unknown>,
): string | number | null | undefined {
  if (!("createdServiceOrderId" in value)) {
    return null;
  }

  const createdServiceOrderId = value.createdServiceOrderId;

  if (
    createdServiceOrderId === null ||
    typeof createdServiceOrderId === "string" ||
    typeof createdServiceOrderId === "number"
  ) {
    return createdServiceOrderId;
  }

  return undefined;
}
