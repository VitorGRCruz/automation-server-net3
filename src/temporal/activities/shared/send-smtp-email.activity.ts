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
import { getSharedSmtpScope } from "../../../integrations/smtp/smtp.client.js";
import type {
  SmtpAddressInput,
  SmtpEnvelope,
  SmtpScopeSendInput,
} from "../../../integrations/smtp/smtp.types.js";
import {
  buildSmtpDurableIdempotencyKey,
  buildSmtpDurablePayloadHash,
} from "./smtp-durable-idempotency.js";
import { scopeActivityIdempotencyParts } from "./activity-idempotency-scope.js";

const SEND_SMTP_EMAIL_STEP_NAME = "smtp-send-email";
const PENDING_ATTEMPT_MESSAGE =
  "SMTP email send is awaiting confirmation from a previous attempt";

export interface SmtpActivityExecutionContext {
  workflowId: string;
  workflowName: string;
  idempotencyScope?: string;
}

export interface SendSmtpEmailActivityInput {
  requestId: string;
  executionContext: SmtpActivityExecutionContext;
  idempotencyKey: string;
  message: SmtpScopeSendInput;
}

export interface SendSmtpEmailActivitySuccessData {
  messageId: string;
  accepted: string[];
  rejected: string[];
  pending: string[];
  response: string;
  envelope: SmtpEnvelope;
  sentAt: string;
}

export interface SendSmtpEmailActivitySuccessResult {
  status: "success";
  data: SendSmtpEmailActivitySuccessData;
}

export interface SendSmtpEmailActivityFailureResult {
  status: "failure";
  failureType: "pending" | "permanent";
  code: string;
  message: string;
}

export type SendSmtpEmailActivityResult =
  | SendSmtpEmailActivitySuccessResult
  | SendSmtpEmailActivityFailureResult;

export async function sendSmtpEmailActivity(
  input: SendSmtpEmailActivityInput,
): Promise<SendSmtpEmailActivityResult> {
  const validatedInput = validateSendSmtpEmailActivityInput(input);
  const systemDbClient = getSharedSystemDbClient();
  const idempotencyKey = buildSmtpDurableIdempotencyKey(
    scopeActivityIdempotencyParts(
      [
        validatedInput.executionContext.workflowId,
        validatedInput.idempotencyKey,
      ],
      validatedInput.executionContext.idempotencyScope,
    ),
  );
  const reservation = await reserveWorkflowStepIdempotency(systemDbClient, {
    workflowName: validatedInput.executionContext.workflowName,
    workflowId: validatedInput.executionContext.workflowId,
    stepName: SEND_SMTP_EMAIL_STEP_NAME,
    idempotencyKey,
    requestId: validatedInput.requestId,
    payloadHash: buildSmtpDurablePayloadHash(validatedInput.message),
    parseResult: parseSendSmtpEmailActivityResult,
  });

  if (reservation.reservationStatus === "completed") {
    return reservation.result;
  }

  if (reservation.reservationStatus === "failed") {
    return reservation.result;
  }

  if (reservation.reservationStatus === "pending") {
    return buildSendSmtpEmailFailureResult(
      "pending",
      "SMTP_SEND_PENDING",
      PENDING_ATTEMPT_MESSAGE,
    );
  }

  const { leaseToken } = reservation;
  const smtpScope = getSharedSmtpScope();

  try {
    const sendOutput = await smtpScope.send(validatedInput.message);
    const result: SendSmtpEmailActivitySuccessResult = {
      status: "success",
      data: {
        ...sendOutput,
        sentAt: new Date().toISOString(),
      },
    };

    await markWorkflowStepIdempotencyCompleted(systemDbClient, {
      workflowName: validatedInput.executionContext.workflowName,
      stepName: SEND_SMTP_EMAIL_STEP_NAME,
      idempotencyKey,
      leaseToken,
      result,
      externalReference: sendOutput.messageId,
    });

    return result;
  } catch (error) {
    if (isPermanentIntegrationError(error)) {
      const result = buildSendSmtpEmailFailureResult(
        "permanent",
        error.code,
        error.message,
      );

      await markWorkflowStepIdempotencyFailed(systemDbClient, {
        workflowName: validatedInput.executionContext.workflowName,
        stepName: SEND_SMTP_EMAIL_STEP_NAME,
        idempotencyKey,
        leaseToken,
        result,
      });

      return result;
    }

    throw normalizeSendSmtpEmailActivityError(error);
  }
}

