export type AutomationRuntimeMode = "production" | "development";

export type IdempotencyScopeStrategy = "business" | "run-scoped";

export interface AutomationRuntimePolicyInput {
  mode?: AutomationRuntimeMode;
  testRunId?: string;
  idempotencyScopeStrategy?: IdempotencyScopeStrategy;
  allowCompletedChildWorkflowRerun?: boolean;
}

export interface NormalizedAutomationRuntimePolicy {
  mode: AutomationRuntimeMode;
  testRunId: string | null;
  idempotencyScope: string;
  idempotencyScopeStrategy: IdempotencyScopeStrategy;
  allowCompletedChildWorkflowRerun: boolean;
}
