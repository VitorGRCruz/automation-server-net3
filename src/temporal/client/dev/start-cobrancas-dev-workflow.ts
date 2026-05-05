import type { EquipmentRetrievalVerificationTriggerWorkflowInput } from "../../../domain/cobrancas/equipment-retrieval-verification.types.js";
import { temporalConfig } from "../../../infra/config/temporal.config.js";
import {
  equipmentRetrievalVerificationWorkflow,
} from "../../workflows/cobrancas/equipment-retrieval-verification.workflow.js";
import {
  buildScopedManualWorkflowStart,
  resolveDevelopmentRuntimePolicyFromEnv,
  startDevelopmentWorkflow,
} from "./runtime-policy.client.js";

async function run(): Promise<void> {
  const runtime = resolveDevelopmentRuntimePolicyFromEnv();
  const workflowStart = buildScopedManualWorkflowStart(
    "cobrancas-equipment-retrieval-verification/manual",
    runtime.runtimePolicy,
  );
  const input: EquipmentRetrievalVerificationTriggerWorkflowInput = {
    requestId: workflowStart.requestId,
    source: "manual",
    startAt: temporalConfig.schedules.cobrancasEquipmentRetrievalVerification.startAt,
    runtimePolicy: runtime.runtimePolicyInput,
  };
  const summary = await startDevelopmentWorkflow(
    equipmentRetrievalVerificationWorkflow,
    "equipmentRetrievalVerificationWorkflow",
    {
      taskQueue: temporalConfig.taskQueues.control,
      workflowId: workflowStart.workflowId,
      requestId: workflowStart.requestId,
      workflowIdReusePolicy: workflowStart.workflowIdReusePolicy,
      args: [input],
    },
    runtime,
  );

  console.log(JSON.stringify(summary, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
