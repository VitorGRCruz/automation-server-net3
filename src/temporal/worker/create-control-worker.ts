import { temporalConfig } from "../../infra/config/temporal.config.js";
import type { WorkerHealthState } from "./worker-health-state.js";
import { workerObservabilitySinks } from "./worker-observability-sinks.js";
import { createTemporalWorker } from "./create-worker.js";
import { controlWorkerActivities } from "./worker-activity-groups.js";

export async function createControlWorker(
  healthState?: WorkerHealthState,
): Promise<Awaited<ReturnType<typeof createTemporalWorker>>> {
  return createTemporalWorker({
    taskQueue: temporalConfig.taskQueues.control,
    concurrency: temporalConfig.workerConcurrency.control,
    activities: controlWorkerActivities,
    includeWorkflows: true,
    sinks: workerObservabilitySinks,
    healthState,
  });
}
