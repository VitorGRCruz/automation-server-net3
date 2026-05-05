import {
  ApplicationFailure,
  ParentClosePolicy,
  getExternalWorkflowHandle,
  log,
  proxyActivities,
  proxySinks,
  sleep,
  startChild,
  workflowInfo,
} from "@temporalio/workflow";
import type {
  EquipmentRetrievalVerificationFetchEligiblesActivityResult,
  EquipmentRetrievalVerificationTriggerWorkflowInput,
  EquipmentRetrievalVerificationTriggerWorkflowResult,
} from "../../../domain/cobrancas/equipment-retrieval-verification.types.js";
import type { WorkflowObservabilitySinks } from "../../../domain/shared/observability.types.js";
import { temporalTaskQueues } from "../../../infra/config/temporal-task-queues.js";
import type * as cobrancasErpReadActivities from "../../activities/cobrancas/fetch-equipment-retrieval-verification-eligibles.activity.js";
import type * as cobrancasControlActivities from "../../activities/cobrancas/register-equipment-retrieval-verification-trigger-failure.activity.js";
import {
  normalizeAutomationRuntimePolicy,
  resolveChildWorkflowIdReusePolicy,
} from "../shared/automation-runtime-policy.workflow.js";
import { equipmentRetrievalVerificationProcessItemWorkflow } from "./equipment-retrieval-verification-process-item.workflow.js";
import {
  buildProcessItemWorkflowId,
  buildRecoveryWorkflowId,
  buildTriggerFailureDetails,
  buildTriggerResult,
  classifyTriggerFetchFailure,
  isWorkflowAlreadyRunning,
  logInvalidRecords,
  normalizeTriggerInput,
  readErrorMessage,
} from "./equipment-retrieval-verification-shared.js";

const { fetchEquipmentRetrievalVerificationEligiblesActivity } =
  proxyActivities<typeof cobrancasErpReadActivities>({
    taskQueue: temporalTaskQueues.erpRead,
    startToCloseTimeout: "5 minutes",
    retry: {
      initialInterval: "5 seconds",
      backoffCoefficient: 2,
      maximumAttempts: 4,
      nonRetryableErrorTypes: ["PermanentIntegrationError"],
    },
  });

const { registerEquipmentRetrievalVerificationTriggerFailureActivity } =
  proxyActivities<typeof cobrancasControlActivities>({
    taskQueue: temporalTaskQueues.control,
    startToCloseTimeout: "5 minutes",
    retry: {
      initialInterval: "5 seconds",
      backoffCoefficient: 2,
      maximumAttempts: 4,
      nonRetryableErrorTypes: ["PermanentIntegrationError"],
    },
  });

const TRIGGER_RECOVERY_DELAY = "2 hours";
const TRIGGER_RETRY_DELAY = "3 minutes";
const COBRANCAS_TRIGGER_METRIC_WORKFLOW = "equipment-retrieval-verification-trigger";
const { observability } = proxySinks<WorkflowObservabilitySinks>();

export async function equipmentRetrievalVerificationWorkflow(
  input: EquipmentRetrievalVerificationTriggerWorkflowInput,
): Promise<EquipmentRetrievalVerificationTriggerWorkflowResult> {
  const normalizedInput = normalizeTriggerInput(input);
  const runtimePolicy = normalizeAutomationRuntimePolicy(input.runtimePolicy);
  const recoveryContext: TriggerRecoveryContext = {};
  const result = await runEquipmentRetrievalVerificationTrigger(
    normalizedInput,
    runtimePolicy,
    1,
    recoveryContext,
  );

  await cancelPendingRecoveryWorkflow(normalizedInput, recoveryContext);

  return result;
}

