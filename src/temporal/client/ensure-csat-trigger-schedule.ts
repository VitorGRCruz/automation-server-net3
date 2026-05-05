import { temporalConfig } from "../../infra/config/temporal.config.js";
import { ensureCsatTriggerSchedule } from "./csat-schedule.client.js";

async function run(): Promise<void> {
  const schedule = await ensureCsatTriggerSchedule();

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
