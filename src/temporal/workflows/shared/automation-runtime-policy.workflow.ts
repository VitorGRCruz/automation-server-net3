import { ApplicationFailure } from "@temporalio/workflow";
import type {
  AutomationRuntimePolicyInput,
  NormalizedAutomationRuntimePolicy,
} from "../../../domain/shared/automation-runtime-policy.types.js";
import {
  AutomationRuntimePolicyValidationError,
  normalizeAutomationRuntimePolicy as normalizeAutomationRuntimePolicyBase,
  normalizeAutomationRuntimeScope as normalizeAutomationRuntimeScopeBase,
  resolveChildWorkflowIdReusePolicy as resolveChildWorkflowIdReusePolicyBase,
  scopeIdempotencyParts as scopeIdempotencyPartsBase,
  scopeWorkflowId as scopeWorkflowIdBase,
} from "../../../domain/shared/automation-runtime-policy.js";

export function normalizeAutomationRuntimePolicy(
  input: AutomationRuntimePolicyInput | undefined,
): NormalizedAutomationRuntimePolicy {
  try {
    return normalizeAutomationRuntimePolicyBase(input);
  } catch (error) {
    throw asInvalidWorkflowInput(error);
  }
}

export function normalizeAutomationRuntimeScope(
  value: string | undefined | null,
): string {
  try {
    return normalizeAutomationRuntimeScopeBase(value);
  } catch (error) {
    throw asInvalidWorkflowInput(error);
  }
}

export function scopeWorkflowId(
  baseWorkflowId: string,
  policy: NormalizedAutomationRuntimePolicy,
): string {
  try {
    return scopeWorkflowIdBase(baseWorkflowId, policy);
  } catch (error) {
    throw asInvalidWorkflowInput(error);
  }
}

export function scopeIdempotencyParts(
  baseParts: readonly string[],
  policy: NormalizedAutomationRuntimePolicy,
): readonly string[] {
  try {
    return scopeIdempotencyPartsBase(baseParts, policy);
  } catch (error) {
    throw asInvalidWorkflowInput(error);
  }
}

export function resolveChildWorkflowIdReusePolicy(
  policy: NormalizedAutomationRuntimePolicy,
): "ALLOW_DUPLICATE" | "ALLOW_DUPLICATE_FAILED_ONLY" {
  return resolveChildWorkflowIdReusePolicyBase(policy);
}

function asInvalidWorkflowInput(error: unknown): ApplicationFailure {
  if (error instanceof AutomationRuntimePolicyValidationError) {
    return ApplicationFailure.nonRetryable(error.message, "INVALID_WORKFLOW_INPUT");
  }

  return ApplicationFailure.nonRetryable(
    "Automation runtime policy validation failed with an unexpected error",
    "INVALID_WORKFLOW_INPUT",
  );
}
