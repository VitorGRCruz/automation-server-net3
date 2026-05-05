import { closeSharedHttpClients } from "../../infra/http/shared-http-client.js";
import { closeSharedSystemDbClient } from "../../infra/system-db/system-db.client.js";
import { temporalConfig } from "../../infra/config/temporal.config.js";
import { createControlWorker } from "./create-control-worker.js";
import { runTemporalWorkerProcess } from "./run-temporal-worker.js";

export async function startControlWorker(): Promise<void> {
  await runTemporalWorkerProcess({
    workerName: "control",
    taskQueue: temporalConfig.taskQueues.control,
    createWorker: createControlWorker,
    enableHealthServer: true,
    shutdownSteps: [
      {
        name: "close shared system DB pool",
        run: async () => {
          await closeSharedSystemDbClient();
        },
      },
      {
        name: "close shared HTTP agents",
        run: async () => {
          await closeSharedHttpClients();
        },
      },
    ],
  });
}
