import { temporalConfig } from "../../infra/config/temporal.config.js";
import { deleteCobrancasEquipmentRetrievalTriggerSchedule } from "./cobrancas-equipment-retrieval-schedule.client.js";

async function run(): Promise<void> {
  const result = await deleteCobrancasEquipmentRetrievalTriggerSchedule();

  console.log(
    JSON.stringify(
      {
        namespace: temporalConfig.namespace,
        temporalAddress: temporalConfig.address,
        ...result,
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
