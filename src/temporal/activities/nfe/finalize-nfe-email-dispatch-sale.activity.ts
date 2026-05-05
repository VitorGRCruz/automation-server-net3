import type {
  FinalizeNfeEmailDispatchSaleActivityInput,
  FinalizeNfeEmailDispatchSaleActivityResult,
  NfeEmailDispatchFinalizationStatus,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import {
  PermanentIntegrationError,
  TransientIntegrationError,
  isIntegrationError,
} from "../../../domain/shared/integration-error.types.js";
import {
  finalizeNfeEmailDispatchSale,
  type NfeEmailDispatchSaleStatusSnapshot,
} from "../../../infra/system-db/nfe-email-dispatch.repository.js";
import { getSharedSystemDbClient } from "../../../infra/system-db/system-db.client.js";
import { resolveActivityRuntimeScope } from "../shared/activity-idempotency-scope.js";

export async function finalizeNfeEmailDispatchSaleActivity(
  input: FinalizeNfeEmailDispatchSaleActivityInput,
): Promise<FinalizeNfeEmailDispatchSaleActivityResult> {
  const validatedInput = validateFinalizeNfeEmailDispatchSaleActivityInput(input);
  const systemDbClient = getSharedSystemDbClient();
  const finalStatus = resolveEffectiveFinalStatus(validatedInput);

  try {
    const result = await finalizeNfeEmailDispatchSale(systemDbClient, {
      saleId: validatedInput.nfeEmailDispatchSaleId,
      attemptStartedAt: validatedInput.attemptStartedAt,
      finalStatus,
      runtimeScope: validatedInput.runtimeScope,
      ...(validatedInput.errorMessage === undefined
        ? {}
        : { errorMessage: validatedInput.errorMessage }),
      ...(finalStatus === "SENT" ? { sentAt: new Date() } : {}),
    });

    const snapshot = result.snapshot;

    if (result.status === "noop") {
      ensureIdempotentFinalization(snapshot, finalStatus);
    }

    return {
      nfeEmailDispatchSaleId: validatedInput.nfeEmailDispatchSaleId,
      status: finalStatus,
      attemptCount: validatedInput.attemptCount,
      ...(validatedInput.errorMessage === undefined
        ? {}
        : { errorMessage: validatedInput.errorMessage }),
      ...(finalStatus === "SENT"
        ? { sentAt: snapshot?.sentAt ?? new Date().toISOString() }
        : {}),
    };
  } catch (error) {
    throw normalizeFinalizeNfeEmailDispatchSaleError(error);
  }
}

function validateFinalizeNfeEmailDispatchSaleActivityInput(
  input: FinalizeNfeEmailDispatchSaleActivityInput,
): FinalizeNfeEmailDispatchSaleActivityInput {
  if (
    !Number.isInteger(input.nfeEmailDispatchSaleId) ||
    input.nfeEmailDispatchSaleId <= 0
  ) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_SALE_ID",
      message:
        "NF-e finalization activity requires a positive nfeEmailDispatchSaleId",
    });
  }

  if (!Number.isInteger(input.attemptCount) || input.attemptCount <= 0) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_ATTEMPT_COUNT",
      message: "NF-e finalization activity requires a positive attemptCount",
    });
  }

  if (
    !Number.isInteger(input.maxSendAttempts) ||
    input.maxSendAttempts <= 0
  ) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_MAX_ATTEMPTS",
      message:
        "NF-e finalization activity requires a positive maxSendAttempts",
    });
  }

  const attemptStartedAt = input.attemptStartedAt.trim();

  if (attemptStartedAt.length === 0) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_ATTEMPT_STARTED_AT",
      message:
        "NF-e finalization activity requires a non-empty attemptStartedAt",
    });
  }

  return {
    nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
    attemptStartedAt,
    attemptCount: input.attemptCount,
    maxSendAttempts: input.maxSendAttempts,
    status: input.status,
    runtimeScope: resolveActivityRuntimeScope(input.runtimeScope),
    ...(input.errorMessage?.trim()
      ? { errorMessage: input.errorMessage.trim() }
      : {}),
  };
}

function resolveEffectiveFinalStatus(
  input: FinalizeNfeEmailDispatchSaleActivityInput,
): NfeEmailDispatchFinalizationStatus {
  if (
    input.status === "FAILED_TRANSIENT" &&
    input.attemptCount >= input.maxSendAttempts
  ) {
    return "FAILED_FINAL";
  }

  return input.status;
}

function ensureIdempotentFinalization(
  snapshot: NfeEmailDispatchSaleStatusSnapshot | null,
  expectedStatus: NfeEmailDispatchFinalizationStatus,
): void {
  if (snapshot === null) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_FINALIZATION_RECORD_NOT_FOUND",
      message:
        "NF-e finalization could not confirm idempotency because the sale record no longer exists",
    });
  }

  if (snapshot.status !== expectedStatus) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_FINALIZATION_STATUS_MISMATCH",
      message:
        "NF-e finalization could not confirm idempotency because the current status differs from the expected status",
    });
  }

  if (expectedStatus === "SENT" && snapshot.sentAt === null) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_FINALIZATION_SENT_AT_MISSING",
      message:
        "NF-e finalization expected SENT with sentAt filled, but the current record is incomplete",
    });
  }
}

function normalizeFinalizeNfeEmailDispatchSaleError(error: unknown): Error {
  if (isIntegrationError(error)) {
    return error;
  }

  return new TransientIntegrationError({
    code: "NFE_EMAIL_DISPATCH_FINALIZATION_FAILED",
    message:
      "NF-e finalization failed with an unknown transient error",
    cause: error,
  });
}
