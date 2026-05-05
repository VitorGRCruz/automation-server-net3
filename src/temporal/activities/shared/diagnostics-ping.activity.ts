import type {
  DiagnosticsPingActivityInput,
  DiagnosticsPingActivityResult,
} from "../../../domain/shared/diagnostics.types.js";
import { PermanentIntegrationError } from "../../../domain/shared/integration-error.types.js";
import { stepSuccess } from "../../../domain/shared/step-result.types.js";

export async function diagnosticsPingActivity(
  input: DiagnosticsPingActivityInput,
): Promise<DiagnosticsPingActivityResult> {
  if (input.message.trim().length === 0) {
    throw new PermanentIntegrationError({
      code: "DIAGNOSTICS_MESSAGE_INVALID",
      message: "Diagnostics message must not be empty",
    });
  }

  return stepSuccess({
    reply: `diagnostics:${input.message}`,
    checkedAt: new Date().toISOString(),
  });
}
