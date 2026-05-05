import { randomUUID } from "node:crypto";
import type { Workflow } from "@temporalio/client";
import {
  normalizeAutomationRuntimePolicy,
  resolveChildWorkflowIdReusePolicy,
  scopeWorkflowId,
} from "../../../domain/shared/automation-runtime-policy.js";
import type {
  AutomationRuntimePolicyInput,
  IdempotencyScopeStrategy,
  NormalizedAutomationRuntimePolicy,
} from "../../../domain/shared/automation-runtime-policy.types.js";
import { temporalConfig } from "../../../infra/config/temporal.config.js";
import { createTemporalClient, createTemporalConnection } from "../temporal-client.js";

export interface ResolvedDevelopmentRuntimePolicy {
  runtimePolicyInput: AutomationRuntimePolicyInput;
  runtimePolicy: NormalizedAutomationRuntimePolicy;
  testRunIdWasGenerated: boolean;
}

export interface StartedDevelopmentWorkflowSummary {
  mode: NormalizedAutomationRuntimePolicy["mode"];
  testRunId: string;
  testRunIdWasGenerated: boolean;
  idempotencyScope: string;
  namespace: string;
  taskQueue: string;
  workflowType: string;
  workflowId: string;
  runId: string | undefined;
  requestId: string;
  sideEffectsWarning: string;
}

const SIDE_EFFECTS_WARNING =
  "This development run reuses the real production workflows and activities and can trigger real side effects.";

export function resolveDevelopmentRuntimePolicyFromEnv(): ResolvedDevelopmentRuntimePolicy {
  const providedTestRunId = process.env.TEST_RUN_ID?.trim();
  const runtimePolicyInput: AutomationRuntimePolicyInput = {
    mode: "development",
    testRunId: providedTestRunId && providedTestRunId.length > 0 ? providedTestRunId : randomUUID(),
    idempotencyScopeStrategy: readIdempotencyScopeStrategyEnv(),
    allowCompletedChildWorkflowRerun: readBooleanEnv(
      "AUTOMATION_DEV_ALLOW_COMPLETED_CHILD_WORKFLOW_RERUN",
      true,
    ),
  };
  const runtimePolicy = normalizeAutomationRuntimePolicy(runtimePolicyInput);

  return {
    runtimePolicyInput,
    runtimePolicy,
    testRunIdWasGenerated:
      providedTestRunId === undefined || providedTestRunId.length === 0,
  };
}

export function buildScopedManualWorkflowStart(
  workflowIdBase: string,
  runtimePolicy: NormalizedAutomationRuntimePolicy,
): {
  workflowId: string;
  requestId: string;
  workflowIdReusePolicy: "ALLOW_DUPLICATE" | "ALLOW_DUPLICATE_FAILED_ONLY";
} {
  const workflowId = scopeWorkflowId(workflowIdBase, runtimePolicy);

  return {
    workflowId,
    requestId: workflowId,
    workflowIdReusePolicy: resolveChildWorkflowIdReusePolicy(runtimePolicy),
  };
}

export async function startDevelopmentWorkflow<TWorkflow extends Workflow>(
  workflowType: TWorkflow,
  workflowTypeName: string,
  workflowStart: {
    taskQueue: string;
    workflowId: string;
    requestId: string;
    workflowIdReusePolicy: "ALLOW_DUPLICATE" | "ALLOW_DUPLICATE_FAILED_ONLY";
    args: Parameters<TWorkflow>;
  },
  resolvedRuntimePolicy: ResolvedDevelopmentRuntimePolicy,
): Promise<StartedDevelopmentWorkflowSummary> {
  const connection = await createTemporalConnection();

  try {
    const client = createTemporalClient(connection);
    const handle = await client.workflow.start(
      workflowType,
      {
        taskQueue: workflowStart.taskQueue,
        workflowId: workflowStart.workflowId,
        workflowIdReusePolicy: workflowStart.workflowIdReusePolicy,
        args: workflowStart.args as Parameters<TWorkflow>,
      } as never,
    );

    return {
      mode: resolvedRuntimePolicy.runtimePolicy.mode,
      testRunId: resolvedRuntimePolicy.runtimePolicy.testRunId as string,
      testRunIdWasGenerated: resolvedRuntimePolicy.testRunIdWasGenerated,
      idempotencyScope: resolvedRuntimePolicy.runtimePolicy.idempotencyScope,
      namespace: temporalConfig.namespace,
      taskQueue: workflowStart.taskQueue,
      workflowType: workflowTypeName,
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      requestId: workflowStart.requestId,
      sideEffectsWarning: SIDE_EFFECTS_WARNING,
    };
  } finally {
    await connection.close();
  }
}

function readIdempotencyScopeStrategyEnv(): IdempotencyScopeStrategy {
  const value = process.env.AUTOMATION_DEV_IDEMPOTENCY_SCOPE_STRATEGY?.trim();

  if (value === undefined || value.length === 0) {
    return "run-scoped";
  }

  if (value === "run-scoped" || value === "business") {
    return value;
  }

  throw new Error(
    "Environment variable AUTOMATION_DEV_IDEMPOTENCY_SCOPE_STRATEGY must be run-scoped or business",
  );
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();

  if (value === undefined || value.length === 0) {
    return fallback;
  }

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  throw new Error(`Environment variable ${name} must be true/false or 1/0`);
}
