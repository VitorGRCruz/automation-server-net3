import { PermanentIntegrationError } from "../../domain/shared/integration-error.types.js";
import type { IxcApiResponse, IxcMutationEnvelope } from "./ixc.types.js";

export interface IxcMutationResponseContext {
  errorCodePrefix: string;
  operationLabel: string;
}

export interface IxcParsedMutationEnvelope {
  type: "success" | "error";
  message: string | null;
  id: string | number | null;
}

export type IxcParsedMutationResponse =
  | {
      responseType: "html";
    }
  | {
      responseType: "json";
      envelope: IxcParsedMutationEnvelope;
    };

export function parseIxcMutationResponse(
  response: IxcApiResponse,
  context: IxcMutationResponseContext,
): IxcParsedMutationResponse {
  if (response.responseType === "html") {
    return {
      responseType: "html",
    };
  }

  return {
    responseType: "json",
    envelope: readIxcMutationEnvelope(response.body, context),
  };
}

function readIxcMutationEnvelope(
  body: unknown,
  context: IxcMutationResponseContext,
): IxcParsedMutationEnvelope {
  if (!isRecord(body)) {
    throw buildMutationResponseError(
      context,
      "INVALID_BODY",
      `${context.operationLabel} returned an invalid JSON body`,
    );
  }

  const envelope = body as IxcMutationEnvelope;

  if (envelope.type !== "success" && envelope.type !== "error") {
    throw buildMutationResponseError(
      context,
      "INVALID_TYPE",
      `${context.operationLabel} returned an unsupported response type`,
    );
  }

  if (envelope.message !== undefined && typeof envelope.message !== "string") {
    throw buildMutationResponseError(
      context,
      "INVALID_MESSAGE",
      `${context.operationLabel} returned an invalid message field`,
    );
  }

  if (
    envelope.id !== undefined &&
    typeof envelope.id !== "string" &&
    typeof envelope.id !== "number"
  ) {
    throw buildMutationResponseError(
      context,
      "INVALID_ID",
      `${context.operationLabel} returned an invalid id field`,
    );
  }

  return {
    type: envelope.type,
    message: readEnvelopeMessage(envelope.message),
    id:
      envelope.id === undefined || envelope.id === null
        ? null
        : (envelope.id as string | number),
  };
}

function buildMutationResponseError(
  context: IxcMutationResponseContext,
  codeSuffix: string,
  message: string,
): PermanentIntegrationError {
  return new PermanentIntegrationError({
    code: `${context.errorCodePrefix}_${codeSuffix}`,
    message,
  });
}

function readEnvelopeMessage(message: unknown): string | null {
  if (typeof message !== "string") {
    return null;
  }

  const normalizedMessage = message.trim();

  return normalizedMessage.length > 0 ? normalizedMessage : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
