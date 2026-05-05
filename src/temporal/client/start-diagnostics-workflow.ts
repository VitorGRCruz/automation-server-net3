import { temporalConfig } from "../../infra/config/temporal.config.js";
import { executeDiagnosticsWorkflow } from "./diagnostics.client.js";

async function run(): Promise<void> {
  const execution = await executeDiagnosticsWorkflow({
    source: "manual",
    message: "ping",
  });

  console.log(
    JSON.stringify(
      {
        namespace: temporalConfig.namespace,
        taskQueue: temporalConfig.taskQueues.control,
        workflowId: execution.workflowId,
        runId: execution.runId,
      },
      null,
      2,
    ),
  );

  console.log(JSON.stringify(execution.result, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
