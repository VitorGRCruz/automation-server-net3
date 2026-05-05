import { randomUUID } from "node:crypto";
import type {
  DiagnosticsEchoWorkflowInput,
  DiagnosticsEchoWorkflowResult,
} from "../../domain/shared/diagnostics.types.js";
import { temporalConfig } from "../../infra/config/temporal.config.js";
import { diagnosticsEchoWorkflow } from "../workflows/diagnostics/diagnostics-echo.workflow.js";
import { createTemporalClient, createTemporalConnection } from "./temporal-client.js";

export interface StartDiagnosticsWorkflowParams {
  requestId?: string;
  source: DiagnosticsEchoWorkflowInput["source"];
  message: string;
}

export interface StartedDiagnosticsWorkflow {
  workflowId: string;
  runId: string | undefined;
}

export interface ExecutedDiagnosticsWorkflow extends StartedDiagnosticsWorkflow {
  result: DiagnosticsEchoWorkflowResult;
}

function buildDiagnosticsWorkflowStart(
  params: StartDiagnosticsWorkflowParams,
): {
  input: DiagnosticsEchoWorkflowInput;
  workflowId: string;
} {
  const requestId = params.requestId ?? randomUUID();

  return {
    input: {
      requestId,
      source: params.source,
      message: params.message,
    },
    workflowId: `diagnostics-echo-${requestId}`,
  };
}

export async function startDiagnosticsWorkflow(
  params: StartDiagnosticsWorkflowParams,
): Promise<StartedDiagnosticsWorkflow> {
  const workflowStart = buildDiagnosticsWorkflowStart(params);
  const connection = await createTemporalConnection();

  try {
    const client = createTemporalClient(connection);
    const handle = await client.workflow.start(diagnosticsEchoWorkflow, {
      taskQueue: temporalConfig.taskQueues.control,
      workflowId: workflowStart.workflowId,
      args: [workflowStart.input],
    });

    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
    };
  } finally {
    await connection.close();
  }
}

export async function executeDiagnosticsWorkflow(
  params: StartDiagnosticsWorkflowParams,
): Promise<ExecutedDiagnosticsWorkflow> {
  const workflowStart = buildDiagnosticsWorkflowStart(params);
  const connection = await createTemporalConnection();

  try {
    const client = createTemporalClient(connection);
    const handle = await client.workflow.start(diagnosticsEchoWorkflow, {
      taskQueue: temporalConfig.taskQueues.control,
      workflowId: workflowStart.workflowId,
      args: [workflowStart.input],
    });

    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      result: await handle.result(),
    };
  } finally {
    await connection.close();
  }
}