export async function equipmentRetrievalVerificationRecoveryWorkflow(
  input: EquipmentRetrievalVerificationTriggerWorkflowInput,
): Promise<EquipmentRetrievalVerificationTriggerWorkflowResult> {
  const normalizedInput = normalizeTriggerInput({
    ...input,
    source: "recovery",
  });
  const runtimePolicy = normalizeAutomationRuntimePolicy(input.runtimePolicy);

  log.info("Equipment retrieval verification recovery started", {
    requestId: normalizedInput.requestId,
    workflowId: workflowInfo().workflowId,
    source: normalizedInput.source,
    startAt: normalizedInput.startAt,
    originRequestId: normalizedInput.originRequestId ?? null,
    delay: TRIGGER_RECOVERY_DELAY,
  });

  await sleep(TRIGGER_RECOVERY_DELAY);

  return runEquipmentRetrievalVerificationTrigger(normalizedInput, runtimePolicy, 2);
}

async function runEquipmentRetrievalVerificationTrigger(
  input: EquipmentRetrievalVerificationTriggerWorkflowInput,
  runtimePolicy: ReturnType<typeof normalizeAutomationRuntimePolicy>,
  round: 1 | 2,
  recoveryContext?: TriggerRecoveryContext,
): Promise<EquipmentRetrievalVerificationTriggerWorkflowResult> {
  const eligibleItemsResult = await runFetchEligibleItemsRound(
    input,
    runtimePolicy,
    round,
    recoveryContext,
  );

  if (eligibleItemsResult.status === "empty") {
    log.info("Equipment retrieval verification trigger finished without eligible records", {
      requestId: input.requestId,
      workflowId: workflowInfo().workflowId,
      source: input.source,
      startAt: input.startAt,
    });

    observability.recordWorkflowTriggerExecution({
      workflow: COBRANCAS_TRIGGER_METRIC_WORKFLOW,
      source: input.source,
      result: "no-eligible-items",
    });

    return buildTriggerResult(input, "no-eligible-items");
  }

  logInvalidRecords(input, eligibleItemsResult.data.invalidRecords);

  const childStartResult = await startEligibleItemWorkflows(
    input,
    runtimePolicy,
    eligibleItemsResult,
  );

  observability.addWorkflowTriggerEligibleItems({
    workflow: COBRANCAS_TRIGGER_METRIC_WORKFLOW,
    source: input.source,
    count: eligibleItemsResult.data.validRecords.length,
  });
  observability.addWorkflowTriggerChildWorkflowsStarted({
    workflow: COBRANCAS_TRIGGER_METRIC_WORKFLOW,
    source: input.source,
    count: childStartResult.childWorkflowsStarted,
  });
  observability.addWorkflowTriggerAlreadyRunning({
    workflow: COBRANCAS_TRIGGER_METRIC_WORKFLOW,
    source: input.source,
    count: childStartResult.skippedAlreadyRunning,
  });
  observability.recordWorkflowTriggerExecution({
    workflow: COBRANCAS_TRIGGER_METRIC_WORKFLOW,
    source: input.source,
    result: "child-workflows-started",
  });

  log.info("Equipment retrieval verification trigger finished the fan-out phase", {
    requestId: input.requestId,
    workflowId: workflowInfo().workflowId,
    source: input.source,
    totalRecords:
      eligibleItemsResult.data.validRecords.length + eligibleItemsResult.data.invalidRecords.length,
    validRecords: eligibleItemsResult.data.validRecords.length,
    invalidRecords: eligibleItemsResult.data.invalidRecords.length,
    childWorkflowsStarted: childStartResult.childWorkflowsStarted,
    skippedAlreadyRunning: childStartResult.skippedAlreadyRunning,
    skippedStartFailures: childStartResult.skippedStartFailures,
  });

  return buildTriggerResult(
    input,
    "child-workflows-started",
    eligibleItemsResult.data.validRecords.length + eligibleItemsResult.data.invalidRecords.length,
    eligibleItemsResult.data.validRecords.length,
    eligibleItemsResult.data.invalidRecords.length,
    childStartResult.childWorkflowsStarted,
    childStartResult.skippedAlreadyRunning,
    childStartResult.skippedStartFailures,
  );
}

