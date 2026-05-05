import {
  NFE_EMAIL_DISPATCH_FINALIZATION_STATUSES,
  NFE_EMAIL_DISPATCH_SALE_STATUSES,
  type NfeEmailDispatchFinalizationStatus,
  type NfeEmailDispatchSaleStatus,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import {
  AutomationRuntimePolicyValidationError,
  normalizeAutomationRuntimeScope,
} from "../../../domain/shared/automation-runtime-policy.js";
import { PermanentIntegrationError } from "../../../domain/shared/integration-error.types.js";
import { normalizeDateTime3 } from "./date-time.js";

export function normalizePositiveInteger(value: number, fieldName: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_INTEGER_FILTER",
      message: `NF-e email dispatch requires ${fieldName} to be a positive integer`,
    });
  }

  return value;
}

export function normalizeNonNegativeInteger(
  value: number,
  fieldName: string,
): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_INTEGER_FILTER",
      message: `NF-e email dispatch requires ${fieldName} to be a non-negative integer`,
    });
  }

  return value;
}

export function normalizePositiveIntegerList(
  values: readonly number[],
  fieldName: string,
): number[] {
  const normalizedValues = values.map((value) =>
    normalizePositiveInteger(value, fieldName),
  );

  return [...new Set(normalizedValues)];
}

export function normalizeSaleStatus(
  status: NfeEmailDispatchSaleStatus,
): NfeEmailDispatchSaleStatus {
  if (!NFE_EMAIL_DISPATCH_SALE_STATUSES.includes(status)) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_SALE_STATUS",
      message: `Unsupported NF-e email dispatch sale status: ${status}`,
    });
  }

  return status;
}

export function normalizeFinalStatus(
  status: NfeEmailDispatchFinalizationStatus,
): NfeEmailDispatchFinalizationStatus {
  if (!NFE_EMAIL_DISPATCH_FINALIZATION_STATUSES.includes(status)) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_FINAL_STATUS",
      message: `Unsupported NF-e email dispatch final status: ${status}`,
    });
  }

  return status;
}

export function normalizeOptionalSentAt(
  finalStatus: NfeEmailDispatchFinalizationStatus,
  value: Date | string | undefined,
): string | null {
  if (finalStatus === "SENT") {
    if (value === undefined) {
      throw new PermanentIntegrationError({
        code: "NFE_EMAIL_DISPATCH_SENT_AT_REQUIRED",
        message: "sentAt is required when finalizing an NF-e email dispatch sale as SENT",
      });
    }

    return normalizeDateTime3(value);
  }

  if (value !== undefined) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_SENT_AT_NOT_ALLOWED",
      message: "sentAt must only be provided when finalizing an NF-e email dispatch sale as SENT",
    });
  }

  return null;
}

export function normalizeOptionalErrorMessage(
  value: string | undefined,
): string | null {
  if (value === undefined) {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
}

export function normalizeInvoiceKeyFilter(value: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_INVOICE_KEY",
      message: "NF-e email dispatch invoice key filters must not be empty",
    });
  }

  return normalizedValue;
}

export function normalizeRuntimeScope(value: string): string {
  try {
    return normalizeAutomationRuntimeScope(value);
  } catch (error) {
    if (error instanceof AutomationRuntimePolicyValidationError) {
      throw new PermanentIntegrationError({
        code: "NFE_EMAIL_DISPATCH_INVALID_RUNTIME_SCOPE",
        message: error.message,
      });
    }

    throw error;
  }
}

export function normalizeMaxSendAttempts(
  value: number,
  operationName: string,
): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_MAX_ATTEMPTS",
      message: `${operationName} max send attempts must be a positive integer`,
    });
  }

  return value;
}
