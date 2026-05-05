import { ApplicationFailure, workflowInfo } from "@temporalio/workflow";
import {
  NFE_EMAIL_DISPATCH_DEFAULT_DISCOVERY_WINDOW_DAYS,
  NFE_EMAIL_DISPATCH_DEFAULT_MAX_CONCURRENT_CHILDREN,
  type FetchCustomerNfeSalesCandidatesSummary,
  type FetchCustomerNfeSalesCandidatesWorkflowInput,
  type FetchSingleCustomerNfeSalesCandidatesWorkflowInput,
  type FetchSingleCustomerNfeSalesCandidatesWorkflowResult,
  type NfeEmailDispatchCustomer,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import type { NormalizedAutomationRuntimePolicy } from "../../../domain/shared/automation-runtime-policy.types.js";
import {
  normalizeAutomationRuntimePolicy,
  scopeWorkflowId,
} from "../shared/automation-runtime-policy.workflow.js";
import { readWorkflowFailureMessage } from "../shared/workflow-failure.workflow.js";

export const NFE_DISCOVERY_ACTIVITY_RETRY_POLICY = Object.freeze({
  initialInterval: "1 minute",
  backoffCoefficient: 2,
  maximumAttempts: 3,
  maximumInterval: "5 minutes",
  nonRetryableErrorTypes: ["PermanentIntegrationError"],
});

export interface NormalizedFetchCustomerNfeSalesCandidatesWorkflowInput {
  requestId: string;
  source: FetchCustomerNfeSalesCandidatesWorkflowInput["source"];
  discoveryWindowDays: number;
  maxConcurrentChildren: number;
  runtimePolicy: NormalizedAutomationRuntimePolicy;
}

export function normalizeFetchCustomerNfeSalesCandidatesWorkflowInput(
  input: FetchCustomerNfeSalesCandidatesWorkflowInput,
): NormalizedFetchCustomerNfeSalesCandidatesWorkflowInput {
  return {
    requestId: resolveRequestId(input),
    source: input.source,
    discoveryWindowDays: readPositiveIntegerOrDefault(
      input.discoveryWindowDays,
      NFE_EMAIL_DISPATCH_DEFAULT_DISCOVERY_WINDOW_DAYS,
      "discoveryWindowDays",
    ),
    maxConcurrentChildren: readPositiveIntegerOrDefault(
      input.maxConcurrentChildren,
      NFE_EMAIL_DISPATCH_DEFAULT_MAX_CONCURRENT_CHILDREN,
      "maxConcurrentChildren",
    ),
    runtimePolicy: normalizeAutomationRuntimePolicy(input.runtimePolicy),
  };
}

export function validateFetchSingleCustomerNfeSalesCandidatesWorkflowInput(
  input: FetchSingleCustomerNfeSalesCandidatesWorkflowInput,
): FetchSingleCustomerNfeSalesCandidatesWorkflowInput {
  return {
    automationCustomerId: readPositiveInteger(
      input.automationCustomerId,
      "automationCustomerId",
    ),
    erpCustomerId: readPositiveInteger(input.erpCustomerId, "erpCustomerId"),
    customerCreatedAt: readRequiredDateTime(
      input.customerCreatedAt,
      "customerCreatedAt",
    ),
    discoveryStartedAt: readRequiredDateTime(
      input.discoveryStartedAt,
      "discoveryStartedAt",
    ),
    discoveryWindowDays: readPositiveInteger(
      input.discoveryWindowDays,
      "discoveryWindowDays",
    ),
    ...(input.runtimePolicy === undefined
      ? {}
      : { runtimePolicy: input.runtimePolicy }),
  };
}

export function buildFetchSingleCustomerNfeSalesCandidatesWorkflowId(
  automationCustomerId: number,
  discoveryStartedAt: string,
  runtimePolicy: NormalizedAutomationRuntimePolicy,
): string {
  return scopeWorkflowId(
    `nfe-email-dispatch/fetch-candidates/customer-${automationCustomerId}/` +
      discoveryStartedAt.slice(0, 10),
    runtimePolicy,
  );
}

export function buildFailedCustomerDiscoveryResult(
  customer: Pick<NfeEmailDispatchCustomer, "id" | "erpCustomerId">,
  errorMessage: string,
): FetchSingleCustomerNfeSalesCandidatesWorkflowResult {
  return {
    automationCustomerId: customer.id,
    erpCustomerId: customer.erpCustomerId,
    status: "FAILED",
    foundSales: 0,
    queuedSales: 0,
    errorMessage,
  };
}

export function buildFetchCustomerNfeSalesCandidatesSummary(
  results: readonly FetchSingleCustomerNfeSalesCandidatesWorkflowResult[],
): FetchCustomerNfeSalesCandidatesSummary {
  let successCustomers = 0;
  let failedCustomers = 0;
  let totalFoundSales = 0;
  let totalQueuedSales = 0;
  const failedCustomerIds: number[] = [];

  for (const result of results) {
    totalFoundSales += result.foundSales;
    totalQueuedSales += result.queuedSales;

    if (result.status === "SUCCESS") {
      successCustomers += 1;
      continue;
    }

    failedCustomers += 1;
    failedCustomerIds.push(result.automationCustomerId);
  }

  return {
    totalCustomers: results.length,
    successCustomers,
    failedCustomers,
    totalFoundSales,
    totalQueuedSales,
    failedCustomerIds,
  };
}

export function calculateEffectiveStart(
  input: Pick<
    FetchSingleCustomerNfeSalesCandidatesWorkflowInput,
    "customerCreatedAt" | "discoveryStartedAt" | "discoveryWindowDays"
  >,
): string {
  const customerCreatedAt = parseLocalDateTime(input.customerCreatedAt);
  const discoveryStartedAt = parseLocalDateTime(input.discoveryStartedAt);
  const discoveryWindowStart = new Date(discoveryStartedAt.getTime());

  discoveryWindowStart.setDate(
    discoveryWindowStart.getDate() - input.discoveryWindowDays,
  );

  return formatLocalDateTime3(
    customerCreatedAt.getTime() > discoveryWindowStart.getTime()
      ? customerCreatedAt
      : discoveryWindowStart,
  );
}

export function formatWorkflowNowAsDateTime3(): string {
  return formatLocalDateTime3(new Date());
}

export function readWorkflowErrorMessage(error: unknown): string {
  return readWorkflowFailureMessage(error);
}

function resolveRequestId(input: FetchCustomerNfeSalesCandidatesWorkflowInput): string {
  const providedRequestId = input.requestId.trim();

  if (input.source === "schedule") {
    return workflowInfo().workflowId;
  }

  if (providedRequestId.length > 0) {
    return providedRequestId;
  }

  return workflowInfo().workflowId;
}

function readPositiveIntegerOrDefault(
  value: number | undefined,
  fallback: number,
  fieldName: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  return readPositiveInteger(value, fieldName);
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }

  throw ApplicationFailure.nonRetryable(
    `NF-e discovery workflow requires a positive integer for ${fieldName}`,
    "INVALID_WORKFLOW_INPUT",
  );
}

