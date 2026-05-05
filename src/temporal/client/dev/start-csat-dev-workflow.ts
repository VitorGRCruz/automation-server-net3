import type { CsatStartSurveyWorkflowInput } from "../../../domain/csat/csat-start-survey.types.js";
import { temporalConfig } from "../../../infra/config/temporal.config.js";
import { csatStartSurveyWorkflow } from "../../workflows/csat/csat-start-survey.workflow.js";
import {
  buildScopedManualWorkflowStart,
  resolveDevelopmentRuntimePolicyFromEnv,
  startDevelopmentWorkflow,
} from "./runtime-policy.client.js";

async function run(): Promise<void> {
  const runtime = resolveDevelopmentRuntimePolicyFromEnv();
  const workflowStart = buildScopedManualWorkflowStart(
    "csat-start-survey/manual",
    runtime.runtimePolicy,
  );
  const input: CsatStartSurveyWorkflowInput = {
    requestId: workflowStart.requestId,
    source: "manual",
    runtimePolicy: runtime.runtimePolicyInput,
  };
  const summary = await startDevelopmentWorkflow(
    csatStartSurveyWorkflow,
    "csatStartSurveyWorkflow",
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
