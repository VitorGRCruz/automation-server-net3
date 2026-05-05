import { Counter, Gauge, Histogram, Registry } from "prom-client";
import type {
  WorkerActivityExecutionMetric,
  WorkerActivityMetric,
  WorkerActivityRateLimitMetric,
  WorkerActivityTimingMetric,
  WorkflowTriggerCountMetric,
  WorkflowTriggerExecutionMetric,
  WorkflowTriggerFailureMetric,
  WorkflowTriggerRecoveryMetric,
} from "../../domain/shared/observability.types.js";

const metricsRegistry = new Registry();

function getOrCreateCounter<TLabel extends string>(input: {
  name: string;
  help: string;
  labelNames: readonly TLabel[];
}): Counter<TLabel> {
  const existingMetric = metricsRegistry.getSingleMetric(input.name);

  if (existingMetric) {
    return existingMetric as Counter<TLabel>;
  }

  return new Counter({
    name: input.name,
    help: input.help,
    labelNames: [...input.labelNames],
    registers: [metricsRegistry],
  });
}

function getOrCreateGauge<TLabel extends string>(input: {
  name: string;
  help: string;
  labelNames: readonly TLabel[];
}): Gauge<TLabel> {
  const existingMetric = metricsRegistry.getSingleMetric(input.name);

  if (existingMetric) {
    return existingMetric as Gauge<TLabel>;
  }

  return new Gauge({
    name: input.name,
    help: input.help,
    labelNames: [...input.labelNames],
    registers: [metricsRegistry],
  });
}

function getOrCreateHistogram<TLabel extends string>(input: {
  name: string;
  help: string;
  labelNames: readonly TLabel[];
  buckets: readonly number[];
}): Histogram<TLabel> {
  const existingMetric = metricsRegistry.getSingleMetric(input.name);

  if (existingMetric) {
    return existingMetric as Histogram<TLabel>;
  }

  return new Histogram({
    name: input.name,
    help: input.help,
    labelNames: [...input.labelNames],
    buckets: [...input.buckets],
    registers: [metricsRegistry],
  });
}

const workflowTriggerExecutionsTotal = getOrCreateCounter({
  name: "workflow_trigger_executions_total",
  help: "Total number of trigger workflow terminal executions by workflow, source and result",
  labelNames: ["workflow", "source", "result"] as const,
});

const workflowTriggerEligibleItemsTotal = getOrCreateCounter({
  name: "workflow_trigger_eligible_items_total",
  help: "Total number of eligible items found by trigger workflows",
  labelNames: ["workflow", "source"] as const,
});

const workflowTriggerChildWorkflowsStartedTotal = getOrCreateCounter({
  name: "workflow_trigger_child_workflows_started_total",
  help: "Total number of child workflows started by trigger workflows",
  labelNames: ["workflow", "source"] as const,
});

const workflowTriggerAlreadyRunningTotal = getOrCreateCounter({
  name: "workflow_trigger_already_running_total",
  help: "Total number of child workflow start attempts skipped because the workflow was already running",
  labelNames: ["workflow", "source"] as const,
});

const workflowTriggerFailuresTotal = getOrCreateCounter({
  name: "workflow_trigger_failures_total",
  help: "Total number of trigger workflow failures by workflow, source, failure kind and round",
  labelNames: ["workflow", "source", "failure_kind", "round"] as const,
});

const workflowTriggerRecoveryScheduledTotal = getOrCreateCounter({
  name: "workflow_trigger_recovery_scheduled_total",
  help: "Total number of recovery workflows scheduled after transient trigger failures",
  labelNames: ["workflow", "source"] as const,
});

const workflowTriggerRecoveryAlreadyPendingTotal = getOrCreateCounter({
  name: "workflow_trigger_recovery_already_pending_total",
  help: "Total number of recovery workflows found already pending",
  labelNames: ["workflow", "source"] as const,
});

const workflowStepIdempotencyReservationsTotal = getOrCreateCounter({
  name: "workflow_step_idempotency_reservations_total",
  help: "Total number of workflow step idempotency reservations by status",
  labelNames: ["workflow", "step", "reservation_status"] as const,
});

const workflowStepIdempotencyFinalizationsTotal = getOrCreateCounter({
  name: "workflow_step_idempotency_finalizations_total",
  help: "Total number of workflow step idempotency finalizations by status",
  labelNames: ["workflow", "step", "final_status"] as const,
});

const workerActivityStartedTotal = getOrCreateCounter({
  name: "worker_activity_started_total",
  help: "Total number of activity executions started by task queue and activity type",
  labelNames: ["task_queue", "queue_role", "activity_type"] as const,
});

const workerActivityExecutionsTotal = getOrCreateCounter({
  name: "worker_activity_executions_total",
  help: "Total number of activity executions completed by task queue, activity type and status",
  labelNames: ["task_queue", "queue_role", "activity_type", "status"] as const,
});

const workerActivityInFlight = getOrCreateGauge({
  name: "worker_activity_in_flight",
  help: "Current number of in-flight activity executions by task queue and activity type",
  labelNames: ["task_queue", "queue_role", "activity_type"] as const,
});

const workerActivityScheduleToStartSeconds = getOrCreateHistogram({
  name: "worker_activity_schedule_to_start_seconds",
  help: "Observed activity schedule-to-start delay by task queue and activity type",
  labelNames: ["task_queue", "queue_role", "activity_type"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300],
});

