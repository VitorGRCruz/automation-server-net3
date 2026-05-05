import { closeSharedHttpClients } from "../../infra/http/shared-http-client.js";
import { temporalConfig } from "../../infra/config/temporal.config.js";
import { createOpaWorker } from "./create-opa-worker.js";
import { runTemporalWorkerProcess } from "./run-temporal-worker.js";

async function runOpaWorker(): Promise<void> {
  await runTemporalWorkerProcess({
    workerName: "opa",
    taskQueue: temporalConfig.taskQueues.opa,
    createWorker: async () => createOpaWorker(),
    shutdownSteps: [
      {
        name: "close shared HTTP agents",
        run: async () => {
          await closeSharedHttpClients();
        },
      },
    ],
  });
}

runOpaWorker().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
