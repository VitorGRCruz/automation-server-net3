import { randomUUID } from "node:crypto";
import {
  ApplicationFailure,
  WorkflowExecutionAlreadyStartedError,
  WorkflowFailedError,
} from "@temporalio/client";
import type { ManualProcessNfeEmailDispatchSaleWorkflowResult } from "../../domain/nfe/nfe-email-dispatch.types.js";
import type { AutomationRuntimePolicyInput } from "../../domain/shared/automation-runtime-policy.types.js";
import {
  normalizeAutomationRuntimePolicy,
  normalizeAutomationRuntimeScope,
  resolveChildWorkflowIdReusePolicy,
  scopeWorkflowId,
} from "../../domain/shared/automation-runtime-policy.js";
import { temporalTaskQueues } from "../../infra/config/temporal-task-queues.js";
import { nfeEmailDispatchConfig } from "../../infra/config/nfe-email-dispatch.config.js";
import { searchNfeEmailDispatchSales } from "../../infra/system-db/nfe-email-dispatch.repository.js";
import { getSharedSystemDbClient } from "../../infra/system-db/system-db.client.js";
import { processManualNfeEmailDispatchSaleWorkflow } from "../workflows/nfe/process-manual-nfe-email-dispatch-sale.workflow.js";
import { createTemporalClient, createTemporalConnection } from "./temporal-client.js";

const MANUAL_SALE_NOT_FOUND_FAILURE_TYPE = "NFE_MANUAL_SALE_NOT_FOUND";
const MANUAL_SALE_ALREADY_SENT_FAILURE_TYPE = "NFE_MANUAL_ALREADY_SENT";
const MANUAL_SALE_ALREADY_RUNNING_FAILURE_TYPE = "NFE_MANUAL_ALREADY_RUNNING";
const MANUAL_SALE_INVALID_INPUT_FAILURE_TYPE = "NFE_MANUAL_SALE_INVALID_INPUT";

export interface ExecuteManualNfeEmailDispatchSaleWorkflowParams {
  requestId?: string;
  nfeEmailDispatchSaleId: number;
  erpSaleId: number;
}

export interface ExecutedManualNfeEmailDispatchSaleWorkflow {
  workflowId: string;
  runId: string | undefined;
  result: ManualProcessNfeEmailDispatchSaleWorkflowResult;
}

export class ManualNfeEmailDispatchWorkflowError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(input: { message: string; statusCode: number; code: string }) {
    super(input.message);
    this.name = "ManualNfeEmailDispatchWorkflowError";
    this.statusCode = input.statusCode;
    this.code = input.code;
  }
}

export async function executeManualNfeEmailDispatchSaleWorkflow(
  params: ExecuteManualNfeEmailDispatchSaleWorkflowParams,
): Promise<ExecutedManualNfeEmailDispatchSaleWorkflow> {
  const workflowStart = await buildManualWorkflowStart(params);
  const connection = await createTemporalConnection();

  try {
    const client = createTemporalClient(connection);
    const handle = await client.workflow.start(
      processManualNfeEmailDispatchSaleWorkflow,
      {
        taskQueue: workflowStart.taskQueue,
        workflowId: workflowStart.workflowId,
        workflowIdReusePolicy: workflowStart.workflowIdReusePolicy,
        args: [workflowStart.input],
      },
    );

    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      result: await handle.result(),
    };
  } catch (error) {
    throw normalizeManualWorkflowError(error);
  } finally {
    await connection.close();
  }
}

async function buildManualWorkflowStart(
  params: ExecuteManualNfeEmailDispatchSaleWorkflowParams,
): Promise<{
  input: Parameters<typeof processManualNfeEmailDispatchSaleWorkflow>[0];
  workflowId: string;
  workflowIdReusePolicy: "ALLOW_DUPLICATE" | "ALLOW_DUPLICATE_FAILED_ONLY";
  taskQueue: string;
}> {
  const requestId = params.requestId?.trim() || randomUUID();
  const resolvedRuntimePolicyInput =
    await resolveManualWorkflowRuntimePolicyInput(params);
  const runtimePolicy = normalizeAutomationRuntimePolicy(
    resolvedRuntimePolicyInput,
  );
  const sanitizedRequestId = sanitizeWorkflowIdPart(requestId);

  return {
    input: {
      requestId,
      nfeEmailDispatchSaleId: params.nfeEmailDispatchSaleId,
      erpSaleId: params.erpSaleId,
      maxSendAttempts: nfeEmailDispatchConfig.maxSendAttempts,
      ...(resolvedRuntimePolicyInput === undefined
        ? {}
        : { runtimePolicy: resolvedRuntimePolicyInput }),
    },
    workflowId: scopeWorkflowId(
      `nfe-email-dispatch/manual-process-sale/sale-${params.nfeEmailDispatchSaleId}/request-${sanitizedRequestId}`,
      runtimePolicy,
    ),
    workflowIdReusePolicy: resolveChildWorkflowIdReusePolicy(runtimePolicy),
    taskQueue: temporalTaskQueues.control,
  };
}

