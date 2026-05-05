import type { InjectedSinks } from "@temporalio/worker";
import type { WorkflowObservabilitySinks } from "../../domain/shared/observability.types.js";
import {
  addWorkflowTriggerAlreadyRunning,
  addWorkflowTriggerChildWorkflowsStarted,
  addWorkflowTriggerEligibleItems,
  recordWorkflowTriggerExecution,
  recordWorkflowTriggerFailure,
  recordWorkflowTriggerRecoveryAlreadyPending,
  recordWorkflowTriggerRecoveryScheduled,
} from "../../infra/observability/metrics.js";

export const workerObservabilitySinks: InjectedSinks<WorkflowObservabilitySinks> = {
  observability: {
    recordWorkflowTriggerExecution: {
      fn(_info, input) {
        recordWorkflowTriggerExecution(input);
      },
    },
    addWorkflowTriggerEligibleItems: {
      fn(_info, input) {
        addWorkflowTriggerEligibleItems(input);
      },
    },
    addWorkflowTriggerChildWorkflowsStarted: {
      fn(_info, input) {
        addWorkflowTriggerChildWorkflowsStarted(input);
      },
    },
    addWorkflowTriggerAlreadyRunning: {
      fn(_info, input) {
        addWorkflowTriggerAlreadyRunning(input);
      },
    },
    recordWorkflowTriggerFailure: {
      fn(_info, input) {
        recordWorkflowTriggerFailure(input);
      },
    },
    recordWorkflowTriggerRecoveryScheduled: {
      fn(_info, input) {
        recordWorkflowTriggerRecoveryScheduled(input);
      },
    },
    recordWorkflowTriggerRecoveryAlreadyPending: {
      fn(_info, input) {
        recordWorkflowTriggerRecoveryAlreadyPending(input);
      },
    },
  },
};
