import { temporalConfig } from "../../infra/config/temporal.config.js";
import { createTemporalWorker } from "./create-worker.js";
import { smtpWorkerActivities } from "./worker-activity-groups.js";

export async function createSmtpWorker(): Promise<
  Awaited<ReturnType<typeof createTemporalWorker>>
> {
  return createTemporalWorker({
    taskQueue: temporalConfig.taskQueues.smtp,
    concurrency: temporalConfig.workerConcurrency.smtp,
    rateLimits: temporalConfig.workerRateLimits.smtp,
    activities: smtpWorkerActivities,
  });
}