async function resolveManualWorkflowRuntimePolicyInput(
  params: ExecuteManualNfeEmailDispatchSaleWorkflowParams,
): Promise<AutomationRuntimePolicyInput | undefined> {
  const sale = await loadNfeEmailDispatchSaleRecordByIdAnyScope(
    params.nfeEmailDispatchSaleId,
  );

  if (sale === null) {
    throw new ManualNfeEmailDispatchWorkflowError({
      message: `NF-e sale ${params.nfeEmailDispatchSaleId} was not found in automation storage`,
      statusCode: 404,
      code: MANUAL_SALE_NOT_FOUND_FAILURE_TYPE,
    });
  }

  if (sale.erpSaleId !== params.erpSaleId) {
    throw new ManualNfeEmailDispatchWorkflowError({
      message: `NF-e sale ${params.nfeEmailDispatchSaleId} is linked to erpSaleId ${sale.erpSaleId}, but the request received ${params.erpSaleId}`,
      statusCode: 400,
      code: MANUAL_SALE_INVALID_INPUT_FAILURE_TYPE,
    });
  }

  return buildRuntimePolicyFromScope(sale.runtimeScope);
}

async function loadNfeEmailDispatchSaleRecordByIdAnyScope(
  nfeEmailDispatchSaleId: number,
): Promise<{
  runtimeScope: string;
  erpSaleId: number;
} | null> {
  const systemDbClient = getSharedSystemDbClient();
  const result = await searchNfeEmailDispatchSales(systemDbClient, {
    id: nfeEmailDispatchSaleId,
    limit: 1,
    offset: 0,
  });
  const [sale] = result.items;

  if (sale === undefined) {
    return null;
  }

  return {
    runtimeScope: normalizeAutomationRuntimeScope(sale.runtimeScope),
    erpSaleId: sale.erpSaleId,
  };
}

function buildRuntimePolicyFromScope(
  runtimeScope: string,
): AutomationRuntimePolicyInput | undefined {
  const normalizedRuntimeScope = normalizeAutomationRuntimeScope(runtimeScope);

  if (normalizedRuntimeScope === "production") {
    return undefined;
  }

  if (normalizedRuntimeScope.startsWith("dev:")) {
    return {
      mode: "development",
      testRunId: normalizedRuntimeScope.slice(4),
    };
  }

  return undefined;
}

function sanitizeWorkflowIdPart(value: string): string {
  const normalizedValue = value.trim().replace(/[^A-Za-z0-9._-]+/g, "-");

  return normalizedValue.length > 0 ? normalizedValue : randomUUID();
}

function normalizeManualWorkflowError(error: unknown): Error {
  if (error instanceof ManualNfeEmailDispatchWorkflowError) {
    return error;
  }

  if (error instanceof WorkflowExecutionAlreadyStartedError) {
    return new ManualNfeEmailDispatchWorkflowError({
      message: "A manual NF-e processing workflow with the same workflowId is already running",
      statusCode: 409,
      code: MANUAL_SALE_ALREADY_RUNNING_FAILURE_TYPE,
    });
  }

  if (error instanceof WorkflowFailedError && error.cause instanceof ApplicationFailure) {
    switch (error.cause.type) {
      case MANUAL_SALE_NOT_FOUND_FAILURE_TYPE:
        return new ManualNfeEmailDispatchWorkflowError({
          message: error.cause.message,
          statusCode: 404,
          code: MANUAL_SALE_NOT_FOUND_FAILURE_TYPE,
        });
      case MANUAL_SALE_ALREADY_SENT_FAILURE_TYPE:
      case MANUAL_SALE_ALREADY_RUNNING_FAILURE_TYPE:
        return new ManualNfeEmailDispatchWorkflowError({
          message: error.cause.message,
          statusCode: 409,
          code: error.cause.type,
        });
      case MANUAL_SALE_INVALID_INPUT_FAILURE_TYPE:
      case "INVALID_WORKFLOW_INPUT":
        return new ManualNfeEmailDispatchWorkflowError({
          message: error.cause.message,
          statusCode: 400,
          code: error.cause.type,
        });
    }
  }

  return error instanceof Error ? error : new Error("Unknown manual NF-e workflow error");
}
