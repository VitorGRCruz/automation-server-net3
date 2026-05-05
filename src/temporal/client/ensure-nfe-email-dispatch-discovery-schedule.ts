import { temporalConfig } from "../../infra/config/temporal.config.js";
import { ensureNfeEmailDispatchDiscoverySchedule } from "./nfe-email-dispatch-discovery-schedule.client.js";

async function run(): Promise<void> {
  const schedule = await ensureNfeEmailDispatchDiscoverySchedule();

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
