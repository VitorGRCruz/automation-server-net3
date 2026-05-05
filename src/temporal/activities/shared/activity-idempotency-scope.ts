import {
  AutomationRuntimePolicyValidationError,
  normalizeAutomationRuntimeScope,
  scopeIdempotencyPartsByScope,
} from "../../../domain/shared/automation-runtime-policy.js";
import { PermanentIntegrationError } from "../../../domain/shared/integration-error.types.js";

export function resolveActivityRuntimeScope(
  value: string | undefined | null,
): string {
  try {
    return normalizeAutomationRuntimeScope(value);
  } catch (error) {
    if (error instanceof AutomationRuntimePolicyValidationError) {
      throw new PermanentIntegrationError({
        code: "AUTOMATION_RUNTIME_SCOPE_INVALID",
        message: error.message,
      });
    }

    throw error;
  }
}

export function scopeActivityIdempotencyParts(
  baseParts: readonly string[],
  runtimeScope: string | undefined | null,
): readonly string[] {
  return scopeIdempotencyPartsByScope(
    baseParts,
    resolveActivityRuntimeScope(runtimeScope),
  );
}
