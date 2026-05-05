import {
  ApplicationFailure,
  ParentClosePolicy,
  log,
  proxyActivities,
  proxySinks,
  sleep,
  startChild,
  workflowInfo,
} from "@temporalio/workflow";
import type {
  CsatStartSurveyWorkflowInput,
  CsatStartSurveyWorkflowResult,
  FetchCsatEligibleItemsActivityResult,
} from "../../../domain/csat/csat-start-survey.types.js";
import type { WorkflowObservabilitySinks } from "../../../domain/shared/observability.types.js";
import { temporalTaskQueues } from "../../../infra/config/temporal-task-queues.js";
import type * as csatErpReadActivities from "../../activities/csat/fetch-csat-eligible-items.activity.js";
import type * as csatControlActivities from "../../activities/csat/register-csat-trigger-failure.activity.js";
import {
  normalizeAutomationRuntimePolicy,
  resolveChildWorkflowIdReusePolicy,
  scopeWorkflowId,
} from "../shared/automation-runtime-policy.workflow.js";
import {
  findRootApplicationFailure,
  readWorkflowFailureMessage,
} from "../shared/workflow-failure.workflow.js";
import { csatProcessSurveyItemWorkflow } from "./csat-process-survey-item.workflow.js";

const { fetchCsatEligibleItemsActivity } = proxyActivities<typeof csatErpReadActivities>({
  taskQueue: temporalTaskQueues.erpRead,
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "5 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 4,
    nonRetryableErrorTypes: ["PermanentIntegrationError"],
  },
});

const { registerCsatTriggerFailureActivity } = proxyActivities<typeof csatControlActivities>({
  taskQueue: temporalTaskQueues.control,
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "5 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 4,
    nonRetryableErrorTypes: ["PermanentIntegrationError"],
  },
});

const TRIGGER_RETRY_DELAY = "3 minutes";
const CSAT_TRIGGER_METRIC_WORKFLOW = "csat-start-survey-trigger";
const { observability } = proxySinks<WorkflowObservabilitySinks>();

/**
 * Parent workflow for the CSAT trigger:
 * - fetch eligible records from the ERP;
 * - stop cleanly when the query returns empty;
 * - start one independent child workflow per eligible record;
 * - apply the manual two-round retry policy required by the trigger.
 */
export async function csatStartSurveyWorkflow(
  input: CsatStartSurveyWorkflowInput,
): Promise<CsatStartSurveyWorkflowResult> {
  const runtimePolicy = normalizeAutomationRuntimePolicy(input.runtimePolicy);
  const requestId = resolveRuntimeRequestId(input);
  const workflowId = workflowInfo().workflowId;
  const normalizedInput = {
    ...input,
    requestId,
  } satisfies CsatStartSurveyWorkflowInput;
  const eligibleItemsResult = await runFetchEligibleItemsRound(normalizedInput, 1);

  if (eligibleItemsResult.status === "empty") {
    log.info("CSAT trigger finished without eligible records", {
      requestId,
      workflowId,
      source: normalizedInput.source,
    });

    observability.recordWorkflowTriggerExecution({
      workflow: CSAT_TRIGGER_METRIC_WORKFLOW,
      source: normalizedInput.source,
      result: "no-eligible-items",
    });

    return {
      requestId,
      source: normalizedInput.source,
      status: "no-eligible-items",
      eligibleItemsFound: 0,
      childWorkflowsStarted: 0,
      skippedAlreadyRunning: 0,
      skippedStartFailures: 0,
    };
  }

  const eligibleItems = eligibleItemsResult.data.records;
  const childStartResult = await startEligibleItemWorkflows(
    normalizedInput,
    eligibleItems,
    runtimePolicy,
  );

  observability.addWorkflowTriggerEligibleItems({
    workflow: CSAT_TRIGGER_METRIC_WORKFLOW,
    source: normalizedInput.source,
    count: eligibleItems.length,
  });
  observability.addWorkflowTriggerChildWorkflowsStarted({
    workflow: CSAT_TRIGGER_METRIC_WORKFLOW,
    source: normalizedInput.source,
    count: childStartResult.childWorkflowsStarted,
  });
  observability.addWorkflowTriggerAlreadyRunning({
    workflow: CSAT_TRIGGER_METRIC_WORKFLOW,
    source: normalizedInput.source,
    count: childStartResult.skippedAlreadyRunning,
  });
  observability.recordWorkflowTriggerExecution({
    workflow: CSAT_TRIGGER_METRIC_WORKFLOW,
    source: normalizedInput.source,
    result: "child-workflows-started",
  });

  log.info("CSAT trigger finished the fan-out phase", {
    requestId,
    workflowId,
    source: normalizedInput.source,
    eligibleItemsFound: eligibleItems.length,
    childWorkflowsStarted: childStartResult.childWorkflowsStarted,
    skippedAlreadyRunning: childStartResult.skippedAlreadyRunning,
    skippedStartFailures: childStartResult.skippedStartFailures,
  });

  return {
    requestId,
    source: normalizedInput.source,
    status: "child-workflows-started",
    eligibleItemsFound: eligibleItems.length,
    childWorkflowsStarted: childStartResult.childWorkflowsStarted,
    skippedAlreadyRunning: childStartResult.skippedAlreadyRunning,
    skippedStartFailures: childStartResult.skippedStartFailures,
  };
}

