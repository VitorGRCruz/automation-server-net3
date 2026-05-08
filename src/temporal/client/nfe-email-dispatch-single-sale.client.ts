import { randomUUID } from "node:crypto";
import {
  WorkflowExecutionAlreadyStartedError,
  WorkflowNotFoundError,
  type Client,
} from "@temporalio/client";
import type { NfeEmailDispatchSaleRecord } from "../../domain/nfe/nfe-email-dispatch.types.js";
import type { AutomationRuntimePolicyInput } from "../../domain/shared/automation-runtime-policy.types.js";
import {
  normalizeAutomationRuntimePolicy,
  normalizeAutomationRuntimeScope,
  resolveChildWorkflowIdReusePolicy,
  scopeWorkflowId,
} from "../../domain/shared/automation-runtime-policy.js";
import { temporalTaskQueues } from "../../infra/config/temporal-task-queues.js";
import { buildRegionalCurrentDateTime3 } from "../../infra/system-db/nfe-email-dispatch/date-time.js";
import {
  claimManualNfeEmailDispatchSale,
  findNfeEmailDispatchSaleForManualProcessing,
  rollbackManualNfeEmailDispatchSaleClaim,
  searchNfeEmailDispatchSales,
} from "../../infra/system-db/nfe-email-dispatch.repository.js";
import { getSharedSystemDbClient } from "../../infra/system-db/system-db.client.js";
import { processManualNfeEmailDispatchSaleWorkflow } from "../workflows/nfe/process-manual-nfe-email-dispatch-sale.workflow.js";
import { createTemporalClient, createTemporalConnection } from "./temporal-client.js";

const MANUAL_SALE_NOT_FOUND_FAILURE_TYPE = "NFE_MANUAL_SALE_NOT_FOUND";
const MANUAL_SALE_ALREADY_SENT_FAILURE_TYPE = "NFE_MANUAL_ALREADY_SENT";
const MANUAL_SALE_ALREADY_RUNNING_FAILURE_TYPE = "NFE_MANUAL_ALREADY_RUNNING";
const MANUAL_SALE_INVALID_INPUT_FAILURE_TYPE = "NFE_MANUAL_SALE_INVALID_INPUT";
const MANUAL_SALE_START_FAILED_FAILURE_TYPE = "NFE_MANUAL_START_FAILED";
const MANUAL_SALE_START_CONFIRMATION_FAILED_FAILURE_TYPE =
  "NFE_MANUAL_START_CONFIRMATION_FAILED";
const MANUAL_SALE_CLAIM_ROLLBACK_FAILED_FAILURE_TYPE =
  "NFE_MANUAL_CLAIM_ROLLBACK_FAILED";

export interface StartManualNfeEmailDispatchSaleWorkflowParams {
  requestId?: string;
  nfeEmailDispatchSaleId: number;
  erpSaleId: number;
}

export interface StartedManualNfeEmailDispatchSaleWorkflowResult {
  nfeEmailDispatchSaleId: number;
  erpSaleId: number;
  status: "IN_PROGRESS";
  attemptCount: number;
  attemptStartedAt: string;
}

export interface StartedManualNfeEmailDispatchSaleWorkflow {
  workflowId: string;
  runId: string | undefined;
  result: StartedManualNfeEmailDispatchSaleWorkflowResult;
}

interface PreparedManualWorkflowStart {
  workflowId: string;
  workflowIdReusePolicy: "ALLOW_DUPLICATE" | "ALLOW_DUPLICATE_FAILED_ONLY";
  taskQueue: string;
  input: Parameters<typeof processManualNfeEmailDispatchSaleWorkflow>[0];
  loadedSale: NfeEmailDispatchSaleRecord;
  result: StartedManualNfeEmailDispatchSaleWorkflowResult;
}

type WorkflowDescriptionLookup =
  | {
      status: "found";
      runId: string;
    }
  | {
      status: "not-found";
    }
  | {
      status: "unknown";
      error: unknown;
    };

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

export async function startManualNfeEmailDispatchSaleWorkflow(
  params: StartManualNfeEmailDispatchSaleWorkflowParams,
): Promise<StartedManualNfeEmailDispatchSaleWorkflow> {
  const workflowStart = await buildManualWorkflowStart(params);
  const connection = await createTemporalConnection();

  try {
    const client = createTemporalClient(connection);

    try {
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
        result: workflowStart.result,
      };
    } catch (error) {
      const workflowLookup = await describeWorkflowById(
        client,
        workflowStart.workflowId,
      );

      if (workflowLookup.status === "found") {
        return {
          workflowId: workflowStart.workflowId,
          runId: workflowLookup.runId,
          result: workflowStart.result,
        };
      }

      if (workflowLookup.status === "unknown") {
        throw new ManualNfeEmailDispatchWorkflowError({
          message:
            "Manual NF-e processing could not confirm whether the workflow started; the sale remains IN_PROGRESS for investigation",
          statusCode: 503,
          code: MANUAL_SALE_START_CONFIRMATION_FAILED_FAILURE_TYPE,
        });
      }

      await rollbackManualWorkflowClaim(workflowStart);
      throw normalizeManualWorkflowStartError(error);
    }
  } finally {
    await connection.close();
  }
}

