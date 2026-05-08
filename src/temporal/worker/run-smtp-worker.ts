import { closeSharedSmtpClient } from "../../integrations/smtp/smtp.client.js";
import { temporalConfig } from "../../infra/config/temporal.config.js";
import { closeSharedSystemDbClient } from "../../infra/system-db/system-db.client.js";
import { createSmtpWorker } from "./create-smtp-worker.js";
import { runTemporalWorkerProcess } from "./run-temporal-worker.js";

async function runSmtpWorker(): Promise<void> {
  await runTemporalWorkerProcess({
    workerName: "smtp",
    taskQueue: temporalConfig.taskQueues.smtp,
    createWorker: async () => createSmtpWorker(),
    shutdownSteps: [
      {
        name: "close shared SMTP transport",
        run: async () => {
          await closeSharedSmtpClient();
        },
      },
      {
        name: "close shared system DB pool",
        run: async () => {
          await closeSharedSystemDbClient();
        },
      },
    ],
  });
}

runSmtpWorker().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