async function startEligibleItemWorkflows(
  input: EquipmentRetrievalVerificationTriggerWorkflowInput,
  runtimePolicy: ReturnType<typeof normalizeAutomationRuntimePolicy>,
  eligibleItemsResult: Extract<
    EquipmentRetrievalVerificationFetchEligiblesActivityResult,
    { status: "success" }
  >,
): Promise<{
  childWorkflowsStarted: number;
  skippedAlreadyRunning: number;
  skippedStartFailures: number;
}> {
  let childWorkflowsStarted = 0;
  let skippedAlreadyRunning = 0;
  let skippedStartFailures = 0;

  for (const item of eligibleItemsResult.data.validRecords) {
    const childWorkflowId = buildProcessItemWorkflowId(
      item.idReceber,
      runtimePolicy,
    );

    try {
      await startChild(equipmentRetrievalVerificationProcessItemWorkflow, {
        args: [{
          requestId: input.requestId,
          item,
          ...(input.runtimePolicy === undefined
            ? {}
            : { runtimePolicy: input.runtimePolicy }),
        }],
        workflowId: childWorkflowId,
        workflowIdReusePolicy: resolveChildWorkflowIdReusePolicy(runtimePolicy),
        parentClosePolicy: ParentClosePolicy.ABANDON,
      });
      childWorkflowsStarted += 1;
    } catch (error) {
      if (isWorkflowAlreadyRunning(error)) {
        skippedAlreadyRunning += 1;
        continue;
      }

      skippedStartFailures += 1;

      log.error("Equipment retrieval verification trigger could not start a child workflow", {
        requestId: input.requestId,
        workflowId: workflowInfo().workflowId,
        childWorkflowId,
        source: input.source,
        idReceber: item.idReceber,
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
  input: EquipmentRetrievalVerificationTriggerWorkflowInput,
  runtimePolicy: ReturnType<typeof normalizeAutomationRuntimePolicy>,
  round: 1 | 2,
  recoveryContext?: TriggerRecoveryContext,
): Promise<EquipmentRetrievalVerificationFetchEligiblesActivityResult> {
  try {
    return await fetchEquipmentRetrievalVerificationEligiblesActivity({
      requestId: input.requestId,
      startAt: input.startAt,
    });
  } catch (error) {
    const failure = classifyTriggerFetchFailure(error);

    log.warn("Equipment retrieval verification trigger fetch failed", {
      requestId: input.requestId,
      workflowId: workflowInfo().workflowId,
      source: input.source,
      startAt: input.startAt,
      round,
      errorKind: failure.errorKind,
      message: failure.message,
    });

    if (failure.errorKind === "permanent" || round === 2) {
      return failTriggerTerminally(input, round, failure);
    }

    await ensureRecoveryWorkflowStarted(input, runtimePolicy, recoveryContext);

    await sleep(TRIGGER_RETRY_DELAY);

    return runFetchEligibleItemsRound(input, runtimePolicy, 2, recoveryContext);
  }
}

interface TriggerRecoveryContext {
  workflowId?: string;
}

async function ensureRecoveryWorkflowStarted(
  input: EquipmentRetrievalVerificationTriggerWorkflowInput,
  runtimePolicy: ReturnType<typeof normalizeAutomationRuntimePolicy>,
  recoveryContext?: TriggerRecoveryContext,
): Promise<void> {
  if (recoveryContext === undefined || input.source === "recovery") {
    return;
  }

  if (recoveryContext.workflowId !== undefined) {
    return;
  }

  const recoveryWorkflowId = buildRecoveryWorkflowId(input.requestId, runtimePolicy);

  log.warn("Equipment retrieval verification trigger is scheduling recovery after transient fetch failure", {
    requestId: input.requestId,
    workflowId: workflowInfo().workflowId,
    source: input.source,
    startAt: input.startAt,
    recoveryWorkflowId,
    recoveryDelay: TRIGGER_RECOVERY_DELAY,
    retryDelay: TRIGGER_RETRY_DELAY,
  });

  try {
    await startChild(equipmentRetrievalVerificationRecoveryWorkflow, {
      args: [{
        requestId: recoveryWorkflowId,
        source: "recovery",
        startAt: input.startAt,
        originRequestId: input.requestId,
        ...(input.runtimePolicy === undefined
          ? {}
          : { runtimePolicy: input.runtimePolicy }),
      }],
      workflowId: recoveryWorkflowId,
      workflowIdReusePolicy: resolveChildWorkflowIdReusePolicy(runtimePolicy),
      parentClosePolicy: ParentClosePolicy.ABANDON,
    });

    recoveryContext.workflowId = recoveryWorkflowId;
    observability.recordWorkflowTriggerRecoveryScheduled({
      workflow: COBRANCAS_TRIGGER_METRIC_WORKFLOW,
      source: input.source,
    });

    log.info("Equipment retrieval verification recovery workflow scheduled", {
      requestId: input.requestId,
      workflowId: workflowInfo().workflowId,
      source: input.source,
      recoveryWorkflowId,
      startAt: input.startAt,
      originRequestId: input.requestId,
    });
  } catch (error) {
    if (isWorkflowAlreadyRunning(error)) {
      recoveryContext.workflowId = recoveryWorkflowId;
      observability.recordWorkflowTriggerRecoveryAlreadyPending({
        workflow: COBRANCAS_TRIGGER_METRIC_WORKFLOW,
        source: input.source,
      });

      log.info("Equipment retrieval verification recovery workflow was already pending", {
        requestId: input.requestId,
        workflowId: workflowInfo().workflowId,
        source: input.source,
        recoveryWorkflowId,
        startAt: input.startAt,
        originRequestId: input.requestId,
      });

      return;
    }

    log.error("Equipment retrieval verification trigger could not schedule the recovery workflow", {
      requestId: input.requestId,
      workflowId: workflowInfo().workflowId,
      source: input.source,
      startAt: input.startAt,
      recoveryWorkflowId,
      errorMessage: readErrorMessage(error),
    });
  }
}

async function cancelPendingRecoveryWorkflow(
  input: EquipmentRetrievalVerificationTriggerWorkflowInput,
  recoveryContext: TriggerRecoveryContext,
): Promise<void> {
  if (input.source === "recovery" || recoveryContext.workflowId === undefined) {
    return;
  }

  try {
    const handle = getExternalWorkflowHandle(recoveryContext.workflowId);

    await handle.cancel();

    log.info("Equipment retrieval verification trigger canceled the pending recovery workflow after succeeding", {
      requestId: input.requestId,
      workflowId: workflowInfo().workflowId,
      source: input.source,
      startAt: input.startAt,
      recoveryWorkflowId: recoveryContext.workflowId,
      originRequestId: input.requestId,
    });
  } catch (error) {
    log.warn("Equipment retrieval verification trigger could not cancel the pending recovery workflow", {
      requestId: input.requestId,
      workflowId: workflowInfo().workflowId,
      source: input.source,
      startAt: input.startAt,
      recoveryWorkflowId: recoveryContext.workflowId,
      errorMessage: readErrorMessage(error),
    });
  }
}

async function failTriggerTerminally(
  input: EquipmentRetrievalVerificationTriggerWorkflowInput,
  round: 1 | 2,
  failure: ReturnType<typeof classifyTriggerFetchFailure>,
): Promise<never> {
  const details = buildTriggerFailureDetails(round, failure);

  observability.recordWorkflowTriggerFailure({
    workflow: COBRANCAS_TRIGGER_METRIC_WORKFLOW,
    source: input.source,
    failureKind: failure.errorKind,
    round: String(round) as "1" | "2",
  });
  observability.recordWorkflowTriggerExecution({
    workflow: COBRANCAS_TRIGGER_METRIC_WORKFLOW,
    source: input.source,
    result: "failed",
  });

  await registerEquipmentRetrievalVerificationTriggerFailureActivity({
    requestId: input.requestId,
    source: input.source,
    startAt: input.startAt,
    round,
    errorKind: failure.errorKind,
    details,
    ...(input.originRequestId === undefined
      ? {}
      : { originRequestId: input.originRequestId }),
  });

  throw ApplicationFailure.nonRetryable(
    details,
    failure.errorKind === "permanent"
      ? "COBRANCAS_TRIGGER_PERMANENT_FAILURE"
      : "COBRANCAS_TRIGGER_TRANSIENT_FAILURE",
  );
}
