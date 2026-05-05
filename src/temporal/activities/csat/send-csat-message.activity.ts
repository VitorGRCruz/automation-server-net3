import type {
  SendCsatMessageActivityInput,
  SendCsatMessageActivityFailureType,
  SendCsatMessageActivityResult,
} from "../../../domain/csat/csat-start-survey.types.js";
import { CSAT_IXC_OMNICHANNEL_MESSAGE_ID } from "../../../domain/csat/csat-start-survey.types.js";
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
import type { SendWhatsappOmnichannelMessageResponse } from "../../../integrations/ixc/ixc.types.js";
import {
  buildCsatDurableIdempotencyKey,
  buildCsatDurablePayloadHash,
} from "./csat-durable-idempotency.js";
import { scopeActivityIdempotencyParts } from "../shared/activity-idempotency-scope.js";

const SEND_MESSAGE_STEP_NAME = "csat-send-whatsapp";
const PENDING_ATTEMPT_MESSAGE =
  "CSAT message send is awaiting confirmation from a previous attempt";
const HTML_RESPONSE_MESSAGE =
  "IXC returned text/html while sending the CSAT message";
const RESPONSE_ERROR_MESSAGE =
  "IXC returned type=error while sending the CSAT message";
const SEND_MESSAGE_MUTATION_CONTEXT = {
  errorCodePrefix: "CSAT_SEND_MESSAGE",
  operationLabel: "IXC send message step",
} as const;

export async function sendCsatMessageActivity(
  input: SendCsatMessageActivityInput,
): Promise<SendCsatMessageActivityResult> {
  const validatedInput = validateSendCsatMessageInput(input);
  const systemDbClient = getSharedSystemDbClient();

  const idempotencyKey = buildCsatDurableIdempotencyKey(
    scopeActivityIdempotencyParts(
      [
        validatedInput.executionContext.workflowId,
        String(validatedInput.idOs),
        String(validatedInput.idCliente),
        validatedInput.contatoWhatsapp,
        CSAT_IXC_OMNICHANNEL_MESSAGE_ID,
      ],
      validatedInput.executionContext.idempotencyScope,
    ),
  );
  const reservation = await reserveWorkflowStepIdempotency(systemDbClient, {
    workflowName: validatedInput.executionContext.workflowName,
    workflowId: validatedInput.executionContext.workflowId,
    stepName: SEND_MESSAGE_STEP_NAME,
    idempotencyKey,
    requestId: validatedInput.requestId,
    payloadHash: buildCsatDurablePayloadHash({
      idOs: validatedInput.idOs,
      idCliente: validatedInput.idCliente,
      contatoWhatsapp: validatedInput.contatoWhatsapp,
      messageTemplateId: CSAT_IXC_OMNICHANNEL_MESSAGE_ID,
    }),
    parseResult: parseSendCsatMessageResult,
  });

  if (reservation.reservationStatus === "completed") {
    return reservation.result;
  }

  if (reservation.reservationStatus === "failed") {
    return reservation.result;
  }

  if (reservation.reservationStatus === "pending") {
    return buildSendFailureResult("pending", PENDING_ATTEMPT_MESSAGE);
  }

  const { leaseToken } = reservation;
  const ixcClient = createIxcClient();

  try {
    const response = await ixcClient.sendWhatsappOmnichannelMessage({
      idCliente: validatedInput.idCliente,
      contatoWhatsapp: validatedInput.contatoWhatsapp,
      messageTemplateId: CSAT_IXC_OMNICHANNEL_MESSAGE_ID,
    });
    const result = mapSendCsatMessageResponse(response);

    if (result.status === "success") {
      await markWorkflowStepIdempotencyCompleted(systemDbClient, {
        workflowName: validatedInput.executionContext.workflowName,
        stepName: SEND_MESSAGE_STEP_NAME,
        idempotencyKey,
        leaseToken,
        result,
        externalReference: `template:${CSAT_IXC_OMNICHANNEL_MESSAGE_ID}`,
      });
    } else {
      await markWorkflowStepIdempotencyFailed(systemDbClient, {
        workflowName: validatedInput.executionContext.workflowName,
        stepName: SEND_MESSAGE_STEP_NAME,
        idempotencyKey,
        leaseToken,
        result,
        externalReference: `template:${CSAT_IXC_OMNICHANNEL_MESSAGE_ID}`,
      });
    }

    return result;
  } catch (error) {
    if (isPermanentIntegrationError(error)) {
      const result = buildSendFailureResult("permanent", error.message);

      await markWorkflowStepIdempotencyFailed(systemDbClient, {
        workflowName: validatedInput.executionContext.workflowName,
        stepName: SEND_MESSAGE_STEP_NAME,
        idempotencyKey,
        leaseToken,
        result,
        externalReference: `template:${CSAT_IXC_OMNICHANNEL_MESSAGE_ID}`,
      });

      return result;
    }

    throw normalizeSendCsatMessageError(error);
  }
}

