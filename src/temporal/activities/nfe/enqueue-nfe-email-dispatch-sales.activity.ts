import type {
  EnqueueNfeEmailDispatchSalesActivityInput,
  EnqueueNfeEmailDispatchSalesActivityResult,
  ErpNfeSaleCandidate,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import {
  PermanentIntegrationError,
  TransientIntegrationError,
  isIntegrationError,
} from "../../../domain/shared/integration-error.types.js";
import {
  insertNfeEmailDispatchSalesIdempotently,
} from "../../../infra/system-db/nfe-email-dispatch.repository.js";
import { getSharedSystemDbClient } from "../../../infra/system-db/system-db.client.js";
import { resolveActivityRuntimeScope } from "../shared/activity-idempotency-scope.js";

export async function enqueueNfeEmailDispatchSalesActivity(
  input: EnqueueNfeEmailDispatchSalesActivityInput,
): Promise<EnqueueNfeEmailDispatchSalesActivityResult> {
  const validatedInput = validateEnqueueNfeEmailDispatchSalesActivityInput(input);

  if (validatedInput.candidates.length === 0) {
    return {
      receivedCandidates: 0,
      queuedSales: 0,
    };
  }

  const systemDbClient = getSharedSystemDbClient();

  try {
    const insertResult = await insertNfeEmailDispatchSalesIdempotently(systemDbClient, {
      sales: validatedInput.candidates,
      runtimeScope: validatedInput.runtimeScope,
    });

    return {
      receivedCandidates: insertResult.receivedSales,
      queuedSales: insertResult.insertedSales,
    };
  } catch (error) {
    throw normalizeEnqueueNfeEmailDispatchSalesError(error);
  }
}

function validateEnqueueNfeEmailDispatchSalesActivityInput(
  input: EnqueueNfeEmailDispatchSalesActivityInput,
): EnqueueNfeEmailDispatchSalesActivityInput {
  if (!Array.isArray(input.candidates)) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_CANDIDATES",
      message: "NF-e email dispatch enqueue activity requires a candidates array",
    });
  }

  return {
    candidates: input.candidates.map(validateErpNfeSaleCandidate),
    runtimeScope: resolveActivityRuntimeScope(input.runtimeScope),
  };
}

function validateErpNfeSaleCandidate(candidate: ErpNfeSaleCandidate): ErpNfeSaleCandidate {
  return {
    automationCustomerId: readPositiveInteger(
      candidate.automationCustomerId,
      "automationCustomerId",
    ),
    erpCustomerId: readPositiveInteger(candidate.erpCustomerId, "erpCustomerId"),
    erpSaleId: readPositiveInteger(candidate.erpSaleId, "erpSaleId"),
    erpInvoiceKey: normalizeNullableText(candidate.erpInvoiceKey),
    erpInvoiceEmittedAt: readRequiredText(
      candidate.erpInvoiceEmittedAt,
      "erpInvoiceEmittedAt",
    ),
  };
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }

  throw new PermanentIntegrationError({
    code: "NFE_EMAIL_DISPATCH_INVALID_INTEGER_FIELD",
    message: `NF-e email dispatch enqueue activity received an invalid integer for ${fieldName}`,
  });
}

function readRequiredText(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_TEXT_FIELD",
      message: `NF-e email dispatch enqueue activity requires a string for ${fieldName}`,
    });
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_EMPTY_TEXT_FIELD",
      message: `NF-e email dispatch enqueue activity requires a non-empty value for ${fieldName}`,
    });
  }

  return normalizedValue;
}

function normalizeNullableText(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim();

    return normalizedValue.length === 0 ? null : normalizedValue;
  }

  throw new PermanentIntegrationError({
    code: "NFE_EMAIL_DISPATCH_INVALID_TEXT_FIELD",
    message: "NF-e email dispatch enqueue activity received an invalid invoice key",
  });
}

function normalizeEnqueueNfeEmailDispatchSalesError(error: unknown): Error {
  if (isIntegrationError(error)) {
    return error;
  }

  return new TransientIntegrationError({
    code: "NFE_EMAIL_DISPATCH_ENQUEUE_FAILED",
    message:
      "NF-e email dispatch enqueue failed with an unknown transient error",
    cause: error,
  });
}
