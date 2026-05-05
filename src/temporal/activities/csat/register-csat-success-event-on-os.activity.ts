import type {
  RegisterCsatSuccessEventOnOsActivityInput,
  RegisterCsatSuccessEventOnOsActivityResult,
} from "../../../domain/csat/csat-start-survey.types.js";
import {
  CSAT_IXC_SUCCESS_EVENT_BILLING_TYPE,
  CSAT_IXC_SUCCESS_EVENT_FINALIZE_PROCESS,
  CSAT_IXC_SUCCESS_EVENT_ID,
  CSAT_IXC_SUCCESS_EVENT_STATUS,
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
import type { RegisterServiceOrderMessageResponse } from "../../../integrations/ixc/ixc.types.js";
import {
  buildCsatDurableIdempotencyKey,
  buildCsatDurablePayloadHash,
} from "./csat-durable-idempotency.js";
import { scopeActivityIdempotencyParts } from "../shared/activity-idempotency-scope.js";

const SUCCESS_EVENT_STEP_NAME = "csat-success-event-on-os";
const PENDING_ATTEMPT_MESSAGE =
  "CSAT success event registration is awaiting confirmation from a previous attempt";
const HTML_RESPONSE_MESSAGE =
  "IXC returned text/html while registering the CSAT success event on the service order";
const RESPONSE_ERROR_MESSAGE =
  "IXC returned type=error while registering the CSAT success event on the service order";
const SUCCESS_EVENT_MUTATION_CONTEXT = {
  errorCodePrefix: "CSAT_REGISTER_SUCCESS_EVENT",
  operationLabel: "IXC success event registration",
} as const;

export async function registerCsatSuccessEventOnOsActivity(
  input: RegisterCsatSuccessEventOnOsActivityInput,
): Promise<RegisterCsatSuccessEventOnOsActivityResult> {
  const validatedInput = validateRegisterSuccessEventInput(input);
  const systemDbClient = getSharedSystemDbClient();

  const idempotencyKey = buildCsatDurableIdempotencyKey(
    scopeActivityIdempotencyParts(
      [
        validatedInput.executionContext.workflowId,
        String(validatedInput.idOs),
        validatedInput.contatoWhatsapp,
        CSAT_IXC_SUCCESS_EVENT_ID,
      ],
      validatedInput.executionContext.idempotencyScope,
    ),
  );
  const reservation = await reserveWorkflowStepIdempotency(systemDbClient, {
    workflowName: validatedInput.executionContext.workflowName,
    workflowId: validatedInput.executionContext.workflowId,
    stepName: SUCCESS_EVENT_STEP_NAME,
    idempotencyKey,
    requestId: validatedInput.requestId,
    payloadHash: buildCsatDurablePayloadHash({
      idOs: validatedInput.idOs,
      contatoWhatsapp: validatedInput.contatoWhatsapp,
      status: CSAT_IXC_SUCCESS_EVENT_STATUS,
      eventId: CSAT_IXC_SUCCESS_EVENT_ID,
      billingType: CSAT_IXC_SUCCESS_EVENT_BILLING_TYPE,
      finalizeProcess: CSAT_IXC_SUCCESS_EVENT_FINALIZE_PROCESS,
    }),
    parseResult: parseRegisterSuccessEventResult,
  });

  if (reservation.reservationStatus === "completed") {
    return reservation.result;
  }

  if (reservation.reservationStatus === "failed") {
    return reservation.result;
  }

  if (reservation.reservationStatus === "pending") {
    return buildFailureResult("transient", PENDING_ATTEMPT_MESSAGE);
  }

  const { leaseToken } = reservation;
  const ixcClient = createIxcClient();

  try {
    const response = await ixcClient.registerServiceOrderMessage({
      idOs: validatedInput.idOs,
      message: validatedInput.contatoWhatsapp,
      status: CSAT_IXC_SUCCESS_EVENT_STATUS,
      eventId: CSAT_IXC_SUCCESS_EVENT_ID,
      billingType: CSAT_IXC_SUCCESS_EVENT_BILLING_TYPE,
      finalizeProcess: CSAT_IXC_SUCCESS_EVENT_FINALIZE_PROCESS,
    });
    const result = mapRegisterSuccessEventResponse(response);

    if (result.status === "success") {
      await markWorkflowStepIdempotencyCompleted(systemDbClient, {
        workflowName: validatedInput.executionContext.workflowName,
        stepName: SUCCESS_EVENT_STEP_NAME,
        idempotencyKey,
        leaseToken,
        result,
        externalReference: `event:${CSAT_IXC_SUCCESS_EVENT_ID}`,
      });
    } else if (result.failureType !== "transient") {
      await markWorkflowStepIdempotencyFailed(systemDbClient, {
        workflowName: validatedInput.executionContext.workflowName,
        stepName: SUCCESS_EVENT_STEP_NAME,
        idempotencyKey,
        leaseToken,
        result,
        externalReference: `event:${CSAT_IXC_SUCCESS_EVENT_ID}`,
      });
    }

    return result;
  } catch (error) {
    const result = classifyRegisterSuccessEventError(error);

    if (result.failureType !== "transient") {
      await markWorkflowStepIdempotencyFailed(systemDbClient, {
        workflowName: validatedInput.executionContext.workflowName,
        stepName: SUCCESS_EVENT_STEP_NAME,
        idempotencyKey,
        leaseToken,
        result,
        externalReference: `event:${CSAT_IXC_SUCCESS_EVENT_ID}`,
      });
    }

    return result;
  }
}

function validateRegisterSuccessEventInput(
  input: RegisterCsatSuccessEventOnOsActivityInput,
): RegisterCsatSuccessEventOnOsActivityInput {
  const requestId = input.requestId.trim();
  const workflowId = input.executionContext.workflowId.trim();
  const workflowName = input.executionContext.workflowName.trim();

  if (requestId.length === 0) {
    throw new PermanentIntegrationError({
      code: "CSAT_REGISTER_SUCCESS_EVENT_INVALID_REQUEST_ID",
      message: "CSAT success event registration requires a non-empty requestId",
    });
  }

  if (workflowId.length === 0) {
    throw new PermanentIntegrationError({
      code: "CSAT_REGISTER_SUCCESS_EVENT_INVALID_WORKFLOW_ID",
      message:
        "CSAT success event registration requires a non-empty executionContext.workflowId",
    });
  }

  if (workflowName.length === 0) {
    throw new PermanentIntegrationError({
      code: "CSAT_REGISTER_SUCCESS_EVENT_INVALID_WORKFLOW_NAME",
      message:
        "CSAT success event registration requires a non-empty executionContext.workflowName",
    });
  }

  if (!Number.isInteger(input.idOs) || input.idOs <= 0) {
    throw new PermanentIntegrationError({
      code: "CSAT_REGISTER_SUCCESS_EVENT_INVALID_ID_OS",
      message: "CSAT success event registration requires a positive integer idOs",
    });
  }

  const contatoWhatsapp = input.contatoWhatsapp.trim();

  if (!/^55\d{11}$/.test(contatoWhatsapp)) {
    throw new PermanentIntegrationError({
      code: "CSAT_REGISTER_SUCCESS_EVENT_INVALID_WHATSAPP_CONTACT",
      message:
        "CSAT success event registration requires a normalized WhatsApp contact in E.164-like format",
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
    contatoWhatsapp,
  };
}

function mapRegisterSuccessEventResponse(
  response: RegisterServiceOrderMessageResponse,
): RegisterCsatSuccessEventOnOsActivityResult {
  const parsedResponse = parseIxcMutationResponse(
    response,
    SUCCESS_EVENT_MUTATION_CONTEXT,
  );

  if (parsedResponse.responseType === "html") {
    return buildFailureResult("html", HTML_RESPONSE_MESSAGE);
  }

  if (parsedResponse.envelope.type === "error") {
    return buildFailureResult(
      "response-error",
      buildResponseErrorMessage(parsedResponse.envelope.message),
    );
  }

  return {
    status: "success",
    recordedAt: new Date().toISOString(),
  };
}

function classifyRegisterSuccessEventError(
  error: unknown,
): RegisterCsatSuccessEventOnOsActivityResult & {
  status: "failure";
} {
  if (isPermanentIntegrationError(error)) {
    return buildFailureResult("permanent", error.message);
  }

  if (isTransientIntegrationError(error)) {
    return buildFailureResult("transient", error.message);
  }

  return buildFailureResult(
    "transient",
    new TransientIntegrationError({
      code: "CSAT_REGISTER_SUCCESS_EVENT_UNKNOWN_FAILURE",
      message: "IXC success event registration failed with an unknown transient condition",
      cause: error,
    }).message,
  );
}

function buildFailureResult(
  failureType: "permanent" | "transient" | "response-error" | "html",
  message: string,
): RegisterCsatSuccessEventOnOsActivityResult & {
  status: "failure";
} {
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

function parseRegisterSuccessEventResult(
  value: unknown,
): RegisterCsatSuccessEventOnOsActivityResult | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.status === "success" && typeof value.recordedAt === "string") {
    return {
      status: "success",
      recordedAt: value.recordedAt,
    };
  }

  if (
    value.status === "failure" &&
    (value.failureType === "permanent" ||
      value.failureType === "transient" ||
      value.failureType === "response-error" ||
      value.failureType === "html") &&
    typeof value.message === "string"
  ) {
    return {
      status: "failure",
      failureType: value.failureType,
      message: value.message,
    };
  }

  return null;
}
