import { log, proxyActivities, startChild, workflowInfo } from "@temporalio/workflow";
import type {
  FetchCustomerNfeSalesCandidatesWorkflowInput,
  FetchCustomerNfeSalesCandidatesWorkflowResult,
  FetchSingleCustomerNfeSalesCandidatesWorkflowResult,
  NfeEmailDispatchCustomer,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import { temporalTaskQueues } from "../../../infra/config/temporal-task-queues.js";
import type * as nfeControlActivities from "../../activities/nfe/load-nfe-email-dispatch-customers.activity.js";
import { resolveChildWorkflowIdReusePolicy } from "../shared/automation-runtime-policy.workflow.js";
import { fetchSingleCustomerNfeSalesCandidatesWorkflow } from "./fetch-single-customer-nfe-sales-candidates.workflow.js";
import {
  NFE_DISCOVERY_ACTIVITY_RETRY_POLICY,
  buildFailedCustomerDiscoveryResult,
  buildFetchCustomerNfeSalesCandidatesSummary,
  buildFetchSingleCustomerNfeSalesCandidatesWorkflowId,
  formatWorkflowNowAsDateTime3,
  normalizeFetchCustomerNfeSalesCandidatesWorkflowInput,
  readWorkflowErrorMessage,
} from "./fetch-customer-nfe-sales-candidates.shared.js";

const { loadNfeEmailDispatchCustomersActivity } =
  proxyActivities<typeof nfeControlActivities>({
    taskQueue: temporalTaskQueues.control,
    startToCloseTimeout: "5 minutes",
    retry: NFE_DISCOVERY_ACTIVITY_RETRY_POLICY,
  });

export async function fetchCustomerNfeSalesCandidatesWorkflow(
  input: FetchCustomerNfeSalesCandidatesWorkflowInput,
): Promise<FetchCustomerNfeSalesCandidatesWorkflowResult> {
  const normalizedInput =
    normalizeFetchCustomerNfeSalesCandidatesWorkflowInput(input);
  const discoveryStartedAt = formatWorkflowNowAsDateTime3();
  const customers = await loadNfeEmailDispatchCustomersActivity();

  if (customers.length === 0) {
    return {
      requestId: normalizedInput.requestId,
      source: normalizedInput.source,
      discoveryStartedAt,
      discoveryWindowDays: normalizedInput.discoveryWindowDays,
      maxConcurrentChildren: normalizedInput.maxConcurrentChildren,
      status: "SUCCESS",
      summary: {
        totalCustomers: 0,
        successCustomers: 0,
        failedCustomers: 0,
        totalFoundSales: 0,
        totalQueuedSales: 0,
        failedCustomerIds: [],
      },
    };
  }

  const childResults = await runDiscoveryChildrenWithConcurrency({
    customers,
    discoveryStartedAt,
    discoveryWindowDays: normalizedInput.discoveryWindowDays,
    maxConcurrentChildren: normalizedInput.maxConcurrentChildren,
    runtimePolicy: normalizedInput.runtimePolicy,
    runtimePolicyInput: input.runtimePolicy,
  });
  const summary = buildFetchCustomerNfeSalesCandidatesSummary(childResults);
  const status = summary.failedCustomers === 0 ? "SUCCESS" : "PARTIAL_FAILURE";

  log.info("NF-e discovery parent workflow finished", {
    requestId: normalizedInput.requestId,
    workflowId: workflowInfo().workflowId,
    source: normalizedInput.source,
    discoveryStartedAt,
    totalCustomers: summary.totalCustomers,
    successCustomers: summary.successCustomers,
    failedCustomers: summary.failedCustomers,
    totalFoundSales: summary.totalFoundSales,
    totalQueuedSales: summary.totalQueuedSales,
    failedCustomerIds: summary.failedCustomerIds,
  });

  return {
    requestId: normalizedInput.requestId,
    source: normalizedInput.source,
    discoveryStartedAt,
    discoveryWindowDays: normalizedInput.discoveryWindowDays,
    maxConcurrentChildren: normalizedInput.maxConcurrentChildren,
    status,
    summary,
  };
}

async function runDiscoveryChildrenWithConcurrency(input: {
  customers: readonly NfeEmailDispatchCustomer[];
  discoveryStartedAt: string;
  discoveryWindowDays: number;
  maxConcurrentChildren: number;
  runtimePolicy: ReturnType<
    typeof normalizeFetchCustomerNfeSalesCandidatesWorkflowInput
  >["runtimePolicy"];
  runtimePolicyInput: FetchCustomerNfeSalesCandidatesWorkflowInput["runtimePolicy"];
}): Promise<FetchSingleCustomerNfeSalesCandidatesWorkflowResult[]> {
  const pendingCustomers = [...input.customers];
  const activeChildren = new Map<
    number,
    Promise<{
      automationCustomerId: number;
      result: FetchSingleCustomerNfeSalesCandidatesWorkflowResult;
    }>
  >();
  const results: FetchSingleCustomerNfeSalesCandidatesWorkflowResult[] = [];

  while (pendingCustomers.length > 0 || activeChildren.size > 0) {
    while (
      pendingCustomers.length > 0 &&
      activeChildren.size < input.maxConcurrentChildren
    ) {
      const nextCustomer = pendingCustomers.shift();

      if (nextCustomer === undefined) {
        break;
      }

      activeChildren.set(
        nextCustomer.id,
        runCustomerDiscoveryChild({
          customer: nextCustomer,
          discoveryStartedAt: input.discoveryStartedAt,
          discoveryWindowDays: input.discoveryWindowDays,
          runtimePolicy: input.runtimePolicy,
          runtimePolicyInput: input.runtimePolicyInput,
        }).then((result) => ({
          automationCustomerId: nextCustomer.id,
          result,
        })),
      );
    }

    const settledChild = await Promise.race(activeChildren.values());

    activeChildren.delete(settledChild.automationCustomerId);
    results.push(settledChild.result);
  }

  return results;
}

async function runCustomerDiscoveryChild(input: {
  customer: NfeEmailDispatchCustomer;
  discoveryStartedAt: string;
  discoveryWindowDays: number;
  runtimePolicy: ReturnType<
    typeof normalizeFetchCustomerNfeSalesCandidatesWorkflowInput
  >["runtimePolicy"];
  runtimePolicyInput: FetchCustomerNfeSalesCandidatesWorkflowInput["runtimePolicy"];
}): Promise<FetchSingleCustomerNfeSalesCandidatesWorkflowResult> {
  const childWorkflowId = buildFetchSingleCustomerNfeSalesCandidatesWorkflowId(
    input.customer.id,
    input.discoveryStartedAt,
    input.runtimePolicy,
  );

  try {
    const childHandle = await startChild(fetchSingleCustomerNfeSalesCandidatesWorkflow, {
      args: [{
        automationCustomerId: input.customer.id,
        erpCustomerId: input.customer.erpCustomerId,
        customerCreatedAt: input.customer.createdAt,
        discoveryStartedAt: input.discoveryStartedAt,
        discoveryWindowDays: input.discoveryWindowDays,
        ...(input.runtimePolicyInput === undefined
          ? {}
          : { runtimePolicy: input.runtimePolicyInput }),
      }],
      workflowId: childWorkflowId,
      workflowIdReusePolicy: resolveChildWorkflowIdReusePolicy(
        input.runtimePolicy,
      ),
    });

    return await childHandle.result();
  } catch (error) {
    const errorMessage = readWorkflowErrorMessage(error);

    log.error("NF-e discovery parent could not complete a child workflow", {
      workflowId: workflowInfo().workflowId,
      childWorkflowId,
      automationCustomerId: input.customer.id,
      erpCustomerId: input.customer.erpCustomerId,
      errorMessage,
    });

    return buildFailedCustomerDiscoveryResult(input.customer, errorMessage);
  }
}