function readRequiredDateTime(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw ApplicationFailure.nonRetryable(
      `NF-e discovery workflow requires a string for ${fieldName}`,
      "INVALID_WORKFLOW_INPUT",
    );
  }

  const normalizedValue = normalizeDateTimeString(value);

  if (normalizedValue === null) {
    throw ApplicationFailure.nonRetryable(
      `NF-e discovery workflow requires a valid datetime for ${fieldName}`,
      "INVALID_WORKFLOW_INPUT",
    );
  }

  return normalizedValue;
}

function parseLocalDateTime(value: string): Date {
  const normalizedValue = normalizeDateTimeString(value);

  if (normalizedValue === null) {
    throw ApplicationFailure.nonRetryable(
      `NF-e discovery workflow received an invalid datetime: ${value}`,
      "INVALID_WORKFLOW_INPUT",
    );
  }

  const match = normalizedValue.match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})$/,
  );

  if (match === null) {
    throw ApplicationFailure.nonRetryable(
      `NF-e discovery workflow received an invalid datetime: ${value}`,
      "INVALID_WORKFLOW_INPUT",
    );
  }

  const [, year, month, day, hour, minute, second, millisecond] = match;

  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined ||
    millisecond === undefined
  ) {
    throw ApplicationFailure.nonRetryable(
      `NF-e discovery workflow received an invalid datetime: ${value}`,
      "INVALID_WORKFLOW_INPUT",
    );
  }

  return new Date(
    Number.parseInt(year, 10),
    Number.parseInt(month, 10) - 1,
    Number.parseInt(day, 10),
    Number.parseInt(hour, 10),
    Number.parseInt(minute, 10),
    Number.parseInt(second, 10),
    Number.parseInt(millisecond, 10),
  );
}

function normalizeDateTimeString(value: string): string | null {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return null;
  }

  const mysqlDateTimeMatch = trimmedValue.match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?$/,
  );

  if (mysqlDateTimeMatch !== null) {
    const milliseconds = (mysqlDateTimeMatch[3] ?? "").padEnd(3, "0");

    return `${mysqlDateTimeMatch[1]} ${mysqlDateTimeMatch[2]}.${milliseconds}`;
  }

  const parsedDate = new Date(trimmedValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return formatLocalDateTime3(parsedDate);
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
