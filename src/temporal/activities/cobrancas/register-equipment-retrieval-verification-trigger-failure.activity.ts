import type {
  RegisterEquipmentRetrievalVerificationTriggerFailureActivityInput,
  RegisterEquipmentRetrievalVerificationTriggerFailureActivityResult,
} from "../../../domain/cobrancas/equipment-retrieval-verification.types.js";
import { PermanentIntegrationError } from "../../../domain/shared/integration-error.types.js";
import { stepSuccess } from "../../../domain/shared/step-result.types.js";
import { writeStructuredConsoleLog } from "../../../infra/runtime/structured-console-log.js";

export async function registerEquipmentRetrievalVerificationTriggerFailureActivity(
  input: RegisterEquipmentRetrievalVerificationTriggerFailureActivityInput,
): Promise<RegisterEquipmentRetrievalVerificationTriggerFailureActivityResult> {
  const validatedInput = validateRegisterTriggerFailureInput(input);

  writeStructuredConsoleLog("error", "Equipment retrieval verification trigger failure recorded", {
    requestId: validatedInput.requestId,
    source: validatedInput.source,
    startAt: validatedInput.startAt,
    round: validatedInput.round,
    errorKind: validatedInput.errorKind,
    originRequestId: validatedInput.originRequestId ?? null,
    details: validatedInput.details,
  });

  return stepSuccess({
    recordedAt: new Date().toISOString(),
  });
}

function validateRegisterTriggerFailureInput(
  input: RegisterEquipmentRetrievalVerificationTriggerFailureActivityInput,
): RegisterEquipmentRetrievalVerificationTriggerFailureActivityInput {
  const requestId = input.requestId.trim();
  const details = input.details.trim();
  const startAt = input.startAt.trim();

  if (requestId.length === 0) {
    throw new PermanentIntegrationError({
      code: "COBRANCAS_TRIGGER_FAILURE_INVALID_REQUEST_ID",
      message: "Equipment retrieval verification trigger failure hook requires a non-empty requestId",
    });
  }

  if (startAt.length === 0) {
    throw new PermanentIntegrationError({
      code: "COBRANCAS_TRIGGER_FAILURE_INVALID_START_AT",
      message: "Equipment retrieval verification trigger failure hook requires a non-empty startAt",
    });
  }

  if (details.length === 0) {
    throw new PermanentIntegrationError({
      code: "COBRANCAS_TRIGGER_FAILURE_INVALID_DETAILS",
      message: "Equipment retrieval verification trigger failure hook requires non-empty details",
    });
  }

  return {
    ...input,
    requestId,
    startAt,
    details,
  };
}
