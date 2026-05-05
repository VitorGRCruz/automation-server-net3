import type {
  AutomationRuntimeMode,
  AutomationRuntimePolicyInput,
  NormalizedAutomationRuntimePolicy,
} from "./automation-runtime-policy.types.js";

const PRODUCTION_RUNTIME_SCOPE = "production";
const TEST_RUN_ID_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;
const DEV_RUNTIME_SCOPE_PATTERN = /^dev:([A-Za-z0-9._-]{1,80})$/;

export class AutomationRuntimePolicyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutomationRuntimePolicyValidationError";
  }
}

export function normalizeAutomationRuntimePolicy(
  input: AutomationRuntimePolicyInput | undefined,
): NormalizedAutomationRuntimePolicy {
  const mode = normalizeAutomationRuntimeMode(input?.mode);

  if (mode === "production") {
    const idempotencyScopeStrategy =
      input?.idempotencyScopeStrategy ?? "business";

    if (idempotencyScopeStrategy !== "business") {
      throw new AutomationRuntimePolicyValidationError(
        "Production runtime policy only supports the business idempotency scope strategy",
      );
    }

    if (input?.allowCompletedChildWorkflowRerun === true) {
      throw new AutomationRuntimePolicyValidationError(
        "Production runtime policy cannot allow completed child workflow reruns",
      );
    }

    if (input?.testRunId?.trim()) {
      throw new AutomationRuntimePolicyValidationError(
        "Production runtime policy cannot receive a testRunId",
      );
    }

    return {
      mode,
      testRunId: null,
      idempotencyScope: PRODUCTION_RUNTIME_SCOPE,
      idempotencyScopeStrategy,
      allowCompletedChildWorkflowRerun: false,
    };
  }

  const idempotencyScopeStrategy =
    input?.idempotencyScopeStrategy ?? "run-scoped";

  if (idempotencyScopeStrategy !== "run-scoped") {
    throw new AutomationRuntimePolicyValidationError(
      "Development runtime policy currently requires the run-scoped idempotency scope strategy",
    );
  }

  const testRunId = normalizeTestRunId(input?.testRunId);

  return {
    mode,
    testRunId,
    idempotencyScope: `dev:${testRunId}`,
    idempotencyScopeStrategy,
    allowCompletedChildWorkflowRerun:
      input?.allowCompletedChildWorkflowRerun ?? true,
  };
}

export function normalizeAutomationRuntimeScope(
  value: string | undefined | null,
): string {
  if (value === undefined || value === null) {
    return PRODUCTION_RUNTIME_SCOPE;
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0 || normalizedValue === PRODUCTION_RUNTIME_SCOPE) {
    return PRODUCTION_RUNTIME_SCOPE;
  }

  const match = normalizedValue.match(DEV_RUNTIME_SCOPE_PATTERN);

  if (match !== null) {
    return `dev:${match[1]}`;
  }

  throw new AutomationRuntimePolicyValidationError(
    `Invalid automation runtime scope: ${value}`,
  );
}

export function scopeWorkflowId(
  baseWorkflowId: string,
  policy: NormalizedAutomationRuntimePolicy,
): string {
  const normalizedWorkflowId = normalizeNonEmptyText(
    baseWorkflowId,
    "baseWorkflowId",
  );

  if (policy.mode === "production" || policy.testRunId === null) {
    return normalizedWorkflowId;
  }

  return `${normalizedWorkflowId}/dev/${policy.testRunId}`;
}

export function scopeIdempotencyParts(
  baseParts: readonly string[],
  policy: NormalizedAutomationRuntimePolicy,
): readonly string[] {
  return scopeIdempotencyPartsByScope(baseParts, policy.idempotencyScope);
}

export function scopeIdempotencyPartsByScope(
  baseParts: readonly string[],
  idempotencyScope: string,
): readonly string[] {
  const normalizedBaseParts = baseParts.map((part, index) =>
    normalizeNonEmptyText(part, `baseParts[${index}]`),
  );
  const normalizedScope = normalizeAutomationRuntimeScope(idempotencyScope);

  if (normalizedScope === PRODUCTION_RUNTIME_SCOPE) {
    return normalizedBaseParts;
  }

  return [normalizedScope, ...normalizedBaseParts];
}

export function resolveChildWorkflowIdReusePolicy(
  policy: NormalizedAutomationRuntimePolicy,
): "ALLOW_DUPLICATE" | "ALLOW_DUPLICATE_FAILED_ONLY" {
  return policy.allowCompletedChildWorkflowRerun
    ? "ALLOW_DUPLICATE"
    : "ALLOW_DUPLICATE_FAILED_ONLY";
}

function normalizeAutomationRuntimeMode(
  mode: AutomationRuntimeMode | undefined,
): AutomationRuntimeMode {
  if (mode === undefined || mode === "production") {
    return "production";
  }

  if (mode === "development") {
    return mode;
  }

  throw new AutomationRuntimePolicyValidationError(
    `Unsupported automation runtime mode: ${String(mode)}`,
  );
}

function normalizeTestRunId(value: string | undefined): string {
  const normalizedValue = normalizeNonEmptyText(value, "testRunId");

  if (!TEST_RUN_ID_PATTERN.test(normalizedValue)) {
    throw new AutomationRuntimePolicyValidationError(
      "Development runtime policy requires testRunId matching [A-Za-z0-9._-]{1,80}",
    );
  }

  return normalizedValue;
}

function normalizeNonEmptyText(
  value: string | undefined,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new AutomationRuntimePolicyValidationError(
      `Automation runtime policy requires ${fieldName} to be a string`,
    );
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new AutomationRuntimePolicyValidationError(
      `Automation runtime policy requires a non-empty ${fieldName}`,
    );
  }

  return normalizedValue;
}