async function buildManualWorkflowStart(
  params: StartManualNfeEmailDispatchSaleWorkflowParams,
): Promise<PreparedManualWorkflowStart> {
  const requestId = params.requestId?.trim() || randomUUID();
  const loadedSale = await loadNfeEmailDispatchSaleRecordByIdAnyScope(
    params.nfeEmailDispatchSaleId,
  );

  if (loadedSale === null) {
    throw new ManualNfeEmailDispatchWorkflowError({
      message: `NF-e sale ${params.nfeEmailDispatchSaleId} was not found in automation storage`,
      statusCode: 404,
      code: MANUAL_SALE_NOT_FOUND_FAILURE_TYPE,
    });
  }

  if (loadedSale.erpSaleId !== params.erpSaleId) {
    throw new ManualNfeEmailDispatchWorkflowError({
      message:
        `NF-e sale ${params.nfeEmailDispatchSaleId} is linked to erpSaleId ` +
        `${loadedSale.erpSaleId}, but the request received ${params.erpSaleId}`,
      statusCode: 400,
      code: MANUAL_SALE_INVALID_INPUT_FAILURE_TYPE,
    });
  }

  if (loadedSale.status === "SENT") {
    throw new ManualNfeEmailDispatchWorkflowError({
      message:
        `NF-e sale ${params.nfeEmailDispatchSaleId} was already sent and ` +
        "cannot be reprocessed manually",
      statusCode: 409,
      code: MANUAL_SALE_ALREADY_SENT_FAILURE_TYPE,
    });
  }

  if (loadedSale.status === "IN_PROGRESS") {
    throw new ManualNfeEmailDispatchWorkflowError({
      message:
        `NF-e sale ${params.nfeEmailDispatchSaleId} is already being processed`,
      statusCode: 409,
      code: MANUAL_SALE_ALREADY_RUNNING_FAILURE_TYPE,
    });
  }

  const runtimePolicyInput = buildRuntimePolicyFromScope(loadedSale.runtimeScope);
  const runtimePolicy = normalizeAutomationRuntimePolicy(runtimePolicyInput);
  const attemptStartedAt = buildRegionalCurrentDateTime3();
  const systemDbClient = getSharedSystemDbClient();
  const claimResult = await claimManualNfeEmailDispatchSale(systemDbClient, {
    saleId: params.nfeEmailDispatchSaleId,
    attemptStartedAt,
    runtimeScope: loadedSale.runtimeScope,
  });
  const attemptCount =
    claimResult.status === "skipped"
      ? await throwManualClaimSkippedError(
          params.nfeEmailDispatchSaleId,
          params.erpSaleId,
          loadedSale.runtimeScope,
        )
      : claimResult.attemptCount;
  const result: StartedManualNfeEmailDispatchSaleWorkflowResult = {
    nfeEmailDispatchSaleId: params.nfeEmailDispatchSaleId,
    erpSaleId: params.erpSaleId,
    status: "IN_PROGRESS",
    attemptCount,
    attemptStartedAt,
  };

  return {
    workflowId: scopeWorkflowId(
      `nfe-email-dispatch/manual-process-sale/sale-${params.nfeEmailDispatchSaleId}` +
        `/attempt-${attemptCount}`,
      runtimePolicy,
    ),
    workflowIdReusePolicy: resolveChildWorkflowIdReusePolicy(runtimePolicy),
    taskQueue: temporalTaskQueues.control,
    input: {
      requestId,
      nfeEmailDispatchSaleId: params.nfeEmailDispatchSaleId,
      erpSaleId: params.erpSaleId,
      attemptCount,
      attemptStartedAt,
      ...(runtimePolicyInput === undefined
        ? {}
        : { runtimePolicy: runtimePolicyInput }),
    },
    loadedSale,
    result,
  };
}

async function loadNfeEmailDispatchSaleRecordByIdAnyScope(
  nfeEmailDispatchSaleId: number,
): Promise<NfeEmailDispatchSaleRecord | null> {
  const systemDbClient = getSharedSystemDbClient();
  const result = await searchNfeEmailDispatchSales(systemDbClient, {
    id: nfeEmailDispatchSaleId,
    limit: 1,
    offset: 0,
  });
  const [sale] = result.items;

  return sale ?? null;
}