async function startEligibleItemWorkflows(
  input: CsatStartSurveyWorkflowInput,
  eligibleItems: FetchCsatEligibleItemsActivityResult["data"]["records"],
  runtimePolicy: ReturnType<typeof normalizeAutomationRuntimePolicy>,
): Promise<{
  childWorkflowsStarted: number;
  skippedAlreadyRunning: number;
  skippedStartFailures: number;
}> {
  let childWorkflowsStarted = 0;
  let skippedAlreadyRunning = 0;
  let skippedStartFailures = 0;

  for (const item of eligibleItems) {
    const childWorkflowId = buildCsatProcessSurveyItemWorkflowId(
      item.idOs,
      runtimePolicy,
    );

    try {
      await startChild(csatProcessSurveyItemWorkflow, {
        args: [{
          requestId: input.requestId,
          item,
          ...(input.runtimePolicy === undefined
            ? {}
            : { runtimePolicy: input.runtimePolicy }),
        }],
        parentClosePolicy: ParentClosePolicy.ABANDON,
        workflowId: childWorkflowId,
        workflowIdReusePolicy: resolveChildWorkflowIdReusePolicy(runtimePolicy),
      });

      childWorkflowsStarted += 1;
    } catch (error) {
      if (isWorkflowAlreadyRunning(error)) {
        skippedAlreadyRunning += 1;
        continue;
      }

      skippedStartFailures += 1;

      log.error("CSAT trigger could not start a child workflow", {
        requestId: input.requestId,
        workflowId: workflowInfo().workflowId,
        childWorkflowId,
        source: input.source,
        idOs: item.idOs,
        errorMessage: readErrorMessage(error),
      });
    }
  }

  return {
    childWorkflowsStarted,
    skippedAlreadyRunning,
    skippedStartFailures,
  };
}

async function runFetchEligibleItemsRound(
  input: CsatStartSurveyWorkflowInput,
  round: 1 | 2,
): Promise<FetchCsatEligibleItemsActivityResult> {
  try {
    return await fetchCsatEligibleItemsActivity({
      requestId: input.requestId,
    });
  } catch (error) {
    const failure = classifyTriggerFetchFailure(error);

    log.warn("CSAT trigger fetch round failed", {
      requestId: input.requestId,
      workflowId: workflowInfo().workflowId,
      source: input.source,
      round,
      errorKind: failure.errorKind,
      message: failure.message,
    });

    if (failure.errorKind === "permanent" || round === 2) {
      return failTriggerTerminally(input, round, failure);
    }

    await sleep(TRIGGER_RETRY_DELAY);

    return runFetchEligibleItemsRound(input, 2);
  }
}

function buildCsatProcessSurveyItemWorkflowId(
  idOs: number,
  runtimePolicy: ReturnType<typeof normalizeAutomationRuntimePolicy>,
): string {
  return scopeWorkflowId(`csat-process-survey-item/${idOs}`, runtimePolicy);
}

function resolveRuntimeRequestId(input: CsatStartSurveyWorkflowInput): string {
  const providedRequestId = input.requestId.trim();

  if (input.source === "schedule") {
    return workflowInfo().workflowId;
  }

  if (providedRequestId.length > 0) {
    return providedRequestId;
  }

  return workflowInfo().workflowId;
}

interface TriggerFetchFailureDetails {
  errorKind: "transient" | "permanent";
  message: string;
}

function isWorkflowAlreadyRunning(error: unknown): boolean {
  return readErrorMessage(error).includes("Workflow execution already started");
}

function readErrorMessage(error: unknown): string {
  return readWorkflowFailureMessage(error);
}

function classifyTriggerFetchFailure(error: unknown): TriggerFetchFailureDetails {
  const causeError = findRootApplicationFailure(error);
  const workflowError = typeof error === "object" && error !== null ? error : null;

  if (causeError !== null) {
    if (causeError.nonRetryable || causeError.type === "PermanentIntegrationError") {
      return {
        errorKind: "permanent",
        message: causeError.message,
      };
    }

    return {
      errorKind: "transient",
      message: causeError.message,
    };
  }

  if (workflowError instanceof ApplicationFailure) {
    if (workflowError.nonRetryable || workflowError.type === "PermanentIntegrationError") {
      return {
        errorKind: "permanent",
        message: workflowError.message,
      };
    }

    return {
      errorKind: "transient",
      message: workflowError.message,
    };
  }

  if (workflowError instanceof Error) {
    return {
      errorKind: "transient",
      message: workflowError.message,
    };
  }

  return {
    errorKind: "transient",
    message: "Unknown CSAT trigger fetch failure",
  };
}

async function failTriggerTerminally(
  input: CsatStartSurveyWorkflowInput,
  round: 1 | 2,
  failure: TriggerFetchFailureDetails,
): Promise<never> {
  const details = buildTriggerFailureDetails(round, failure);

  observability.recordWorkflowTriggerFailure({
    workflow: CSAT_TRIGGER_METRIC_WORKFLOW,
    source: input.source,
    failureKind: failure.errorKind,
    round: String(round) as "1" | "2",
  });
  observability.recordWorkflowTriggerExecution({
    workflow: CSAT_TRIGGER_METRIC_WORKFLOW,
    source: input.source,
    result: "failed",
  });

  await registerCsatTriggerFailureActivity({
    requestId: input.requestId,
    source: input.source,
    details,
  });

  throw ApplicationFailure.nonRetryable(
    details,
    failure.errorKind === "permanent"
      ? "CSAT_TRIGGER_PERMANENT_FAILURE"
      : "CSAT_TRIGGER_TRANSIENT_FAILURE",
  );
}

function buildTriggerFailureDetails(
  round: 1 | 2,
  failure: TriggerFetchFailureDetails,
): string {
  return `CSAT trigger failed terminally after round ${round} with ${failure.errorKind} error: ${failure.message}`;
}
