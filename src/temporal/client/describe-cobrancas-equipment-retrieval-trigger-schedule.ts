import { temporalConfig } from "../../infra/config/temporal.config.js";
import { findCobrancasEquipmentRetrievalTriggerSchedule } from "./cobrancas-equipment-retrieval-schedule.client.js";

async function run(): Promise<void> {
  const schedule = await findCobrancasEquipmentRetrievalTriggerSchedule();

  console.log(
    JSON.stringify(
      {
        namespace: temporalConfig.namespace,
        temporalAddress: temporalConfig.address,
        scheduleId:
          temporalConfig.schedules.cobrancasEquipmentRetrievalVerification.scheduleId,
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
