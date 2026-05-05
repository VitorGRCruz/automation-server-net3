import { WorkflowNotFoundError } from "@temporalio/client";
import type {
  CheckNfeEmailDispatchDiscoveryRunningActivityInput,
  CheckNfeEmailDispatchDiscoveryRunningActivityResult,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import { PermanentIntegrationError, TransientIntegrationError } from "../../../domain/shared/integration-error.types.js";
import { createTemporalClient, createTemporalConnection } from "../../client/temporal-client.js";

export async function checkNfeEmailDispatchDiscoveryRunningActivity(
  input: CheckNfeEmailDispatchDiscoveryRunningActivityInput,
): Promise<CheckNfeEmailDispatchDiscoveryRunningActivityResult> {
  const discoveryWorkflowId = validateInput(input);
  const connection = await createTemporalConnection();

  try {
    const client = createTemporalClient(connection);

    try {
      const description = await client.workflow
        .getHandle(discoveryWorkflowId)
        .describe();

      if (description.status.name === "RUNNING") {
        return {
          isRunning: true,
          discoveryWorkflowId,
          runId: description.runId,
        };
      }

      return {
        isRunning: false,
        discoveryWorkflowId,
      };
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) {
        return {
          isRunning: false,
          discoveryWorkflowId,
        };
      }

      throw error;
    }
  } catch (error) {
    throw new TransientIntegrationError({
      code: "NFE_EMAIL_DISPATCH_DISCOVERY_STATE_CHECK_FAILED",
      message:
        "NF-e processing could not verify whether the discovery workflow is running",
      cause: error,
    });
  } finally {
    await connection.close();
  }
}

function validateInput(
  input: CheckNfeEmailDispatchDiscoveryRunningActivityInput,
): string {
  const discoveryWorkflowId = input.discoveryWorkflowId.trim();

  if (discoveryWorkflowId.length === 0) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_DISCOVERY_STATE_INVALID_WORKFLOW_ID",
      message: "NF-e processing requires a non-empty discoveryWorkflowId for discovery state checks",
    });
  }

  return discoveryWorkflowId;
}
