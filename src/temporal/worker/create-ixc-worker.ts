import { temporalConfig } from "../../infra/config/temporal.config.js";
import { createTemporalWorker } from "./create-worker.js";
import { ixcWorkerActivities } from "./worker-activity-groups.js";

export async function createIxcWorker(): Promise<
  Awaited<ReturnType<typeof createTemporalWorker>>
> {
  return createTemporalWorker({
    taskQueue: temporalConfig.taskQueues.ixc,
    concurrency: temporalConfig.workerConcurrency.ixc,
    rateLimits: temporalConfig.workerRateLimits.ixc,
    activities: ixcWorkerActivities,
  });
}
