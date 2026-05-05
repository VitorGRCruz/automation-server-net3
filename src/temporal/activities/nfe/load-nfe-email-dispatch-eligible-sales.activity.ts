import type {
  LoadNfeEmailDispatchEligibleSalesActivityInput,
  NfeEmailDispatchSaleToProcess,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import {
  PermanentIntegrationError,
  TransientIntegrationError,
  isIntegrationError,
} from "../../../domain/shared/integration-error.types.js";
import { loadEligibleNfeEmailDispatchSales } from "../../../infra/system-db/nfe-email-dispatch.repository.js";
import { getSharedSystemDbClient } from "../../../infra/system-db/system-db.client.js";
import { resolveActivityRuntimeScope } from "../shared/activity-idempotency-scope.js";

export async function loadNfeEmailDispatchEligibleSalesActivity(
  input: LoadNfeEmailDispatchEligibleSalesActivityInput,
): Promise<NfeEmailDispatchSaleToProcess[]> {
  const validatedInput = validateLoadNfeEmailDispatchEligibleSalesActivityInput(input);
  const systemDbClient = getSharedSystemDbClient();

  try {
    return await loadEligibleNfeEmailDispatchSales(systemDbClient, {
      maxSendAttempts: validatedInput.maxSendAttempts,
      runtimeScope: validatedInput.runtimeScope,
    });
  } catch (error) {
    throw normalizeLoadNfeEmailDispatchEligibleSalesError(error);
  }
}

function validateLoadNfeEmailDispatchEligibleSalesActivityInput(
  input: LoadNfeEmailDispatchEligibleSalesActivityInput,
): LoadNfeEmailDispatchEligibleSalesActivityInput {
  if (
    !Number.isInteger(input.maxSendAttempts) ||
    input.maxSendAttempts <= 0
  ) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_MAX_ATTEMPTS",
      message: "NF-e eligible-sales activity requires a positive maxSendAttempts",
    });
  }

  return {
    maxSendAttempts: input.maxSendAttempts,
    runtimeScope: resolveActivityRuntimeScope(input.runtimeScope),
  };
}

function normalizeLoadNfeEmailDispatchEligibleSalesError(error: unknown): Error {
  if (isIntegrationError(error)) {
    return error;
  }

  return new TransientIntegrationError({
    code: "NFE_EMAIL_DISPATCH_LOAD_ELIGIBLE_SALES_FAILED",
    message:
      "NF-e eligible-sales load failed with an unknown transient error",
    cause: error,
  });
}
