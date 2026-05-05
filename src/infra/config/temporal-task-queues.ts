import type { WorkerQueueRoleMetricLabel } from "../../domain/shared/observability.types.js";

export const temporalTaskQueues = Object.freeze({
  control: "automation-control",
  erpRead: "automation-erp-read",
  opa: "automation-opa",
  ixc: "automation-ixc",
});

export function resolveTemporalTaskQueueRoleMetricLabel(
  taskQueue: string,
): WorkerQueueRoleMetricLabel {
  switch (taskQueue) {
    case temporalTaskQueues.control:
      return "control";
    case temporalTaskQueues.erpRead:
      return "erp_read";
    case temporalTaskQueues.opa:
      return "opa";
    case temporalTaskQueues.ixc:
      return "ixc";
    default:
      return "unknown";
  }
}
