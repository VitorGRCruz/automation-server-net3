import type {
  ClaimNfeEmailDispatchSaleActivityInput,
  ClaimNfeEmailDispatchSaleActivityResult,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import {
  PermanentIntegrationError,
  TransientIntegrationError,
  isIntegrationError,
} from "../../../domain/shared/integration-error.types.js";
import { claimNfeEmailDispatchSale } from "../../../infra/system-db/nfe-email-dispatch.repository.js";
import { getSharedSystemDbClient } from "../../../infra/system-db/system-db.client.js";
import { resolveActivityRuntimeScope } from "../shared/activity-idempotency-scope.js";

export async function claimNfeEmailDispatchSaleActivity(
  input: ClaimNfeEmailDispatchSaleActivityInput,
): Promise<ClaimNfeEmailDispatchSaleActivityResult> {
  const validatedInput = validateClaimNfeEmailDispatchSaleActivityInput(input);
  const systemDbClient = getSharedSystemDbClient();

  try {
    const result = await claimNfeEmailDispatchSale(systemDbClient, {
      saleId: validatedInput.nfeEmailDispatchSaleId,
      attemptStartedAt: validatedInput.attemptStartedAt,
      maxSendAttempts: validatedInput.maxSendAttempts,
      runtimeScope: validatedInput.runtimeScope,
    });

    switch (result.status) {
      case "claimed":
        return {
          status: "CLAIMED",
          attemptCount: result.attemptCount,
        };
      case "already-claimed-by-this-attempt":
        return {
          status: "ALREADY_CLAIMED_BY_THIS_ATTEMPT",
          attemptCount: result.attemptCount,
        };
      case "skipped":
        return {
          status: "SKIPPED",
        };
    }
  } catch (error) {
    throw normalizeClaimNfeEmailDispatchSaleError(error);
  }
}

function validateClaimNfeEmailDispatchSaleActivityInput(
  input: ClaimNfeEmailDispatchSaleActivityInput,
): ClaimNfeEmailDispatchSaleActivityInput {
  if (
    !Number.isInteger(input.nfeEmailDispatchSaleId) ||
    input.nfeEmailDispatchSaleId <= 0
  ) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_SALE_ID",
      message: "NF-e claim activity requires a positive nfeEmailDispatchSaleId",
    });
  }

  if (
    !Number.isInteger(input.maxSendAttempts) ||
    input.maxSendAttempts <= 0
  ) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_MAX_ATTEMPTS",
      message: "NF-e claim activity requires a positive maxSendAttempts",
    });
  }

  const attemptStartedAt = input.attemptStartedAt.trim();

  if (attemptStartedAt.length === 0) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_ATTEMPT_STARTED_AT",
      message: "NF-e claim activity requires a non-empty attemptStartedAt",
    });
  }

  return {
    nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
    attemptStartedAt,
    maxSendAttempts: input.maxSendAttempts,
    runtimeScope: resolveActivityRuntimeScope(input.runtimeScope),
  };
}

function normalizeClaimNfeEmailDispatchSaleError(error: unknown): Error {
  if (isIntegrationError(error)) {
    return error;
  }

  return new TransientIntegrationError({
    code: "NFE_EMAIL_DISPATCH_CLAIM_FAILED",
    message: "NF-e claim failed with an unknown transient error",
    cause: error,
  });
}
