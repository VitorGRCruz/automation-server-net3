import { temporalConfig } from "../../infra/config/temporal.config.js";
import { findNfeEmailDispatchProcessingSchedule } from "./nfe-email-dispatch-processing-schedule.client.js";

async function run(): Promise<void> {
  const schedule = await findNfeEmailDispatchProcessingSchedule();

  console.log(
    JSON.stringify(
      {
        namespace: temporalConfig.namespace,
        temporalAddress: temporalConfig.address,
        scheduleId: temporalConfig.schedules.nfeEmailDispatchProcessing.scheduleId,
        exists: schedule !== null,
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
