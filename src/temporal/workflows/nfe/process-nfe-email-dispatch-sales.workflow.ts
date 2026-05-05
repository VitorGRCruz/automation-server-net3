import { log, proxyActivities, startChild, workflowInfo } from "@temporalio/workflow";
import type {
  ProcessNfeEmailDispatchSalesWorkflowInput,
  ProcessNfeEmailDispatchSalesWorkflowResult,
  ProcessSingleNfeEmailDispatchSaleWorkflowResult,
  NfeEmailDispatchSaleToProcess,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import { temporalTaskQueues } from "../../../infra/config/temporal-task-queues.js";
import type * as nfeDiscoveryStateActivities from "../../activities/nfe/check-nfe-email-dispatch-discovery-running.activity.js";
import type * as nfeControlActivities from "../../activities/nfe/load-nfe-email-dispatch-eligible-sales.activity.js";
import { resolveChildWorkflowIdReusePolicy } from "../shared/automation-runtime-policy.workflow.js";
import { processSingleNfeEmailDispatchSaleWorkflow } from "./process-single-nfe-email-dispatch-sale.workflow.js";
import {
  NFE_PROCESSING_ACTIVITY_RETRY_POLICY,
  buildDiscoveryRunningProcessingResult,
  buildEmptyProcessNfeEmailDispatchSalesSummary,
  buildProcessNfeEmailDispatchSalesSummary,
  buildProcessSingleNfeEmailDispatchSaleWorkflowId,
  normalizeProcessNfeEmailDispatchSalesWorkflowInput,
  readWorkflowErrorMessage,
} from "./process-nfe-email-dispatch-sales.shared.js";

const { checkNfeEmailDispatchDiscoveryRunningActivity } =
  proxyActivities<typeof nfeDiscoveryStateActivities>({
    taskQueue: temporalTaskQueues.control,
    startToCloseTimeout: "2 minutes",
    retry: NFE_PROCESSING_ACTIVITY_RETRY_POLICY,
  });

const { loadNfeEmailDispatchEligibleSalesActivity } =
  proxyActivities<typeof nfeControlActivities>({
    taskQueue: temporalTaskQueues.control,
    startToCloseTimeout: "5 minutes",
    retry: NFE_PROCESSING_ACTIVITY_RETRY_POLICY,
  });

export async function processNfeEmailDispatchSalesWorkflow(
  input: ProcessNfeEmailDispatchSalesWorkflowInput,
): Promise<ProcessNfeEmailDispatchSalesWorkflowResult> {
  const normalizedInput =
    normalizeProcessNfeEmailDispatchSalesWorkflowInput(input);
  const discoveryState = await checkNfeEmailDispatchDiscoveryRunningActivity({
    discoveryWorkflowId: normalizedInput.discoveryWorkflowId,
  });

  if (discoveryState.isRunning) {
    log.info("NF-e processing parent skipped because discovery workflow is running", {
      requestId: normalizedInput.requestId,
      workflowId: workflowInfo().workflowId,
      source: normalizedInput.source,
      blockedByWorkflowId: discoveryState.discoveryWorkflowId,
      blockedByRunId: discoveryState.runId,
    });

    return buildDiscoveryRunningProcessingResult({
      requestId: normalizedInput.requestId,
      source: normalizedInput.source,
      maxConcurrentChildren: normalizedInput.maxConcurrentChildren,
      maxSendAttempts: normalizedInput.maxSendAttempts,
      blockedByWorkflowId: discoveryState.discoveryWorkflowId,
    });
  }

  const eligibleSales = await loadNfeEmailDispatchEligibleSalesActivity({
    maxSendAttempts: normalizedInput.maxSendAttempts,
    runtimeScope: normalizedInput.runtimePolicy.idempotencyScope,
  });

  if (eligibleSales.length === 0) {
    return {
      requestId: normalizedInput.requestId,
      source: normalizedInput.source,
      maxConcurrentChildren: normalizedInput.maxConcurrentChildren,
      maxSendAttempts: normalizedInput.maxSendAttempts,
      status: "SUCCESS",
      summary: buildEmptyProcessNfeEmailDispatchSalesSummary(),
    };
  }

  const executionResult = await runProcessChildrenWithConcurrency({
    eligibleSales,
    maxConcurrentChildren: normalizedInput.maxConcurrentChildren,
    maxSendAttempts: normalizedInput.maxSendAttempts,
    runtimePolicy: normalizedInput.runtimePolicy,
    runtimePolicyInput: input.runtimePolicy,
  });
  const summary = buildProcessNfeEmailDispatchSalesSummary(
    executionResult.results,
    executionResult.childWorkflowFailures,
    executionResult.failedSaleIds,
  );
  const status = executionResult.childWorkflowFailures === 0 ? "SUCCESS" : "PARTIAL_FAILURE";

  log.info("NF-e processing parent workflow finished", {
    requestId: normalizedInput.requestId,
    workflowId: workflowInfo().workflowId,
    source: normalizedInput.source,
    totalEligibleSales: summary.totalEligibleSales,
    completedChildren: summary.completedChildren,
    skippedSales: summary.skippedSales,
    sentSales: summary.sentSales,
    failedTransientSales: summary.failedTransientSales,
    failedFinalSales: summary.failedFinalSales,
    deliveryUnknownSales: summary.deliveryUnknownSales,
    childWorkflowFailures: summary.childWorkflowFailures,
    failedSaleIds: summary.failedSaleIds,
  });

  return {
    requestId: normalizedInput.requestId,
    source: normalizedInput.source,
    maxConcurrentChildren: normalizedInput.maxConcurrentChildren,
    maxSendAttempts: normalizedInput.maxSendAttempts,
    status,
    summary,
  };
}

async function runProcessChildrenWithConcurrency(input: {
  eligibleSales: readonly NfeEmailDispatchSaleToProcess[];
  maxConcurrentChildren: number;
  maxSendAttempts: number;
  runtimePolicy: ReturnType<
    typeof normalizeProcessNfeEmailDispatchSalesWorkflowInput
  >["runtimePolicy"];
  runtimePolicyInput: ProcessNfeEmailDispatchSalesWorkflowInput["runtimePolicy"];
}): Promise<{
  results: ProcessSingleNfeEmailDispatchSaleWorkflowResult[];
  childWorkflowFailures: number;
  failedSaleIds: number[];
}> {
  const pendingSales = [...input.eligibleSales];
  const activeChildren = new Map<
    number,
    Promise<
      | {
          status: "completed";
          result: ProcessSingleNfeEmailDispatchSaleWorkflowResult;
        }
      | {
          status: "failed";
          nfeEmailDispatchSaleId: number;
          errorMessage: string;
        }
    >
  >();
  const results: ProcessSingleNfeEmailDispatchSaleWorkflowResult[] = [];
  const failedSaleIds: number[] = [];
  let childWorkflowFailures = 0;

  while (pendingSales.length > 0 || activeChildren.size > 0) {
    while (
      pendingSales.length > 0 &&
      activeChildren.size < input.maxConcurrentChildren
    ) {
      const nextSale = pendingSales.shift();

      if (nextSale === undefined) {
        break;
      }

      activeChildren.set(
        nextSale.nfeEmailDispatchSaleId,
        runProcessSaleChild(
          nextSale,
          input.maxSendAttempts,
          input.runtimePolicy,
          input.runtimePolicyInput,
        ),
      );
    }

    const settledChild = await Promise.race(activeChildren.values());

    if (settledChild.status === "completed") {
      activeChildren.delete(settledChild.result.nfeEmailDispatchSaleId);
      results.push(settledChild.result);
      continue;
    }

    activeChildren.delete(settledChild.nfeEmailDispatchSaleId);
    childWorkflowFailures += 1;
    failedSaleIds.push(settledChild.nfeEmailDispatchSaleId);
  }

  return {
    results,
    childWorkflowFailures,
    failedSaleIds,
  };
}

async function runProcessSaleChild(
  sale: NfeEmailDispatchSaleToProcess,
  maxSendAttempts: number,
  runtimePolicy: ReturnType<
    typeof normalizeProcessNfeEmailDispatchSalesWorkflowInput
  >["runtimePolicy"],
  runtimePolicyInput: ProcessNfeEmailDispatchSalesWorkflowInput["runtimePolicy"],
): Promise<
  | {
      status: "completed";
      result: ProcessSingleNfeEmailDispatchSaleWorkflowResult;
    }
  | {
      status: "failed";
      nfeEmailDispatchSaleId: number;
      errorMessage: string;
    }
> {
  const attemptNumber = sale.currentAttemptCount + 1;
  const childWorkflowId = buildProcessSingleNfeEmailDispatchSaleWorkflowId(
    sale.nfeEmailDispatchSaleId,
    attemptNumber,
    runtimePolicy,
  );

  try {
    const childHandle = await startChild(processSingleNfeEmailDispatchSaleWorkflow, {
      args: [{
        nfeEmailDispatchSaleId: sale.nfeEmailDispatchSaleId,
        erpSaleId: sale.erpSaleId,
        currentAttemptCount: sale.currentAttemptCount,
        maxSendAttempts,
        ...(runtimePolicyInput === undefined
          ? {}
          : { runtimePolicy: runtimePolicyInput }),
      }],
      workflowId: childWorkflowId,
      workflowIdReusePolicy: resolveChildWorkflowIdReusePolicy(runtimePolicy),
    });

    return {
      status: "completed",
      result: await childHandle.result(),
    };
  } catch (error) {
    const errorMessage = readWorkflowErrorMessage(error);

    log.error("NF-e processing parent could not complete a child workflow", {
      workflowId: workflowInfo().workflowId,
      childWorkflowId,
      nfeEmailDispatchSaleId: sale.nfeEmailDispatchSaleId,
      erpSaleId: sale.erpSaleId,
      errorMessage,
    });

    return {
      status: "failed",
      nfeEmailDispatchSaleId: sale.nfeEmailDispatchSaleId,
      errorMessage,
    };
  }
}