function validateSendCsatMessageInput(
  input: SendCsatMessageActivityInput,
): SendCsatMessageActivityInput {
  const requestId = input.requestId.trim();
  const workflowId = input.executionContext.workflowId.trim();
  const workflowName = input.executionContext.workflowName.trim();

  if (requestId.length === 0) {
    throw new PermanentIntegrationError({
      code: "CSAT_SEND_MESSAGE_INVALID_REQUEST_ID",
      message: "CSAT message send step requires a non-empty requestId",
    });
  }

  if (workflowId.length === 0) {
    throw new PermanentIntegrationError({
      code: "CSAT_SEND_MESSAGE_INVALID_WORKFLOW_ID",
      message: "CSAT message send step requires a non-empty executionContext.workflowId",
    });
  }

  if (workflowName.length === 0) {
    throw new PermanentIntegrationError({
      code: "CSAT_SEND_MESSAGE_INVALID_WORKFLOW_NAME",
      message: "CSAT message send step requires a non-empty executionContext.workflowName",
    });
  }

  if (!Number.isInteger(input.idOs) || input.idOs <= 0) {
    throw new PermanentIntegrationError({
      code: "CSAT_SEND_MESSAGE_INVALID_ID_OS",
      message: "CSAT message send step requires a positive integer idOs",
    });
  }

  if (!Number.isInteger(input.idCliente) || input.idCliente <= 0) {
    throw new PermanentIntegrationError({
      code: "CSAT_SEND_MESSAGE_INVALID_ID_CLIENTE",
      message: "CSAT message send step requires a positive integer idCliente",
    });
  }

  const contatoWhatsapp = input.contatoWhatsapp.trim();

  if (!/^55\d{11}$/.test(contatoWhatsapp)) {
    throw new PermanentIntegrationError({
      code: "CSAT_SEND_MESSAGE_INVALID_WHATSAPP_CONTACT",
      message: "CSAT message send step requires a normalized WhatsApp contact in E.164-like format",
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
    idCliente: input.idCliente,
    contatoWhatsapp,
  };
}

function mapSendCsatMessageResponse(
  response: SendWhatsappOmnichannelMessageResponse,
): SendCsatMessageActivityResult {
  const parsedResponse = parseIxcMutationResponse(response, SEND_MESSAGE_MUTATION_CONTEXT);

  if (parsedResponse.responseType === "html") {
    return buildSendFailureResult("html", HTML_RESPONSE_MESSAGE);
  }

  if (parsedResponse.envelope.type === "error") {
    return buildSendFailureResult(
      "response-error",
      buildResponseErrorMessage(parsedResponse.envelope.message),
    );
  }

  return {
    status: "success",
  };
}

function buildSendFailureResult(
  failureType: SendCsatMessageActivityFailureType,
  message: string,
): SendCsatMessageActivityResult {
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

function normalizeSendCsatMessageError(error: unknown): Error {
  if (isTransientIntegrationError(error)) {
    return error;
  }

  return new TransientIntegrationError({
    code: "CSAT_SEND_MESSAGE_UNKNOWN_FAILURE",
    message: "CSAT send message step failed with an unknown transient condition",
    cause: error,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSendCsatMessageResult(value: unknown): SendCsatMessageActivityResult | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.status === "success") {
    return {
      status: "success",
    };
  }

  if (
    value.status === "failure" &&
    (value.failureType === "pending" ||
      value.failureType === "response-error" ||
      value.failureType === "html" ||
      value.failureType === "permanent") &&
    typeof value.message === "string"
  ) {
    return buildSendFailureResult(value.failureType, value.message);
  }

  return null;
}
