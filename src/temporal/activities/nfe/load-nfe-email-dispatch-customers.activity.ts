import {
  TransientIntegrationError,
  isIntegrationError,
} from "../../../domain/shared/integration-error.types.js";
import { getSharedSystemDbClient } from "../../../infra/system-db/system-db.client.js";
import { loadNfeEmailDispatchCustomers } from "../../../infra/system-db/nfe-email-dispatch.repository.js";
import type { NfeEmailDispatchCustomer } from "../../../domain/nfe/nfe-email-dispatch.types.js";

export async function loadNfeEmailDispatchCustomersActivity(): Promise<
  NfeEmailDispatchCustomer[]
> {
  const systemDbClient = getSharedSystemDbClient();

  try {
    return await loadNfeEmailDispatchCustomers(systemDbClient);
  } catch (error) {
    throw normalizeLoadNfeEmailDispatchCustomersError(error);
  }
}

function normalizeLoadNfeEmailDispatchCustomersError(error: unknown): Error {
  if (isIntegrationError(error)) {
    return error;
  }

  return new TransientIntegrationError({
    code: "NFE_EMAIL_DISPATCH_LOAD_CUSTOMERS_FAILED",
    message:
      "NF-e email dispatch customer load failed with an unknown transient error",
    cause: error,
  });
}
