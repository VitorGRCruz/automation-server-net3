import type {
  ForwardServiceOrderOnFailureActivityInput,
  ForwardServiceOrderOnFailureFailureType,
  ForwardServiceOrderOnFailureActivityResult,
} from "../../../domain/csat/csat-start-survey.types.js";
import {
  CSAT_FORWARD_FAILURE_SECTOR_ID,
  CSAT_FORWARD_FAILURE_STATUS,
} from "../../../domain/csat/csat-start-survey.types.js";
import {
  PermanentIntegrationError,
  TransientIntegrationError,
  isPermanentIntegrationError,
  isTransientIntegrationError,
} from "../../../domain/shared/integration-error.types.js";
import { getSharedSystemDbClient } from "../../../infra/system-db/system-db.client.js";
import {
  markWorkflowStepIdempotencyCompleted,
  markWorkflowStepIdempotencyFailed,
  reserveWorkflowStepIdempotency,
} from "../../../infra/system-db/workflow-step-idempotency.repository.js";
import { createIxcClient } from "../../../integrations/ixc/ixc.client.js";
import { parseIxcMutationResponse } from "../../../integrations/ixc/ixc-mutation-response.js";
import type { ChangeServiceOrderSectorResponse } from "../../../integrations/ixc/ixc.types.js";
import {
  buildCsatDurableIdempotencyKey,
  buildCsatDurablePayloadHash,
} from "./csat-durable-idempotency.js";
import { scopeActivityIdempotencyParts } from "../shared/activity-idempotency-scope.js";

const FORWARD_SERVICE_ORDER_STEP_NAME = "csat-forward-service-order-on-failure";
const PENDING_ATTEMPT_MESSAGE =
  "CSAT service order forwarding is awaiting confirmation from a previous attempt";
const HTML_RESPONSE_MESSAGE =
  "IXC returned text/html while forwarding the CSAT service order";
const RESPONSE_ERROR_MESSAGE =
  "IXC returned type=error while forwarding the CSAT service order";
const FORWARD_SERVICE_ORDER_MUTATION_CONTEXT = {
  errorCodePrefix: "CSAT_FORWARD_SERVICE_ORDER",
  operationLabel: "IXC forward service order step",
} as const;

/**
 * Reusable terminal step for CSAT failures that need to move the OS to the fallback sector in IXC.
 * Retries stay under Temporal retry policy to avoid ad-hoc retry loops around a mutating action.
 */
export async function forwardServiceOrderOnFailureActivity(
  input: ForwardServiceOrderOnFailureActivityInput,
): Promise<ForwardServiceOrderOnFailureActivityResult> {
  const validatedInput = validateForwardInput(input);
  const systemDbClient = getSharedSystemDbClient();

  const idempotencyKey = buildCsatDurableIdempotencyKey(
    scopeActivityIdempotencyParts(
      [
        validatedInput.executionContext.workflowId,
        String(validatedInput.idOs),
        validatedInput.failureMessage,
        CSAT_FORWARD_FAILURE_SECTOR_ID,
        CSAT_FORWARD_FAILURE_STATUS,
      ],
      validatedInput.executionContext.idempotencyScope,
    ),
  );
  const reservation = await reserveWorkflowStepIdempotency(systemDbClient, {
    workflowName: validatedInput.executionContext.workflowName,
    workflowId: validatedInput.executionContext.workflowId,
    stepName: FORWARD_SERVICE_ORDER_STEP_NAME,
    idempotencyKey,
    requestId: validatedInput.requestId,
    payloadHash: buildCsatDurablePayloadHash({
      idOs: validatedInput.idOs,
      failureMessage: validatedInput.failureMessage,
      sectorId: CSAT_FORWARD_FAILURE_SECTOR_ID,
      status: CSAT_FORWARD_FAILURE_STATUS,
    }),
    parseResult: parseForwardServiceOrderResult,
  });

  if (reservation.reservationStatus === "completed") {
    return reservation.result;
  }

  if (reservation.reservationStatus === "failed") {
    return reservation.result;
  }

  if (reservation.reservationStatus === "pending") {
    return buildForwardFailedResult("pending", PENDING_ATTEMPT_MESSAGE);
  }

  const { leaseToken } = reservation;
  const ixcClient = createIxcClient();

  try {
    const response = await ixcClient.changeServiceOrderSector({
      idOs: validatedInput.idOs,
      sectorId: CSAT_FORWARD_FAILURE_SECTOR_ID,
      message: validatedInput.failureMessage,
      status: CSAT_FORWARD_FAILURE_STATUS,
    });
    const result = mapForwardServiceOrderResponse(response);

    if (result.status === "success") {
      await markWorkflowStepIdempotencyCompleted(systemDbClient, {
        workflowName: validatedInput.executionContext.workflowName,
        stepName: FORWARD_SERVICE_ORDER_STEP_NAME,
        idempotencyKey,
        leaseToken,
        result,
        externalReference: `sector:${CSAT_FORWARD_FAILURE_SECTOR_ID}`,
      });
    } else {
      await markWorkflowStepIdempotencyFailed(systemDbClient, {
        workflowName: validatedInput.executionContext.workflowName,
        stepName: FORWARD_SERVICE_ORDER_STEP_NAME,
        idempotencyKey,
        leaseToken,
        result,
        externalReference: `sector:${CSAT_FORWARD_FAILURE_SECTOR_ID}`,
      });
    }

    return result;
  } catch (error) {
    if (isPermanentIntegrationError(error)) {
      const result = buildForwardFailedResult("permanent", error.message);

      await markWorkflowStepIdempotencyFailed(systemDbClient, {
        workflowName: validatedInput.executionContext.workflowName,
        stepName: FORWARD_SERVICE_ORDER_STEP_NAME,
        idempotencyKey,
        leaseToken,
        result,
        externalReference: `sector:${CSAT_FORWARD_FAILURE_SECTOR_ID}`,
      });

      return result;
    }

    throw normalizeForwardServiceOrderError(error);
  }
}

