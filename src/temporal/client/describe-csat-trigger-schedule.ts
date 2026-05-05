import { temporalConfig } from "../../infra/config/temporal.config.js";
import { findCsatTriggerSchedule } from "./csat-schedule.client.js";

async function run(): Promise<void> {
  const schedule = await findCsatTriggerSchedule();

  console.log(
    JSON.stringify(
      {
        namespace: temporalConfig.namespace,
        temporalAddress: temporalConfig.address,
        scheduleId: temporalConfig.schedules.csatStartSurvey.scheduleId,
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
