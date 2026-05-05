import { temporalConfig } from "../../infra/config/temporal.config.js";
import { ensureNfeEmailDispatchProcessingSchedule } from "./nfe-email-dispatch-processing-schedule.client.js";

async function run(): Promise<void> {
  const schedule = await ensureNfeEmailDispatchProcessingSchedule();

  console.log(
    JSON.stringify(
      {
        namespace: temporalConfig.namespace,
        temporalAddress: temporalConfig.address,
        schedule,
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