const workerActivityExecutionDurationSeconds = getOrCreateHistogram({
  name: "worker_activity_execution_duration_seconds",
  help: "Observed activity execution duration by task queue, activity type and status",
  labelNames: ["task_queue", "queue_role", "activity_type", "status"] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300],
});

const workerActivityRateLimitPerSecond = getOrCreateGauge({
  name: "worker_activity_rate_limit_per_second",
  help: "Configured activity rate limit per second by task queue and scope",
  labelNames: ["task_queue", "queue_role", "scope"] as const,
});

export function recordWorkflowTriggerExecution(
  input: WorkflowTriggerExecutionMetric,
): void {
  workflowTriggerExecutionsTotal.inc({
    workflow: input.workflow,
    source: input.source,
    result: input.result,
  });
}

export function addWorkflowTriggerEligibleItems(
  input: WorkflowTriggerCountMetric,
): void {
  if (input.count <= 0) {
    return;
  }

  workflowTriggerEligibleItemsTotal.inc(
    {
      workflow: input.workflow,
      source: input.source,
    },
    input.count,
  );
}

export function addWorkflowTriggerChildWorkflowsStarted(
  input: WorkflowTriggerCountMetric,
): void {
  if (input.count <= 0) {
    return;
  }

  workflowTriggerChildWorkflowsStartedTotal.inc(
    {
      workflow: input.workflow,
      source: input.source,
    },
    input.count,
  );
}

export function addWorkflowTriggerAlreadyRunning(
  input: WorkflowTriggerCountMetric,
): void {
  if (input.count <= 0) {
    return;
  }

  workflowTriggerAlreadyRunningTotal.inc(
    {
      workflow: input.workflow,
      source: input.source,
    },
    input.count,
  );
}

export function recordWorkflowTriggerFailure(
  input: WorkflowTriggerFailureMetric,
): void {
  workflowTriggerFailuresTotal.inc({
    workflow: input.workflow,
    source: input.source,
    failure_kind: input.failureKind,
    round: input.round,
  });
}

export function recordWorkflowTriggerRecoveryScheduled(
  input: WorkflowTriggerRecoveryMetric,
): void {
  workflowTriggerRecoveryScheduledTotal.inc({
    workflow: input.workflow,
    source: input.source,
  });
}

export function recordWorkflowTriggerRecoveryAlreadyPending(
  input: WorkflowTriggerRecoveryMetric,
): void {
  workflowTriggerRecoveryAlreadyPendingTotal.inc({
    workflow: input.workflow,
    source: input.source,
  });
}

export function recordWorkflowStepIdempotencyReservation(input: {
  workflow: string;
  step: string;
  reservationStatus: "completed" | "failed" | "pending" | "reserved";
}): void {
  workflowStepIdempotencyReservationsTotal.inc({
    workflow: input.workflow,
    step: input.step,
    reservation_status: input.reservationStatus,
  });
}

export function recordWorkflowStepIdempotencyFinalization(input: {
  workflow: string;
  step: string;
  finalStatus: "completed" | "failed";
}): void {
  workflowStepIdempotencyFinalizationsTotal.inc({
    workflow: input.workflow,
    step: input.step,
    final_status: input.finalStatus,
  });
}

export function recordWorkerActivityStarted(input: WorkerActivityMetric): void {
  workerActivityStartedTotal.inc({
    task_queue: input.taskQueue,
    queue_role: input.queueRole,
    activity_type: input.activityType,
  });
}

export function recordWorkerActivityExecution(
  input: WorkerActivityExecutionMetric,
): void {
  workerActivityExecutionsTotal.inc({
    task_queue: input.taskQueue,
    queue_role: input.queueRole,
    activity_type: input.activityType,
    status: input.status,
  });
}

export function changeWorkerActivityInFlight(
  input: WorkerActivityMetric,
  delta: number,
): void {
  if (delta === 0) {
    return;
  }

  const labels = {
    task_queue: input.taskQueue,
    queue_role: input.queueRole,
    activity_type: input.activityType,
  };

  if (delta > 0) {
    workerActivityInFlight.inc(labels, delta);
    return;
  }

  workerActivityInFlight.dec(labels, Math.abs(delta));
}

export function observeWorkerActivityScheduleToStart(
  input: WorkerActivityTimingMetric,
): void {
  workerActivityScheduleToStartSeconds.observe(
    {
      task_queue: input.taskQueue,
      queue_role: input.queueRole,
      activity_type: input.activityType,
    },
    input.durationSeconds,
  );
}

export function observeWorkerActivityExecutionDuration(
  input: WorkerActivityExecutionMetric & WorkerActivityTimingMetric,
): void {
  workerActivityExecutionDurationSeconds.observe(
    {
      task_queue: input.taskQueue,
      queue_role: input.queueRole,
      activity_type: input.activityType,
      status: input.status,
    },
    input.durationSeconds,
  );
}

export function setWorkerActivityRateLimit(
  input: WorkerActivityRateLimitMetric,
): void {
  workerActivityRateLimitPerSecond.set(
    {
      task_queue: input.taskQueue,
      queue_role: input.queueRole,
      scope: input.scope,
    },
    input.maxActivitiesPerSecond,
  );
}

export async function renderMetrics(): Promise<{
  contentType: string;
  body: string;
}> {
  return {
    contentType: metricsRegistry.contentType,
    body: await metricsRegistry.metrics(),
  };
}
