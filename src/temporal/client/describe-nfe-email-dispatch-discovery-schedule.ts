import { temporalConfig } from "../../infra/config/temporal.config.js";
import { findNfeEmailDispatchDiscoverySchedule } from "./nfe-email-dispatch-discovery-schedule.client.js";

async function run(): Promise<void> {
  const schedule = await findNfeEmailDispatchDiscoverySchedule();

  console.log(
    JSON.stringify(
      {
        namespace: temporalConfig.namespace,
        temporalAddress: temporalConfig.address,
        scheduleId: temporalConfig.schedules.nfeEmailDispatchDiscovery.scheduleId,
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
