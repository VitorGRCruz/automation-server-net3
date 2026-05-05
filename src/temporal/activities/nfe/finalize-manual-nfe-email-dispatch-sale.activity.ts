import type {
  FinalizeManualNfeEmailDispatchSaleActivityInput,
  FinalizeManualNfeEmailDispatchSaleActivityResult,
  NfeEmailDispatchFinalizationStatus,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import {
  PermanentIntegrationError,
  TransientIntegrationError,
  isIntegrationError,
} from "../../../domain/shared/integration-error.types.js";
import {
  finalizeNfeEmailDispatchSaleDirect,
  type FinalizeNfeEmailDispatchSaleDirectResult,
} from "../../../infra/system-db/nfe-email-dispatch.repository.js";
import { getSharedSystemDbClient } from "../../../infra/system-db/system-db.client.js";
import { resolveActivityRuntimeScope } from "../shared/activity-idempotency-scope.js";

export async function finalizeManualNfeEmailDispatchSaleActivity(
  input: FinalizeManualNfeEmailDispatchSaleActivityInput,
): Promise<FinalizeManualNfeEmailDispatchSaleActivityResult> {
  const validatedInput = validateInput(input);
  const systemDbClient = getSharedSystemDbClient();
  const finalStatus = resolveEffectiveFinalStatus(validatedInput);

  try {
    const result = await finalizeNfeEmailDispatchSaleDirect(systemDbClient, {
      saleId: validatedInput.nfeEmailDispatchSaleId,
      expectedStatus: validatedInput.expectedStatus,
      expectedAttemptCount: validatedInput.expectedAttemptCount,
      attemptStartedAt: validatedInput.attemptStartedAt,
      finalStatus,
      runtimeScope: validatedInput.runtimeScope,
      ...(validatedInput.errorMessage === undefined
        ? {}
        : { errorMessage: validatedInput.errorMessage }),
      ...(finalStatus === "SENT" ? { sentAt: new Date() } : {}),
    });

    return mapResult(validatedInput.nfeEmailDispatchSaleId, finalStatus, result);
  } catch (error) {
    throw normalizeFinalizeManualSaleError(error);
  }
}

function validateInput(
  input: FinalizeManualNfeEmailDispatchSaleActivityInput,
): FinalizeManualNfeEmailDispatchSaleActivityInput & {
  runtimeScope: string;
} {
  if (
    !Number.isInteger(input.nfeEmailDispatchSaleId) ||
    input.nfeEmailDispatchSaleId <= 0
  ) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_MANUAL_FINALIZATION_INVALID_SALE_ID",
      message:
        "NF-e manual finalization activity requires a positive nfeEmailDispatchSaleId",
    });
  }

  if (
    !Number.isInteger(input.expectedAttemptCount) ||
    input.expectedAttemptCount < 0
  ) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_MANUAL_FINALIZATION_INVALID_ATTEMPT_COUNT",
      message:
        "NF-e manual finalization activity requires a zero or positive expectedAttemptCount",
    });
  }

  if (
    !Number.isInteger(input.maxSendAttempts) ||
    input.maxSendAttempts <= 0
  ) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_MANUAL_FINALIZATION_INVALID_MAX_ATTEMPTS",
      message:
        "NF-e manual finalization activity requires a positive maxSendAttempts",
    });
  }

  const attemptStartedAt = input.attemptStartedAt.trim();

  if (attemptStartedAt.length === 0) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_MANUAL_FINALIZATION_INVALID_ATTEMPT_STARTED_AT",
      message:
        "NF-e manual finalization activity requires a non-empty attemptStartedAt",
    });
  }

  return {
    nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
    expectedStatus: input.expectedStatus,
    expectedAttemptCount: input.expectedAttemptCount,
    attemptStartedAt,
    maxSendAttempts: input.maxSendAttempts,
    status: input.status,
    runtimeScope: resolveActivityRuntimeScope(input.runtimeScope),
    ...(input.errorMessage?.trim()
      ? { errorMessage: input.errorMessage.trim() }
      : {}),
  };
}

function resolveEffectiveFinalStatus(
  input: FinalizeManualNfeEmailDispatchSaleActivityInput & {
    runtimeScope: string;
  },
): NfeEmailDispatchFinalizationStatus {
  if (
    input.status === "FAILED_TRANSIENT" &&
    input.expectedAttemptCount + 1 >= input.maxSendAttempts
  ) {
    return "FAILED_FINAL";
  }

  return input.status;
}

function mapResult(
  nfeEmailDispatchSaleId: number,
  finalStatus: NfeEmailDispatchFinalizationStatus,
  result: FinalizeNfeEmailDispatchSaleDirectResult,
): FinalizeManualNfeEmailDispatchSaleActivityResult {
  switch (result.status) {
    case "finalized":
      return {
        nfeEmailDispatchSaleId,
        status: finalStatus,
        attemptCount: result.snapshot.attemptCount,
        ...(result.snapshot.lastErrorMessage === null
          ? {}
          : { errorMessage: result.snapshot.lastErrorMessage }),
        ...(result.snapshot.sentAt === null ? {} : { sentAt: result.snapshot.sentAt }),
      };
    case "not-found":
      throw new PermanentIntegrationError({
        code: "NFE_EMAIL_DISPATCH_MANUAL_FINALIZATION_RECORD_NOT_FOUND",
        message:
          "NF-e manual finalization could not find the sale record during direct persistence",
      });
    case "conflict":
      throw new PermanentIntegrationError({
        code: "NFE_EMAIL_DISPATCH_MANUAL_FINALIZATION_CONFLICT",
        message:
          "NF-e manual finalization detected that the sale changed before the direct persistence step completed",
      });
  }
}

function normalizeFinalizeManualSaleError(error: unknown): Error {
  if (isIntegrationError(error)) {
    return error;
  }

  return new TransientIntegrationError({
    code: "NFE_EMAIL_DISPATCH_MANUAL_FINALIZATION_FAILED",
    message:
      "NF-e manual finalization failed with an unknown transient error",
    cause: error,
  });
}
