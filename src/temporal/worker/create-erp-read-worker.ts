import { temporalConfig } from "../../infra/config/temporal.config.js";
import { createTemporalWorker } from "./create-worker.js";
import { erpReadWorkerActivities } from "./worker-activity-groups.js";

export async function createErpReadWorker(): Promise<
  Awaited<ReturnType<typeof createTemporalWorker>>
> {
  return createTemporalWorker({
    taskQueue: temporalConfig.taskQueues.erpRead,
    concurrency: temporalConfig.workerConcurrency.erpRead,
    rateLimits: temporalConfig.workerRateLimits.erpRead,
    activities: erpReadWorkerActivities,
  });
}
