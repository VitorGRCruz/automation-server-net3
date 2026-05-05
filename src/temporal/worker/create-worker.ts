import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NativeConnection,
  Worker,
  type WorkerOptions,
} from "@temporalio/worker";
import { temporalConfig } from "../../infra/config/temporal.config.js";
import { resolveTemporalTaskQueueRoleMetricLabel } from "../../infra/config/temporal-task-queues.js";
import { setWorkerActivityRateLimit } from "../../infra/observability/metrics.js";
import type { WorkerHealthState } from "./worker-health-state.js";
import { workerActivityObservabilityInterceptors } from "./worker-activity-observability-interceptors.js";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectoryPath = path.dirname(currentFilePath);
const runtimeExtension = path.extname(currentFilePath) || ".js";
const workflowsPath = path.join(
  currentDirectoryPath,
  "..",
  "workflows",
  `index${runtimeExtension}`,
);

type WorkerActivities = NonNullable<WorkerOptions["activities"]>;

interface CreateTemporalWorkerInput {
  taskQueue: string;
  activities?: WorkerActivities | undefined;
  includeWorkflows?: boolean | undefined;
  sinks?: WorkerOptions["sinks"] | undefined;
  rateLimits?: Partial<
    Pick<WorkerOptions, "maxActivitiesPerSecond" | "maxTaskQueueActivitiesPerSecond">
  >;
  concurrency?: Partial<
    Pick<
    WorkerOptions,
    | "maxConcurrentWorkflowTaskExecutions"
    | "maxConcurrentActivityTaskExecutions"
    | "maxCachedWorkflows"
    | "maxConcurrentWorkflowTaskPolls"
    | "maxConcurrentActivityTaskPolls"
    >
  >;
  healthState?: WorkerHealthState | undefined;
}

export async function createTemporalWorker(
  input: CreateTemporalWorkerInput,
): Promise<{
  connection: NativeConnection;
  worker: Worker;
}> {
  input.healthState?.markBootstrapStarted();

  let connection: NativeConnection | null = null;

  try {
    connection = await NativeConnection.connect({
      address: temporalConfig.address,
    });

    const workerOptions: WorkerOptions = {
      connection,
      namespace: temporalConfig.namespace,
      taskQueue: input.taskQueue,
      interceptors: {
        activity: workerActivityObservabilityInterceptors,
      },
      ...(input.concurrency ?? {}),
      ...(input.rateLimits ?? {}),
      ...(input.sinks === undefined ? {} : { sinks: input.sinks }),
      ...(input.includeWorkflows ? { workflowsPath } : {}),
      ...(input.activities === undefined ? {} : { activities: input.activities }),
    };

    const queueRole = resolveTemporalTaskQueueRoleMetricLabel(input.taskQueue);

    setWorkerActivityRateLimit({
      taskQueue: input.taskQueue,
      queueRole,
      scope: "worker",
      maxActivitiesPerSecond: input.rateLimits?.maxActivitiesPerSecond ?? 0,
    });
    setWorkerActivityRateLimit({
      taskQueue: input.taskQueue,
      queueRole,
      scope: "task_queue",
      maxActivitiesPerSecond:
        input.rateLimits?.maxTaskQueueActivitiesPerSecond ?? 0,
    });

    const worker = await Worker.create(workerOptions);

    input.healthState?.markBootstrapCompleted();

    return {
      connection,
      worker,
    };
  } catch (error) {
    input.healthState?.markBootstrapFailed(error);

    if (connection !== null) {
      await connection.close();
    }

    throw error;
  }
}

export async function createMainWorker(
  healthState?: WorkerHealthState,
): Promise<{
  connection: NativeConnection;
  worker: Worker;
}> {
  return createTemporalWorker({
    taskQueue: temporalConfig.taskQueues.control,
    concurrency: temporalConfig.workerConcurrency.control,
    includeWorkflows: true,
    healthState,
  });
}
