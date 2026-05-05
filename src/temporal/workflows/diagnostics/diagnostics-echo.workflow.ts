import { proxyActivities } from "@temporalio/workflow";
import type {
  DiagnosticsEchoWorkflowInput,
  DiagnosticsEchoWorkflowResult,
} from "../../../domain/shared/diagnostics.types.js";
import { temporalTaskQueues } from "../../../infra/config/temporal-task-queues.js";
import type * as sharedActivities from "../../activities/shared/diagnostics-ping.activity.js";

const { diagnosticsPingActivity } = proxyActivities<typeof sharedActivities>({
  taskQueue: temporalTaskQueues.control,
  startToCloseTimeout: "1 minute",
});

export async function diagnosticsEchoWorkflow(
  input: DiagnosticsEchoWorkflowInput,
): Promise<DiagnosticsEchoWorkflowResult> {
  const activityResult = await diagnosticsPingActivity({
    message: input.message,
  });

  return {
    requestId: input.requestId,
    source: input.source,
    echoedMessage: input.message,
    activityReply: activityResult.data.reply,
    checkedAt: activityResult.data.checkedAt,
  };
}
