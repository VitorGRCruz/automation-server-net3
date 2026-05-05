import type {
  LoadNfeEmailDispatchSaleForManualProcessingActivityInput,
  LoadNfeEmailDispatchSaleForManualProcessingActivityResult,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import {
  PermanentIntegrationError,
  TransientIntegrationError,
  isIntegrationError,
} from "../../../domain/shared/integration-error.types.js";
import { getSharedSystemDbClient } from "../../../infra/system-db/system-db.client.js";
import { findNfeEmailDispatchSaleForManualProcessing } from "../../../infra/system-db/nfe-email-dispatch.repository.js";
import { resolveActivityRuntimeScope } from "../shared/activity-idempotency-scope.js";

export async function loadNfeEmailDispatchSaleForManualProcessingActivity(
  input: LoadNfeEmailDispatchSaleForManualProcessingActivityInput,
): Promise<LoadNfeEmailDispatchSaleForManualProcessingActivityResult> {
  const validatedInput = validateInput(input);
  const systemDbClient = getSharedSystemDbClient();

  try {
    const sale = await findNfeEmailDispatchSaleForManualProcessing(
      systemDbClient,
      validatedInput.nfeEmailDispatchSaleId,
      validatedInput.runtimeScope,
    );

    if (sale === null) {
      return {
        status: "NOT_FOUND",
      };
    }

    return {
      status: "FOUND",
      sale,
    };
  } catch (error) {
    throw normalizeLoadSaleError(error);
  }
}

function validateInput(
  input: LoadNfeEmailDispatchSaleForManualProcessingActivityInput,
): LoadNfeEmailDispatchSaleForManualProcessingActivityInput & {
  runtimeScope: string;
} {
  if (
    !Number.isSafeInteger(input.nfeEmailDispatchSaleId) ||
    input.nfeEmailDispatchSaleId <= 0
  ) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_MANUAL_LOAD_INVALID_SALE_ID",
      message:
        "NF-e manual sale-load activity requires a positive nfeEmailDispatchSaleId",
    });
  }

  return {
    nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
    runtimeScope: resolveActivityRuntimeScope(input.runtimeScope),
  };
}

function normalizeLoadSaleError(error: unknown): Error {
  if (isIntegrationError(error)) {
    return error;
  }

  return new TransientIntegrationError({
    code: "NFE_EMAIL_DISPATCH_MANUAL_LOAD_FAILED",
    message: "NF-e manual sale-load activity failed with an unknown transient error",
    cause: error,
  });
}
