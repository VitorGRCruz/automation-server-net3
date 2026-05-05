import type { ActivityInterceptorsFactory } from "@temporalio/worker";
import { resolveTemporalTaskQueueRoleMetricLabel } from "../../infra/config/temporal-task-queues.js";
import {
  changeWorkerActivityInFlight,
  observeWorkerActivityExecutionDuration,
  observeWorkerActivityScheduleToStart,
  recordWorkerActivityExecution,
  recordWorkerActivityStarted,
} from "../../infra/observability/metrics.js";

export const workerActivityObservabilityInterceptors: ActivityInterceptorsFactory[] = [
  (context) => ({
    inbound: {
      async execute(input, next) {
        const metricLabels = {
          taskQueue: context.info.taskQueue,
          queueRole: resolveTemporalTaskQueueRoleMetricLabel(context.info.taskQueue),
          activityType: context.info.activityType,
        } as const;
        const startedAt = performance.now();

        // This approximates queue backlog for the current activity attempt.
        const queueAgeSeconds = Math.max(
          0,
          (Date.now() - context.info.currentAttemptScheduledTimestampMs) / 1000,
        );

        recordWorkerActivityStarted(metricLabels);
        observeWorkerActivityScheduleToStart({
          ...metricLabels,
          durationSeconds: queueAgeSeconds,
        });
        changeWorkerActivityInFlight(metricLabels, 1);

        try {
          const result = await next(input);

          observeWorkerActivityExecutionDuration({
            ...metricLabels,
            status: "success",
            durationSeconds: (performance.now() - startedAt) / 1000,
          });
          recordWorkerActivityExecution({
            ...metricLabels,
            status: "success",
          });

          return result;
        } catch (error) {
          observeWorkerActivityExecutionDuration({
            ...metricLabels,
            status: "failure",
            durationSeconds: (performance.now() - startedAt) / 1000,
          });
          recordWorkerActivityExecution({
            ...metricLabels,
            status: "failure",
          });

          throw error;
        } finally {
          changeWorkerActivityInFlight(metricLabels, -1);
        }
      },
    },
  }),
];
