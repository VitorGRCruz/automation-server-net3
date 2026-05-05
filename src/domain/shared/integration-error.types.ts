export type IntegrationErrorKind = "transient" | "permanent";

export interface IntegrationErrorInput {
  code: string;
  message: string;
  cause?: unknown;
}

abstract class BaseIntegrationError extends Error {
  abstract readonly kind: IntegrationErrorKind;
  readonly code: string;

  constructor(input: IntegrationErrorInput) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause });
    this.name = new.target.name;
    this.code = input.code;
  }
}

export class TransientIntegrationError extends BaseIntegrationError {
  readonly kind = "transient";
}

export class PermanentIntegrationError extends BaseIntegrationError {
  readonly kind = "permanent";
}

export type IntegrationError = TransientIntegrationError | PermanentIntegrationError;

export function isTransientIntegrationError(
  error: unknown,
): error is TransientIntegrationError {
  return error instanceof TransientIntegrationError;
}

export function isPermanentIntegrationError(
  error: unknown,
): error is PermanentIntegrationError {
  return error instanceof PermanentIntegrationError;
}

export function isIntegrationError(error: unknown): error is IntegrationError {
  return isTransientIntegrationError(error) || isPermanentIntegrationError(error);
}

export function classifyIntegrationError(error: unknown): IntegrationErrorKind | null {
  if (isTransientIntegrationError(error)) {
    return error.kind;
  }

  if (isPermanentIntegrationError(error)) {
    return error.kind;
  }

  return null;
}
