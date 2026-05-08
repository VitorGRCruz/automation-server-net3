import type {
  FinalizeManualNfeEmailDispatchSaleActivityInput,
  FinalizeManualNfeEmailDispatchSaleActivityResult,
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

export async function recoverManualNfeEmailDispatchSaleActivity(
  input: FinalizeManualNfeEmailDispatchSaleActivityInput,
): Promise<FinalizeManualNfeEmailDispatchSaleActivityResult> {
  const validatedInput = validateInput(input);
  const systemDbClient = getSharedSystemDbClient();

  try {
    const result = await finalizeNfeEmailDispatchSale(systemDbClient, {
      saleId: validatedInput.nfeEmailDispatchSaleId,
      attemptStartedAt: validatedInput.attemptStartedAt,
      finalStatus: validatedInput.status,
      runtimeScope: validatedInput.runtimeScope,
      ...(validatedInput.errorMessage === undefined
        ? {}
        : { errorMessage: validatedInput.errorMessage }),
      ...(validatedInput.status === "SENT" ? { sentAt: new Date() } : {}),
    });

    return mapSnapshotToFinalizationResult(
      result.snapshot,
      validatedInput.nfeEmailDispatchSaleId,
      validatedInput.attemptCount,
      validatedInput.attemptStartedAt,
    );
  } catch (error) {
    throw normalizeRecoverManualSaleError(error);
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
      code: "NFE_EMAIL_DISPATCH_MANUAL_RECOVERY_INVALID_SALE_ID",
      message:
        "NF-e manual recovery activity requires a positive nfeEmailDispatchSaleId",
    });
  }

  if (!Number.isInteger(input.attemptCount) || input.attemptCount <= 0) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_MANUAL_RECOVERY_INVALID_ATTEMPT_COUNT",
      message:
        "NF-e manual recovery activity requires a positive attemptCount",
    });
  }

  const attemptStartedAt = input.attemptStartedAt.trim();

  if (attemptStartedAt.length === 0) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_MANUAL_RECOVERY_INVALID_ATTEMPT_STARTED_AT",
      message:
        "NF-e manual recovery activity requires a non-empty attemptStartedAt",
    });
  }

  return {
    nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
    attemptStartedAt,
    attemptCount: input.attemptCount,
    status: input.status,
    runtimeScope: resolveActivityRuntimeScope(input.runtimeScope),
    ...(input.errorMessage?.trim()
      ? { errorMessage: input.errorMessage.trim() }
      : {}),
  };
}

function mapSnapshotToFinalizationResult(
  snapshot: NfeEmailDispatchSaleStatusSnapshot | null,
  saleId: number,
  expectedAttemptCount: number,
  expectedAttemptStartedAt: string,
): FinalizeManualNfeEmailDispatchSaleActivityResult {
  if (snapshot === null) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_MANUAL_RECOVERY_RECORD_NOT_FOUND",
      message:
        "NF-e manual recovery could not confirm the current persisted snapshot because the sale record no longer exists",
    });
  }

  if (snapshot.attemptCount !== expectedAttemptCount) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_MANUAL_RECOVERY_ATTEMPT_MISMATCH",
      message:
        "NF-e manual recovery could not confirm the current persisted snapshot because the attemptCount differs from the expected manual attempt",
    });
  }

  if (snapshot.lastAttemptAt !== expectedAttemptStartedAt) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_MANUAL_RECOVERY_ATTEMPT_STARTED_AT_MISMATCH",
      message:
        "NF-e manual recovery could not confirm the current persisted snapshot because the lastAttemptAt differs from the expected manual attempt",
    });
  }

  if (snapshot.status === "IN_PROGRESS" || snapshot.status === "PENDING") {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_MANUAL_RECOVERY_STILL_IN_PROGRESS",
      message:
        `NF-e manual recovery could not resolve sale ${saleId} because the persisted snapshot is still ${snapshot.status}`,
    });
  }

  return {
    nfeEmailDispatchSaleId: saleId,
    status: snapshot.status,
    attemptCount: snapshot.attemptCount,
    ...(snapshot.lastErrorMessage === null
      ? {}
      : { errorMessage: snapshot.lastErrorMessage }),
    ...(snapshot.status === "SENT" && snapshot.sentAt !== null
      ? { sentAt: snapshot.sentAt }
      : {}),
  };
}

function normalizeRecoverManualSaleError(error: unknown): Error {
  if (isIntegrationError(error)) {
    return error;
  }

  return new TransientIntegrationError({
    code: "NFE_EMAIL_DISPATCH_MANUAL_RECOVERY_FAILED",
    message:
      "NF-e manual recovery failed with an unknown transient error",
    cause: error,
  });
}