function validateSendSmtpEmailActivityInput(
  input: SendSmtpEmailActivityInput,
): SendSmtpEmailActivityInput {
  const requestId = input.requestId.trim();
  const workflowId = input.executionContext.workflowId.trim();
  const workflowName = input.executionContext.workflowName.trim();
  const idempotencyKey = input.idempotencyKey.trim();

  if (requestId.length === 0) {
    throw new PermanentIntegrationError({
      code: "SMTP_ACTIVITY_INVALID_REQUEST_ID",
      message: "SMTP email activity requires a non-empty requestId",
    });
  }

  if (workflowId.length === 0) {
    throw new PermanentIntegrationError({
      code: "SMTP_ACTIVITY_INVALID_WORKFLOW_ID",
      message:
        "SMTP email activity requires a non-empty executionContext.workflowId",
    });
  }

  if (workflowName.length === 0) {
    throw new PermanentIntegrationError({
      code: "SMTP_ACTIVITY_INVALID_WORKFLOW_NAME",
      message:
        "SMTP email activity requires a non-empty executionContext.workflowName",
    });
  }

  if (idempotencyKey.length === 0) {
    throw new PermanentIntegrationError({
      code: "SMTP_ACTIVITY_INVALID_IDEMPOTENCY_KEY",
      message: "SMTP email activity requires a non-empty idempotencyKey",
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
    idempotencyKey,
    message: normalizeSmtpScopeSendInput(input.message),
  };
}

function normalizeSmtpScopeSendInput(
  input: SendSmtpEmailActivityInput["message"],
): SendSmtpEmailActivityInput["message"] {
  if (typeof input !== "object" || input === null) {
    throw new PermanentIntegrationError({
      code: "SMTP_ACTIVITY_INVALID_MESSAGE",
      message: "SMTP email activity requires a message object",
    });
  }

  return {
    ...(input.from === undefined ? {} : { from: normalizeOptionalText(input.from) }),
    ...(input.to === undefined ? {} : { to: normalizeAddressInput(input.to) }),
    ...(input.cc === undefined ? {} : { cc: normalizeAddressInput(input.cc) }),
    ...(input.bcc === undefined ? {} : { bcc: normalizeAddressInput(input.bcc) }),
    ...(input.replyTo === undefined
      ? {}
      : { replyTo: normalizeAddressInput(input.replyTo) }),
    subject: normalizeRequiredText("message.subject", input.subject),
    ...(input.text === undefined ? {} : { text: normalizeOptionalText(input.text) }),
    ...(input.html === undefined ? {} : { html: normalizeOptionalText(input.html) }),
    ...(input.attachments === undefined
      ? {}
      : { attachments: [...input.attachments] }),
  };
}

function normalizeRequiredText(fieldName: string, value: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new PermanentIntegrationError({
      code: "SMTP_ACTIVITY_INVALID_MESSAGE",
      message: `${fieldName} must not be empty`,
    });
  }

  return normalizedValue;
}

function normalizeOptionalText(value: string): string {
  return value.trim();
}

function normalizeAddressInput(value: SmtpAddressInput): SmtpAddressInput {
  if (typeof value === "string") {
    const normalizedValue = value.trim();

    if (normalizedValue.length === 0) {
      throw new PermanentIntegrationError({
        code: "SMTP_ACTIVITY_INVALID_MESSAGE",
        message: "SMTP email activity requires non-empty recipient addresses",
      });
    }

    return normalizedValue;
  }

  if (Array.isArray(value)) {
    const normalizedValues = value
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    if (normalizedValues.length === 0) {
      throw new PermanentIntegrationError({
        code: "SMTP_ACTIVITY_INVALID_MESSAGE",
        message: "SMTP email activity requires non-empty recipient addresses",
      });
    }

    return normalizedValues.length === 1 ? normalizedValues[0] : normalizedValues;
  }

  return value;
}

function buildSendSmtpEmailFailureResult(
  failureType: SendSmtpEmailActivityFailureResult["failureType"],
  code: string,
  message: string,
): SendSmtpEmailActivityFailureResult {
  return {
    status: "failure",
    failureType,
    code,
    message,
  };
}

function parseSendSmtpEmailActivityResult(
  value: unknown,
): SendSmtpEmailActivityResult | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as Partial<SendSmtpEmailActivityResult>;

  if (candidate.status === "success") {
    const data = candidate.data;

    if (
      typeof data !== "object" ||
      data === null ||
      typeof data.messageId !== "string" ||
      !isStringArray(data.accepted) ||
      !isStringArray(data.rejected) ||
      !isStringArray(data.pending) ||
      typeof data.response !== "string" ||
      !isSmtpEnvelope(data.envelope) ||
      typeof data.sentAt !== "string"
    ) {
      return null;
    }

    return {
      status: "success",
      data: {
        messageId: data.messageId,
        accepted: [...data.accepted],
        rejected: [...data.rejected],
        pending: [...data.pending],
        response: data.response,
        envelope: data.envelope,
        sentAt: data.sentAt,
      },
    };
  }

  if (
    candidate.status === "failure" &&
    (candidate.failureType === "pending" ||
      candidate.failureType === "permanent") &&
    typeof candidate.code === "string" &&
    typeof candidate.message === "string"
  ) {
    return {
      status: "failure",
      failureType: candidate.failureType,
      code: candidate.code,
      message: candidate.message,
    };
  }

  return null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isSmtpEnvelope(value: unknown): value is SmtpEnvelope {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const envelope = value as SmtpEnvelope;

  return (
    (envelope.from === undefined ||
      envelope.from === false ||
      typeof envelope.from === "string") &&
    Array.isArray(envelope.to) &&
    envelope.to.every((item) => typeof item === "string")
  );
}

function normalizeSendSmtpEmailActivityError(error: unknown): Error {
  if (
    isPermanentIntegrationError(error) ||
    isTransientIntegrationError(error)
  ) {
    return error;
  }

  return new TransientIntegrationError({
    code: "SMTP_ACTIVITY_FAILED",
    message: "SMTP email activity failed with an unknown transient condition",
    cause: error,
  });
}
