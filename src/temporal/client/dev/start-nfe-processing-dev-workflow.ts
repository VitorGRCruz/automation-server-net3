import type { ProcessNfeEmailDispatchSalesWorkflowInput } from "../../../domain/nfe/nfe-email-dispatch.types.js";
import { scopeWorkflowId } from "../../../domain/shared/automation-runtime-policy.js";
import { nfeEmailDispatchConfig } from "../../../infra/config/nfe-email-dispatch.config.js";
import { temporalConfig } from "../../../infra/config/temporal.config.js";
import { processNfeEmailDispatchSalesWorkflow } from "../../workflows/nfe/process-nfe-email-dispatch-sales.workflow.js";
import {
  buildScopedManualWorkflowStart,
  resolveDevelopmentRuntimePolicyFromEnv,
  startDevelopmentWorkflow,
} from "./runtime-policy.client.js";

async function run(): Promise<void> {
  const runtime = resolveDevelopmentRuntimePolicyFromEnv();
  const workflowStart = buildScopedManualWorkflowStart(
    "nfe-email-dispatch/processing/manual",
    runtime.runtimePolicy,
  );
  const input: ProcessNfeEmailDispatchSalesWorkflowInput = {
    requestId: workflowStart.requestId,
    source: "manual",
    maxConcurrentChildren: nfeEmailDispatchConfig.maxConcurrentChildren,
    maxSendAttempts: nfeEmailDispatchConfig.maxSendAttempts,
    discoveryWorkflowId: scopeWorkflowId(
      "nfe-email-dispatch/discovery/manual",
      runtime.runtimePolicy,
    ),
    runtimePolicy: runtime.runtimePolicyInput,
  };
  const summary = await startDevelopmentWorkflow(
    processNfeEmailDispatchSalesWorkflow,
    "processNfeEmailDispatchSalesWorkflow",
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
