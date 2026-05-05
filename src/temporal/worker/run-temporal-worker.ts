import { Runtime, type NativeConnection, type Worker } from "@temporalio/worker";
import { appConfig } from "../../infra/config/app.config.js";
import { temporalConfig } from "../../infra/config/temporal.config.js";
import {
  registerGracefulShutdown,
  runShutdownSteps,
  type ShutdownStep,
} from "../../infra/runtime/graceful-shutdown.js";
import { runSystemDbMigrations } from "../../infra/system-db/run-system-db-migrations.js";
import { WorkerHealthServer } from "./worker-health-server.js";
import { WorkerHealthState } from "./worker-health-state.js";

interface RunTemporalWorkerProcessInput {
  workerName: string;
  taskQueue: string;
  createWorker: (
    healthState?: WorkerHealthState,
  ) => Promise<{
    connection: NativeConnection;
    worker: Worker;
  }>;
  enableHealthServer?: boolean;
  shutdownSteps?: readonly ShutdownStep[];
}

let temporalRuntimeInstalled = false;

export async function runTemporalWorkerProcess(
  input: RunTemporalWorkerProcessInput,
): Promise<void> {
  ensureTemporalRuntimeInstalled();
  await runSystemDbMigrations();

  const logger = createConsoleShutdownLogger(input.workerName);
  const healthState =
    input.enableHealthServer === true ? new WorkerHealthState() : undefined;
  const healthServer =
    healthState === undefined ? null : new WorkerHealthServer(healthState);

  let connection: NativeConnection | null = null;
  let worker: Worker | null = null;
  let healthServerStopped = false;
  let workerShutdownRequested = false;

  const shutdown = registerGracefulShutdown({
    component: input.workerName,
    logger,
    onSignal: async (signal) => {
      await runShutdownSteps(
        logger,
        {
          component: input.workerName,
          signal,
        },
        [
          {
            name: "stop worker health server",
            run: async () => {
              await stopHealthServer();
            },
          },
          {
            name: "request Temporal worker drain",
            run: async () => {
              requestWorkerShutdown(signal);
            },
          },
        ],
      );
    },
  });

  try {
    if (healthServer !== null) {
      await healthServer.start();
      console.log(
        `Worker health server listening on http://${appConfig.workerHealth.host}:${appConfig.workerHealth.port}`,
      );
    }

    const createdWorker = await input.createWorker(healthState);
    connection = createdWorker.connection;
    worker = createdWorker.worker;

    console.log(
      `Temporal ${input.workerName} worker connected to ${temporalConfig.address} on ${input.taskQueue}`,
    );

    if (shutdown.getSignal() !== null) {
      requestWorkerShutdown(shutdown.getSignal());
    }

    healthState?.markRunLoopStarted();
    await worker.run();
    healthState?.markRunLoopStopped();
  } catch (error) {
    healthState?.markFatalError(error);
    healthState?.markRunLoopStopped();
    throw error;
  } finally {
    shutdown.remove();
    await shutdown.waitForShutdown();

    try {
      await runShutdownSteps(
        logger,
        {
          component: input.workerName,
          signal: shutdown.getSignal(),
        },
        [
          {
            name: "stop worker health server",
            run: async () => {
              await stopHealthServer();
            },
          },
          ...(input.shutdownSteps ?? []),
          {
            name: "close Temporal native connection",
            run: async () => {
              if (connection !== null) {
                await connection.close();
              }
            },
          },
        ],
      );
    } finally {
      if (shutdown.getSignal() !== null) {
        console.log(
          `Temporal ${input.workerName} worker shutdown finished after ${shutdown.getSignal()}`,
        );
      }
    }
  }

  function requestWorkerShutdown(signal: NodeJS.Signals | null): void {
    if (worker === null) {
      console.log(
        `Graceful shutdown requested for ${input.workerName} worker before Temporal worker creation completed`,
      );
      return;
    }

    if (workerShutdownRequested) {
      return;
    }

    workerShutdownRequested = true;
    console.log(
      `Graceful shutdown requested for ${input.workerName} worker${signal === null ? "" : ` by ${signal}`}; draining Temporal worker`,
    );
    worker.shutdown();
  }

  async function stopHealthServer(): Promise<void> {
    if (healthServer === null || healthServerStopped) {
      return;
    }

    await healthServer.close();
    healthServerStopped = true;
    console.log(`Worker health server stopped for ${input.workerName} worker`);
  }
}

function ensureTemporalRuntimeInstalled(): void {
  if (temporalRuntimeInstalled) {
    return;
  }

  Runtime.install({
    shutdownSignals: [],
  });
  temporalRuntimeInstalled = true;
}

function createConsoleShutdownLogger(component: string) {
  return {
    info(message: string, context?: Record<string, unknown>) {
      console.log(formatConsoleLog("INFO", component, message, context));
    },
    warn(message: string, context?: Record<string, unknown>) {
      console.warn(formatConsoleLog("WARN", component, message, context));
    },
    error(message: string, error: unknown, context?: Record<string, unknown>) {
      console.error(formatConsoleLog("ERROR", component, message, context), error);
    },
  };
}

function formatConsoleLog(
  level: "INFO" | "WARN" | "ERROR",
  component: string,
  message: string,
  context?: Record<string, unknown>,
): string {
  const serializedContext =
    context === undefined ? "" : ` ${JSON.stringify(context)}`;

  return `[${level}] ${component}: ${message}${serializedContext}`;
}
