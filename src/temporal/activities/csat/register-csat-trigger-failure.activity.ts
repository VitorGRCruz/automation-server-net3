import type {
  RegisterCsatTriggerFailureActivityInput,
  RegisterCsatTriggerFailureActivityResult,
} from "../../../domain/csat/csat-start-survey.types.js";
import { PermanentIntegrationError } from "../../../domain/shared/integration-error.types.js";
import { stepSuccess } from "../../../domain/shared/step-result.types.js";
import { writeStructuredConsoleLog } from "../../../infra/runtime/structured-console-log.js";

/**
 * Temporary audit hook for terminal failures in the ERP trigger stage.
 */
export async function registerCsatTriggerFailureActivity(
  input: RegisterCsatTriggerFailureActivityInput,
): Promise<RegisterCsatTriggerFailureActivityResult> {
  if (input.details.trim().length === 0) {
    throw new PermanentIntegrationError({
      code: "CSAT_TRIGGER_FAILURE_DETAILS_REQUIRED",
      message: "CSAT trigger failure details must not be empty",
    });
  }

  writeStructuredConsoleLog("error", "CSAT trigger failure recorded", {
    requestId: input.requestId,
    source: input.source,
    details: input.details,
  });

  return stepSuccess({
    recordedAt: new Date().toISOString(),
  });
}
