import { PermanentIntegrationError } from "../../../domain/shared/integration-error.types.js";

export function normalizePaginationLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 200) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_PAGINATION_LIMIT",
      message: "NF-e email dispatch pagination limit must be an integer between 1 and 200",
    });
  }

  return value;
}

export function normalizePaginationOffset(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_PAGINATION_OFFSET",
      message: "NF-e email dispatch pagination offset must be a non-negative integer",
    });
  }

  return value;
}