async function throwManualClaimSkippedError(
  nfeEmailDispatchSaleId: number,
  erpSaleId: number,
  runtimeScope: string,
): Promise<never> {
  const systemDbClient = getSharedSystemDbClient();
  const reloadedSale = await findNfeEmailDispatchSaleForManualProcessing(
    systemDbClient,
    nfeEmailDispatchSaleId,
    runtimeScope,
  );

  if (reloadedSale === null) {
    throw new ManualNfeEmailDispatchWorkflowError({
      message: `NF-e sale ${nfeEmailDispatchSaleId} was not found in automation storage`,
      statusCode: 404,
      code: MANUAL_SALE_NOT_FOUND_FAILURE_TYPE,
    });
  }

  if (reloadedSale.erpSaleId !== erpSaleId) {
    throw new ManualNfeEmailDispatchWorkflowError({
      message:
        `NF-e sale ${nfeEmailDispatchSaleId} is linked to erpSaleId ` +
        `${reloadedSale.erpSaleId}, but the request received ${erpSaleId}`,
      statusCode: 400,
      code: MANUAL_SALE_INVALID_INPUT_FAILURE_TYPE,
    });
  }

  if (reloadedSale.status === "SENT") {
    throw new ManualNfeEmailDispatchWorkflowError({
      message:
        `NF-e sale ${nfeEmailDispatchSaleId} was already sent and cannot be reprocessed manually`,
      statusCode: 409,
      code: MANUAL_SALE_ALREADY_SENT_FAILURE_TYPE,
    });
  }

  if (reloadedSale.status === "IN_PROGRESS") {
    throw new ManualNfeEmailDispatchWorkflowError({
      message:
        `NF-e sale ${nfeEmailDispatchSaleId} is already being processed`,
      statusCode: 409,
      code: MANUAL_SALE_ALREADY_RUNNING_FAILURE_TYPE,
    });
  }

  throw new ManualNfeEmailDispatchWorkflowError({
    message:
      `NF-e sale ${nfeEmailDispatchSaleId} could not be claimed for manual ` +
      `processing from status ${reloadedSale.status}`,
    statusCode: 409,
    code: MANUAL_SALE_INVALID_INPUT_FAILURE_TYPE,
  });
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

async function describeWorkflowById(
  client: Client,
  workflowId: string,
): Promise<WorkflowDescriptionLookup> {
  try {
    const description = await client.workflow.getHandle(workflowId).describe();

    return {
      status: "found",
      runId: description.runId,
    };
  } catch (error) {
    if (error instanceof WorkflowNotFoundError) {
      return {
        status: "not-found",
      };
    }

    return {
      status: "unknown",
      error,
    };
  }
}

async function rollbackManualWorkflowClaim(
  workflowStart: PreparedManualWorkflowStart,
): Promise<void> {
  const systemDbClient = getSharedSystemDbClient();
  const rollbackResult = await rollbackManualNfeEmailDispatchSaleClaim(
    systemDbClient,
    {
      saleId: workflowStart.loadedSale.id,
      runtimeScope: workflowStart.loadedSale.runtimeScope,
      currentAttemptCount: workflowStart.result.attemptCount,
      currentAttemptStartedAt: workflowStart.result.attemptStartedAt,
      previousStatus: workflowStart.loadedSale.status,
      previousAttemptCount: workflowStart.loadedSale.attemptCount,
      previousFirstAttemptAt: workflowStart.loadedSale.firstAttemptAt,
      previousLastAttemptAt: workflowStart.loadedSale.lastAttemptAt,
      previousLastErrorMessage: workflowStart.loadedSale.lastErrorMessage,
    },
  );

  if (rollbackResult.status === "restored") {
    return;
  }

  throw new ManualNfeEmailDispatchWorkflowError({
    message:
      "Manual NF-e processing failed before workflow start and the claim " +
      "rollback could not be confirmed",
    statusCode: 500,
    code: MANUAL_SALE_CLAIM_ROLLBACK_FAILED_FAILURE_TYPE,
  });
}

function normalizeManualWorkflowStartError(error: unknown): Error {
  if (error instanceof ManualNfeEmailDispatchWorkflowError) {
    return error;
  }

  if (error instanceof WorkflowExecutionAlreadyStartedError) {
    return new ManualNfeEmailDispatchWorkflowError({
      message:
        "A manual NF-e processing workflow with the same workflowId is already running",
      statusCode: 409,
      code: MANUAL_SALE_ALREADY_RUNNING_FAILURE_TYPE,
    });
  }

  if (error instanceof Error) {
    return new ManualNfeEmailDispatchWorkflowError({
      message:
        "Manual NF-e processing could not start the background workflow",
      statusCode: 503,
      code: MANUAL_SALE_START_FAILED_FAILURE_TYPE,
    });
  }

  return new ManualNfeEmailDispatchWorkflowError({
    message: "Manual NF-e processing failed with an unknown start error",
    statusCode: 503,
    code: MANUAL_SALE_START_FAILED_FAILURE_TYPE,
  });
}
