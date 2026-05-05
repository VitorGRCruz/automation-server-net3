import type { StepSuccessResult } from "./step-result.types.js";

export type WorkflowStartSource = "manual" | "webhook" | "schedule";

export interface DiagnosticsEchoWorkflowInput {
  requestId: string;
  source: WorkflowStartSource;
  message: string;
}

export interface DiagnosticsEchoWorkflowResult {
  requestId: string;
  source: WorkflowStartSource;
  echoedMessage: string;
  activityReply: string;
  checkedAt: string;
}

export interface DiagnosticsPingActivityInput {
  message: string;
}

export interface DiagnosticsPingActivityData {
  reply: string;
  checkedAt: string;
}

export type DiagnosticsPingActivityResult =
  StepSuccessResult<DiagnosticsPingActivityData>;
