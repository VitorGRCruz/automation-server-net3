import { temporalConfig } from "../../infra/config/temporal.config.js";
import { createTemporalWorker } from "./create-worker.js";
import { opaWorkerActivities } from "./worker-activity-groups.js";

export async function createOpaWorker(): Promise<
  Awaited<ReturnType<typeof createTemporalWorker>>
> {
  return createTemporalWorker({
    taskQueue: temporalConfig.taskQueues.opa,
    concurrency: temporalConfig.workerConcurrency.opa,
    rateLimits: temporalConfig.workerRateLimits.opa,
    activities: opaWorkerActivities,
  });
}
