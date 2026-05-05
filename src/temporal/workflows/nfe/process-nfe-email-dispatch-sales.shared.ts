import { ApplicationFailure, workflowInfo } from "@temporalio/workflow";
import {
  NFE_EMAIL_DISPATCH_DEFAULT_MAX_CONCURRENT_CHILDREN,
  NFE_EMAIL_DISPATCH_DEFAULT_MAX_SEND_ATTEMPTS,
  NFE_EMAIL_DISCOVERY_RUNNING_MESSAGE,
  NFE_EMAIL_CONTEXT_PERMANENT_FAILURE_MESSAGE,
  NFE_EMAIL_CONTEXT_TRANSIENT_FAILURE_MESSAGE,
  type ProcessNfeEmailDispatchSalesSummary,
  type ProcessNfeEmailDispatchSalesWorkflowInput,
  type ProcessNfeEmailDispatchSalesWorkflowResult,
  type ProcessSingleNfeEmailDispatchSaleWorkflowResult,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import type { NormalizedAutomationRuntimePolicy } from "../../../domain/shared/automation-runtime-policy.types.js";
import {
  normalizeAutomationRuntimePolicy,
  scopeWorkflowId,
} from "../shared/automation-runtime-policy.workflow.js";
import {
  findRootApplicationFailure,
  findRootWorkflowFailure,
  readWorkflowFailureMessage,
} from "../shared/workflow-failure.workflow.js";

export const NFE_PROCESSING_ACTIVITY_RETRY_POLICY = Object.freeze({
  initialInterval: "1 minute",
  backoffCoefficient: 2,
  maximumAttempts: 3,
  maximumInterval: "5 minutes",
  nonRetryableErrorTypes: ["PermanentIntegrationError"],
});

export interface NormalizedProcessNfeEmailDispatchSalesWorkflowInput {
  requestId: string;
  source: ProcessNfeEmailDispatchSalesWorkflowInput["source"];
  maxConcurrentChildren: number;
  maxSendAttempts: number;
  discoveryWorkflowId: string;
  runtimePolicy: NormalizedAutomationRuntimePolicy;
}

export function normalizeProcessNfeEmailDispatchSalesWorkflowInput(
  input: ProcessNfeEmailDispatchSalesWorkflowInput,
): NormalizedProcessNfeEmailDispatchSalesWorkflowInput {
  return {
    requestId: resolveRequestId(input),
    source: input.source,
    maxConcurrentChildren: readPositiveIntegerOrDefault(
      input.maxConcurrentChildren,
      NFE_EMAIL_DISPATCH_DEFAULT_MAX_CONCURRENT_CHILDREN,
      "maxConcurrentChildren",
    ),
    maxSendAttempts: readPositiveIntegerOrDefault(
      input.maxSendAttempts,
      NFE_EMAIL_DISPATCH_DEFAULT_MAX_SEND_ATTEMPTS,
      "maxSendAttempts",
    ),
    discoveryWorkflowId: resolveDiscoveryWorkflowId(input),
    runtimePolicy: normalizeAutomationRuntimePolicy(input.runtimePolicy),
  };
}

export function buildProcessSingleNfeEmailDispatchSaleWorkflowId(
  nfeEmailDispatchSaleId: number,
  attemptNumber: number,
  runtimePolicy: NormalizedAutomationRuntimePolicy,
): string {
  return scopeWorkflowId(
    `nfe-email-dispatch/process-sale/sale-${nfeEmailDispatchSaleId}/attempt-${attemptNumber}`,
    runtimePolicy,
  );
}

export function buildProcessNfeEmailDispatchSalesSummary(
  results: readonly ProcessSingleNfeEmailDispatchSaleWorkflowResult[],
  childWorkflowFailures: number,
  failedSaleIds: readonly number[],
): ProcessNfeEmailDispatchSalesSummary {
  let completedChildren = 0;
  let skippedSales = 0;
  let sentSales = 0;
  let failedTransientSales = 0;
  let failedFinalSales = 0;
  let deliveryUnknownSales = 0;

  for (const result of results) {
    completedChildren += 1;

    switch (result.status) {
      case "SKIPPED":
        skippedSales += 1;
        break;
      case "SENT":
        sentSales += 1;
        break;
      case "FAILED_TRANSIENT":
        failedTransientSales += 1;
        break;
      case "FAILED_FINAL":
        failedFinalSales += 1;
        break;
      case "DELIVERY_UNKNOWN":
        deliveryUnknownSales += 1;
        break;
    }
  }

  return {
    totalEligibleSales: results.length + childWorkflowFailures,
    completedChildren,
    skippedSales,
    sentSales,
    failedTransientSales,
    failedFinalSales,
    deliveryUnknownSales,
    childWorkflowFailures,
    failedSaleIds: [...failedSaleIds],
  };
}

export function buildEmptyProcessNfeEmailDispatchSalesSummary(): ProcessNfeEmailDispatchSalesSummary {
  return {
    totalEligibleSales: 0,
    completedChildren: 0,
    skippedSales: 0,
    sentSales: 0,
    failedTransientSales: 0,
    failedFinalSales: 0,
    deliveryUnknownSales: 0,
    childWorkflowFailures: 0,
    failedSaleIds: [],
  };
}

export function classifyProcessingActivityFailure(error: unknown): {
  finalStatus: "FAILED_TRANSIENT" | "FAILED_FINAL";
  message: string;
} {
  const applicationFailure = findRootApplicationFailure(error);
  const failure = findRootWorkflowFailure(error);

  if (applicationFailure !== null) {
    if (
      applicationFailure.nonRetryable ||
      applicationFailure.type === "PermanentIntegrationError"
    ) {
      return {
        finalStatus: "FAILED_FINAL",
        message: NFE_EMAIL_CONTEXT_PERMANENT_FAILURE_MESSAGE,
      };
    }

    return {
      finalStatus: "FAILED_TRANSIENT",
      message: NFE_EMAIL_CONTEXT_TRANSIENT_FAILURE_MESSAGE,
    };
  }

  if (failure instanceof Error) {
    return {
      finalStatus: "FAILED_TRANSIENT",
      message: failure.message,
    };
  }

  return {
    finalStatus: "FAILED_TRANSIENT",
    message: NFE_EMAIL_CONTEXT_TRANSIENT_FAILURE_MESSAGE,
  };
}

export function formatWorkflowNowAsDateTime3(): string {
  return formatLocalDateTime3(new Date());
}

export function readWorkflowErrorMessage(error: unknown): string {
  return readWorkflowFailureMessage(error);
}

export function buildDiscoveryRunningProcessingResult(input: {
  requestId: string;
  source: ProcessNfeEmailDispatchSalesWorkflowInput["source"];
  maxConcurrentChildren: number;
  maxSendAttempts: number;
  blockedByWorkflowId: string;
}): ProcessNfeEmailDispatchSalesWorkflowResult {
  return {
    requestId: input.requestId,
    source: input.source,
    maxConcurrentChildren: input.maxConcurrentChildren,
    maxSendAttempts: input.maxSendAttempts,
    status: "SKIPPED_DISCOVERY_RUNNING",
    blockedByWorkflowId: input.blockedByWorkflowId,
    message: NFE_EMAIL_DISCOVERY_RUNNING_MESSAGE,
    summary: buildEmptyProcessNfeEmailDispatchSalesSummary(),
  };
}

function resolveRequestId(input: ProcessNfeEmailDispatchSalesWorkflowInput): string {
  const providedRequestId = input.requestId.trim();

  if (input.source === "schedule") {
    return workflowInfo().workflowId;
  }

  if (providedRequestId.length > 0) {
    return providedRequestId;
  }

  return workflowInfo().workflowId;
}

function resolveDiscoveryWorkflowId(
  input: ProcessNfeEmailDispatchSalesWorkflowInput,
): string {
  const providedWorkflowId = input.discoveryWorkflowId?.trim();

  if (providedWorkflowId) {
    return providedWorkflowId;
  }

  const currentWorkflowId = workflowInfo().workflowId;

  if (currentWorkflowId.includes("/processing/")) {
    return currentWorkflowId.replace("/processing/", "/discovery/");
  }

  throw ApplicationFailure.nonRetryable(
    "NF-e processing workflow requires discoveryWorkflowId when the current workflowId does not encode the discovery pair",
    "INVALID_WORKFLOW_INPUT",
  );
}

function readPositiveIntegerOrDefault(
  value: number | undefined,
  fallback: number,
  fieldName: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }

  throw ApplicationFailure.nonRetryable(
    `NF-e processing workflow requires a positive integer for ${fieldName}`,
    "INVALID_WORKFLOW_INPUT",
  );
}

function formatLocalDateTime3(value: Date): string {
  const year = value.getFullYear();
  const month = padNumber(value.getMonth() + 1, 2);
  const day = padNumber(value.getDate(), 2);
  const hour = padNumber(value.getHours(), 2);
  const minute = padNumber(value.getMinutes(), 2);
  const second = padNumber(value.getSeconds(), 2);
  const millisecond = padNumber(value.getMilliseconds(), 3);

  return `${year}-${month}-${day} ${hour}:${minute}:${second}.${millisecond}`;
}

function padNumber(value: number, width: number): string {
  return value.toString().padStart(width, "0");
}