function validateForwardInput(
  input: ForwardServiceOrderOnFailureActivityInput,
): ForwardServiceOrderOnFailureActivityInput {
  const requestId = input.requestId.trim();
  const workflowId = input.executionContext.workflowId.trim();
  const workflowName = input.executionContext.workflowName.trim();

  if (requestId.length === 0) {
    throw new PermanentIntegrationError({
      code: "CSAT_FORWARD_SERVICE_ORDER_INVALID_REQUEST_ID",
      message: "CSAT forward service order step requires a non-empty requestId",
    });
  }

  if (workflowId.length === 0) {
    throw new PermanentIntegrationError({
      code: "CSAT_FORWARD_SERVICE_ORDER_INVALID_WORKFLOW_ID",
      message: "CSAT forward service order step requires a non-empty executionContext.workflowId",
    });
  }

  if (workflowName.length === 0) {
    throw new PermanentIntegrationError({
      code: "CSAT_FORWARD_SERVICE_ORDER_INVALID_WORKFLOW_NAME",
      message:
        "CSAT forward service order step requires a non-empty executionContext.workflowName",
    });
  }

  if (!Number.isInteger(input.idOs) || input.idOs <= 0) {
    throw new PermanentIntegrationError({
      code: "CSAT_FORWARD_SERVICE_ORDER_INVALID_ID_OS",
      message: "CSAT forward service order step requires a positive integer idOs",
    });
  }

  const failureMessage = input.failureMessage.trim();

  if (failureMessage.length === 0) {
    throw new PermanentIntegrationError({
      code: "CSAT_FORWARD_SERVICE_ORDER_FAILURE_MESSAGE_REQUIRED",
      message: "CSAT forward service order step requires a non-empty failure message",
    });
  }

  return {
    requestId,
    executionContext: {
      workflowId,
      workflowName,
      ...(input.executionContext.idempotencyScope === undefined
        ? {}
        : { idempotencyScope: input.executionContext.idempotencyScope }),
    },
    idOs: input.idOs,
    failureMessage,
  };
}

function mapForwardServiceOrderResponse(
  response: ChangeServiceOrderSectorResponse,
): ForwardServiceOrderOnFailureActivityResult {
  const parsedResponse = parseIxcMutationResponse(
    response,
    FORWARD_SERVICE_ORDER_MUTATION_CONTEXT,
  );

  if (parsedResponse.responseType === "html") {
    return buildForwardFailedResult("html", HTML_RESPONSE_MESSAGE);
  }

  if (parsedResponse.envelope.type === "error") {
    return buildForwardFailedResult(
      "response-error",
      buildResponseErrorMessage(parsedResponse.envelope.message),
    );
  }

  return {
    status: "success",
    forwardedToSectorId: CSAT_FORWARD_FAILURE_SECTOR_ID,
  };
}

function buildForwardFailedResult(
  failureType: ForwardServiceOrderOnFailureFailureType,
  message: string,
): ForwardServiceOrderOnFailureActivityResult {
  return {
    status: "failed",
    failureType,
    message,
    shouldBeRetriedByNextTrigger: true,
  };
}

function buildResponseErrorMessage(message: string | null): string {
  if (message === null) {
    return RESPONSE_ERROR_MESSAGE;
  }

  return `${RESPONSE_ERROR_MESSAGE}: ${message}`;
}

function normalizeForwardServiceOrderError(error: unknown): Error {
  if (isTransientIntegrationError(error)) {
    return error;
  }

  return new TransientIntegrationError({
    code: "CSAT_FORWARD_SERVICE_ORDER_UNKNOWN_FAILURE",
    message: "CSAT forward service order step failed with an unknown transient condition",
    cause: error,
  });
}

function parseForwardServiceOrderResult(
  value: unknown,
): ForwardServiceOrderOnFailureActivityResult | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.status === "success" && value.forwardedToSectorId === CSAT_FORWARD_FAILURE_SECTOR_ID) {
    return {
      status: "success",
      forwardedToSectorId: CSAT_FORWARD_FAILURE_SECTOR_ID,
    };
  }

  if (
    value.status === "failed" &&
    (value.failureType === "pending" ||
      value.failureType === "response-error" ||
      value.failureType === "html" ||
      value.failureType === "permanent") &&
    typeof value.message === "string" &&
    value.shouldBeRetriedByNextTrigger === true
  ) {
    return buildForwardFailedResult(value.failureType, value.message);
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
