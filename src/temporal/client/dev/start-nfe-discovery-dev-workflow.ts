import type { FetchCustomerNfeSalesCandidatesWorkflowInput } from "../../../domain/nfe/nfe-email-dispatch.types.js";
import { nfeEmailDispatchConfig } from "../../../infra/config/nfe-email-dispatch.config.js";
import { temporalConfig } from "../../../infra/config/temporal.config.js";
import { fetchCustomerNfeSalesCandidatesWorkflow } from "../../workflows/nfe/fetch-customer-nfe-sales-candidates.workflow.js";
import {
  buildScopedManualWorkflowStart,
  resolveDevelopmentRuntimePolicyFromEnv,
  startDevelopmentWorkflow,
} from "./runtime-policy.client.js";

async function run(): Promise<void> {
  const runtime = resolveDevelopmentRuntimePolicyFromEnv();
  const workflowStart = buildScopedManualWorkflowStart(
    "nfe-email-dispatch/discovery/manual",
    runtime.runtimePolicy,
  );
  const input: FetchCustomerNfeSalesCandidatesWorkflowInput = {
    requestId: workflowStart.requestId,
    source: "manual",
    discoveryWindowDays: nfeEmailDispatchConfig.discoveryWindowDays,
    maxConcurrentChildren: nfeEmailDispatchConfig.maxConcurrentChildren,
    runtimePolicy: runtime.runtimePolicyInput,
  };
  const summary = await startDevelopmentWorkflow(
    fetchCustomerNfeSalesCandidatesWorkflow,
    "fetchCustomerNfeSalesCandidatesWorkflow",
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
