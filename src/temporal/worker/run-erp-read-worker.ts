import { closeSharedErpDbClient } from "../../integrations/erp-db/erp-db.client.js";
import { temporalConfig } from "../../infra/config/temporal.config.js";
import { createErpReadWorker } from "./create-erp-read-worker.js";
import { runTemporalWorkerProcess } from "./run-temporal-worker.js";

async function runErpReadWorker(): Promise<void> {
  await runTemporalWorkerProcess({
    workerName: "erp-read",
    taskQueue: temporalConfig.taskQueues.erpRead,
    createWorker: async () => createErpReadWorker(),
    shutdownSteps: [
      {
        name: "close shared ERP DB pool",
        run: async () => {
          await closeSharedErpDbClient();
        },
      },
    ],
  });
}

runErpReadWorker().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
