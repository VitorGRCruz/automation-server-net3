import { log, proxyActivities, workflowInfo } from "@temporalio/workflow";
import type {
  EnqueueNfeEmailDispatchSalesActivityResult,
  ErpNfeSaleCandidate,
  FetchSingleCustomerNfeSalesCandidatesWorkflowInput,
  FetchSingleCustomerNfeSalesCandidatesWorkflowResult,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import { temporalTaskQueues } from "../../../infra/config/temporal-task-queues.js";
import type * as nfeControlActivities from "../../activities/nfe/enqueue-nfe-email-dispatch-sales.activity.js";
import type * as nfeErpReadActivities from "../../activities/nfe/fetch-customer-nfe-sales-candidates-from-erp.activity.js";
import {
  NFE_DISCOVERY_ACTIVITY_RETRY_POLICY,
  calculateEffectiveStart,
  readWorkflowErrorMessage,
  validateFetchSingleCustomerNfeSalesCandidatesWorkflowInput,
} from "./fetch-customer-nfe-sales-candidates.shared.js";
import { normalizeAutomationRuntimePolicy } from "../shared/automation-runtime-policy.workflow.js";

const { fetchCustomerNfeSalesCandidatesFromErpActivity } =
  proxyActivities<typeof nfeErpReadActivities>({
    taskQueue: temporalTaskQueues.erpRead,
    startToCloseTimeout: "5 minutes",
    retry: NFE_DISCOVERY_ACTIVITY_RETRY_POLICY,
  });

const { enqueueNfeEmailDispatchSalesActivity } =
  proxyActivities<typeof nfeControlActivities>({
    taskQueue: temporalTaskQueues.control,
    startToCloseTimeout: "5 minutes",
    retry: NFE_DISCOVERY_ACTIVITY_RETRY_POLICY,
  });

export async function fetchSingleCustomerNfeSalesCandidatesWorkflow(
  input: FetchSingleCustomerNfeSalesCandidatesWorkflowInput,
): Promise<FetchSingleCustomerNfeSalesCandidatesWorkflowResult> {
  const normalizedInput =
    validateFetchSingleCustomerNfeSalesCandidatesWorkflowInput(input);
  const runtimePolicy = normalizeAutomationRuntimePolicy(input.runtimePolicy);
  const effectiveStart = calculateEffectiveStart(normalizedInput);
  let candidates: ErpNfeSaleCandidate[] = [];
  let enqueueResult: EnqueueNfeEmailDispatchSalesActivityResult | null = null;

  try {
    candidates = await fetchCustomerNfeSalesCandidatesFromErpActivity({
      automationCustomerId: normalizedInput.automationCustomerId,
      erpCustomerId: normalizedInput.erpCustomerId,
      effectiveStart,
    });

    if (candidates.length === 0) {
      return {
        automationCustomerId: normalizedInput.automationCustomerId,
        erpCustomerId: normalizedInput.erpCustomerId,
        status: "SUCCESS",
        foundSales: 0,
        queuedSales: 0,
      };
    }

    enqueueResult = await enqueueNfeEmailDispatchSalesActivity({
      candidates,
      runtimeScope: runtimePolicy.idempotencyScope,
    });

    return {
      automationCustomerId: normalizedInput.automationCustomerId,
      erpCustomerId: normalizedInput.erpCustomerId,
      status: "SUCCESS",
      foundSales: candidates.length,
      queuedSales: enqueueResult.queuedSales,
    };
  } catch (error) {
    const errorMessage = readWorkflowErrorMessage(error);

    log.error("NF-e discovery child workflow failed for customer", {
      workflowId: workflowInfo().workflowId,
      automationCustomerId: normalizedInput.automationCustomerId,
      erpCustomerId: normalizedInput.erpCustomerId,
      effectiveStart,
      foundSales: candidates.length,
      queuedSales: enqueueResult?.queuedSales ?? 0,
      errorMessage,
    });

    return {
      automationCustomerId: normalizedInput.automationCustomerId,
      erpCustomerId: normalizedInput.erpCustomerId,
      status: "FAILED",
      foundSales: candidates.length,
      queuedSales: enqueueResult?.queuedSales ?? 0,
      errorMessage,
    };
  }
}
