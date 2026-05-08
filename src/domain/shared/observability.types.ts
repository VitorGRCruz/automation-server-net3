import type { Sinks } from "@temporalio/workflow";

export type MetricsExposure = "protected" | "public";

export type WorkflowTriggerExecutionResult =
  | "child-workflows-started"
  | "failed"
  | "no-eligible-items";

export type WorkflowTriggerFailureKind = "permanent" | "transient";

export interface WorkflowTriggerExecutionMetric {
  workflow: string;
  source: string;
  result: WorkflowTriggerExecutionResult;
}

export interface WorkflowTriggerCountMetric {
  workflow: string;
  source: string;
  count: number;
}

export interface WorkflowTriggerFailureMetric {
  workflow: string;
  source: string;
  failureKind: WorkflowTriggerFailureKind;
  round: "1" | "2";
}

export interface WorkflowTriggerRecoveryMetric {
  workflow: string;
  source: string;
}

export type WorkerQueueRoleMetricLabel =
  | "control"
  | "erp_read"
  | "opa"
  | "smtp"
  | "ixc"
  | "unknown";

export interface WorkerActivityMetric {
  taskQueue: string;
  queueRole: WorkerQueueRoleMetricLabel;
  activityType: string;
}

export interface WorkerActivityExecutionMetric extends WorkerActivityMetric {
  status: "success" | "failure";
}

export interface WorkerActivityTimingMetric extends WorkerActivityMetric {
  durationSeconds: number;
}

export interface WorkerActivityRateLimitMetric {
  taskQueue: string;
  queueRole: WorkerQueueRoleMetricLabel;
  scope: "worker" | "task_queue";
  maxActivitiesPerSecond: number;
}

export interface WorkflowObservabilitySinks extends Sinks {
  observability: {
    recordWorkflowTriggerExecution(input: WorkflowTriggerExecutionMetric): void;
    addWorkflowTriggerEligibleItems(input: WorkflowTriggerCountMetric): void;
    addWorkflowTriggerChildWorkflowsStarted(input: WorkflowTriggerCountMetric): void;
    addWorkflowTriggerAlreadyRunning(input: WorkflowTriggerCountMetric): void;
    recordWorkflowTriggerFailure(input: WorkflowTriggerFailureMetric): void;
    recordWorkflowTriggerRecoveryScheduled(input: WorkflowTriggerRecoveryMetric): void;
    recordWorkflowTriggerRecoveryAlreadyPending(input: WorkflowTriggerRecoveryMetric): void;
  };
}
