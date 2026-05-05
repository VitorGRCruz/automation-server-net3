import { closeSharedHttpClients } from "../../infra/http/shared-http-client.js";
import { closeSharedSystemDbClient } from "../../infra/system-db/system-db.client.js";
import { temporalConfig } from "../../infra/config/temporal.config.js";
import { createIxcWorker } from "./create-ixc-worker.js";
import { runTemporalWorkerProcess } from "./run-temporal-worker.js";

async function runIxcWorker(): Promise<void> {
  await runTemporalWorkerProcess({
    workerName: "ixc",
    taskQueue: temporalConfig.taskQueues.ixc,
    createWorker: async () => createIxcWorker(),
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

runIxcWorker().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
