import type {
  FindOpaCustomerActivityInput,
  FindOpaCustomerActivityResult,
} from "../../../domain/csat/csat-start-survey.types.js";
import { CSAT_OPA_CUSTOMER_LOOKUP_FAILURE } from "../../../domain/csat/csat-start-survey.types.js";
import {
  PermanentIntegrationError,
  TransientIntegrationError,
  isPermanentIntegrationError,
  isTransientIntegrationError,
} from "../../../domain/shared/integration-error.types.js";
import { createOpaClient } from "../../../integrations/opa/opa.client.js";
import type {
  OpaCustomerRow,
  OpaFindCustomerResponse,
  OpaResponseEnvelope,
} from "../../../integrations/opa/opa.types.js";

/**
 * Resolves the OPA customer `_id` for a CSAT-eligible ERP customer.
 */
export async function findOpaCustomerActivity(
  input: FindOpaCustomerActivityInput,
): Promise<FindOpaCustomerActivityResult> {
  const opaClient = createOpaClient();

  try {
    const response = await opaClient.findCustomerById({
      idCliente: input.idCliente,
    });

    return mapOpaCustomerLookupResponse(response);
  } catch (error) {
    if (isPermanentIntegrationError(error)) {
      return buildFailedLookupResult("permanent");
    }

    throw normalizeFindOpaCustomerError(error);
  }
}

function mapOpaCustomerLookupResponse(
  response: OpaFindCustomerResponse,
): FindOpaCustomerActivityResult {
  if (response.responseType === "html") {
    return buildFailedLookupResult("permanent");
  }

  const data = readOpaCustomerData(response.body);

  if (data.length !== 1) {
    return buildFailedLookupResult("permanent");
  }

  const opaIdCliente = readOpaCustomerId(data[0]);

  if (opaIdCliente === null) {
    return buildFailedLookupResult("permanent");
  }

  return {
    status: "success",
    opaIdCliente,
  };
}

function readOpaCustomerData(body: unknown): OpaCustomerRow[] {
  if (!isRecord(body)) {
    throw new PermanentIntegrationError({
      code: "OPA_CUSTOMER_LOOKUP_INVALID_BODY",
      message: "OPA customer lookup returned an invalid JSON body",
    });
  }

  const envelope = body as OpaResponseEnvelope;

  if (!Array.isArray(envelope.data)) {
    return [];
  }

  if (!envelope.data.every(isRecord)) {
    throw new PermanentIntegrationError({
      code: "OPA_CUSTOMER_LOOKUP_INVALID_DATA",
      message: "OPA customer lookup returned an invalid data payload",
    });
  }

  return envelope.data as OpaCustomerRow[];
}

function readOpaCustomerId(customer: OpaCustomerRow | undefined): string | null {
  if (customer === undefined) {
    return null;
  }

  if (typeof customer._id !== "string") {
    return null;
  }

  const opaIdCliente = customer._id.trim();

  return opaIdCliente === "" ? null : opaIdCliente;
}

function buildFailedLookupResult(
  failureType: "permanent" | "terminal",
): FindOpaCustomerActivityResult {
  return {
    status: "failed",
    failureType,
    eventMessage: CSAT_OPA_CUSTOMER_LOOKUP_FAILURE,
  };
}

function normalizeFindOpaCustomerError(error: unknown): Error {
  if (isTransientIntegrationError(error)) {
    return error;
  }

  return new TransientIntegrationError({
    code: "CSAT_FIND_OPA_CUSTOMER_UNKNOWN_FAILURE",
    message: "OPA customer lookup failed with an unknown transient condition",
    cause: error,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
