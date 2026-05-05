import { createHash } from "node:crypto";
import type {
  AcquireNfeEmailDispatchSaleAttemptLockActivityInput,
  AcquireNfeEmailDispatchSaleAttemptLockActivityResult,
  CancelNfeEmailDispatchSaleAttemptLockActivityInput,
  CompleteNfeEmailDispatchSaleAttemptLockActivityInput,
  NfeEmailDispatchFinalizationStatus,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import {
  PermanentIntegrationError,
  TransientIntegrationError,
  isIntegrationError,
} from "../../../domain/shared/integration-error.types.js";
import {
  cancelWorkflowStepIdempotencyReservation,
  markWorkflowStepIdempotencyCompleted,
  reserveWorkflowStepIdempotency,
} from "../../../infra/system-db/workflow-step-idempotency.repository.js";
import { getSharedSystemDbClient } from "../../../infra/system-db/system-db.client.js";
import {
  resolveActivityRuntimeScope,
  scopeActivityIdempotencyParts,
} from "../shared/activity-idempotency-scope.js";

const NFE_EMAIL_DISPATCH_ATTEMPT_LOCK_WORKFLOW_NAME =
  "nfe-email-dispatch-sale-attempt-lock";
const NFE_EMAIL_DISPATCH_ATTEMPT_LOCK_STEP_NAME = "attempt-lock";

interface NfeEmailDispatchSaleAttemptLockStoredResult {
  finalStatus: NfeEmailDispatchFinalizationStatus;
  releasedAt: string;
}

export async function acquireNfeEmailDispatchSaleAttemptLockActivity(
  input: AcquireNfeEmailDispatchSaleAttemptLockActivityInput,
): Promise<AcquireNfeEmailDispatchSaleAttemptLockActivityResult> {
  const validatedInput = validateAcquireInput(input);
  const systemDbClient = getSharedSystemDbClient();

  try {
    const reservation = await reserveWorkflowStepIdempotency(systemDbClient, {
      workflowName: NFE_EMAIL_DISPATCH_ATTEMPT_LOCK_WORKFLOW_NAME,
      workflowId: validatedInput.workflowId,
      stepName: NFE_EMAIL_DISPATCH_ATTEMPT_LOCK_STEP_NAME,
      idempotencyKey: buildAttemptLockIdempotencyKey(
        validatedInput.nfeEmailDispatchSaleId,
        validatedInput.attemptNumber,
        validatedInput.runtimeScope,
      ),
      requestId: validatedInput.requestId,
      payloadHash: buildAttemptLockPayloadHash(validatedInput),
      parseResult: parseAttemptLockStoredResult,
    });

    switch (reservation.reservationStatus) {
      case "reserved":
        return {
          status: "ACQUIRED",
          leaseToken: reservation.leaseToken,
        };
      case "pending":
        return {
          status: "PENDING",
        };
      case "completed":
      case "failed":
        return {
          status: "ALREADY_PROCESSED",
          finalStatus: reservation.result.finalStatus,
        };
    }
  } catch (error) {
    throw normalizeAttemptLockError(error, "acquire");
  }
}

export async function completeNfeEmailDispatchSaleAttemptLockActivity(
  input: CompleteNfeEmailDispatchSaleAttemptLockActivityInput,
): Promise<void> {
  const validatedInput = validateCompleteInput(input);
  const systemDbClient = getSharedSystemDbClient();

  try {
    await markWorkflowStepIdempotencyCompleted(systemDbClient, {
      workflowName: NFE_EMAIL_DISPATCH_ATTEMPT_LOCK_WORKFLOW_NAME,
      stepName: NFE_EMAIL_DISPATCH_ATTEMPT_LOCK_STEP_NAME,
      idempotencyKey: buildAttemptLockIdempotencyKey(
        validatedInput.nfeEmailDispatchSaleId,
        validatedInput.attemptNumber,
        validatedInput.runtimeScope,
      ),
      leaseToken: validatedInput.leaseToken,
      result: {
        finalStatus: validatedInput.finalStatus,
        releasedAt: new Date().toISOString(),
      },
      externalReference: validatedInput.workflowId,
    });
  } catch (error) {
    throw normalizeAttemptLockError(error, "complete");
  }
}

export async function cancelNfeEmailDispatchSaleAttemptLockActivity(
  input: CancelNfeEmailDispatchSaleAttemptLockActivityInput,
): Promise<void> {
  const validatedInput = validateCancelInput(input);
  const systemDbClient = getSharedSystemDbClient();

  try {
    await cancelWorkflowStepIdempotencyReservation(systemDbClient, {
      workflowName: NFE_EMAIL_DISPATCH_ATTEMPT_LOCK_WORKFLOW_NAME,
      stepName: NFE_EMAIL_DISPATCH_ATTEMPT_LOCK_STEP_NAME,
      idempotencyKey: buildAttemptLockIdempotencyKey(
        validatedInput.nfeEmailDispatchSaleId,
        validatedInput.attemptNumber,
        validatedInput.runtimeScope,
      ),
      leaseToken: validatedInput.leaseToken,
    });
  } catch (error) {
    throw normalizeAttemptLockError(error, "cancel");
  }
}

function validateAcquireInput(
  input: AcquireNfeEmailDispatchSaleAttemptLockActivityInput,
): AcquireNfeEmailDispatchSaleAttemptLockActivityInput & {
  runtimeScope: string;
} {
  return {
    requestId: readRequiredText(input.requestId, "requestId"),
    workflowId: readRequiredText(input.workflowId, "workflowId"),
    nfeEmailDispatchSaleId: readPositiveInteger(
      input.nfeEmailDispatchSaleId,
      "nfeEmailDispatchSaleId",
    ),
    attemptNumber: readPositiveInteger(input.attemptNumber, "attemptNumber"),
    runtimeScope: resolveActivityRuntimeScope(input.runtimeScope),
  };
}

function validateCompleteInput(
  input: CompleteNfeEmailDispatchSaleAttemptLockActivityInput,
): CompleteNfeEmailDispatchSaleAttemptLockActivityInput & {
  runtimeScope: string;
} {
  return {
    workflowId: readRequiredText(input.workflowId, "workflowId"),
    nfeEmailDispatchSaleId: readPositiveInteger(
      input.nfeEmailDispatchSaleId,
      "nfeEmailDispatchSaleId",
    ),
    attemptNumber: readPositiveInteger(input.attemptNumber, "attemptNumber"),
    runtimeScope: resolveActivityRuntimeScope(input.runtimeScope),
    leaseToken: readRequiredText(input.leaseToken, "leaseToken"),
    finalStatus: input.finalStatus,
  };
}

function validateCancelInput(
  input: CancelNfeEmailDispatchSaleAttemptLockActivityInput,
): CancelNfeEmailDispatchSaleAttemptLockActivityInput & {
  runtimeScope: string;
} {
  return {
    nfeEmailDispatchSaleId: readPositiveInteger(
      input.nfeEmailDispatchSaleId,
      "nfeEmailDispatchSaleId",
    ),
    attemptNumber: readPositiveInteger(input.attemptNumber, "attemptNumber"),
    runtimeScope: resolveActivityRuntimeScope(input.runtimeScope),
    leaseToken: readRequiredText(input.leaseToken, "leaseToken"),
  };
}

function buildAttemptLockIdempotencyKey(
  nfeEmailDispatchSaleId: number,
  attemptNumber: number,
  runtimeScope: string,
): string {
  return scopeActivityIdempotencyParts(
    [
      "nfe-email-dispatch-sale-attempt-lock",
      `sale-${nfeEmailDispatchSaleId}`,
      `attempt-${attemptNumber}`,
    ],
    runtimeScope,
  ).join("/");
}

function buildAttemptLockPayloadHash(
  input: AcquireNfeEmailDispatchSaleAttemptLockActivityInput & {
    runtimeScope: string;
  },
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
        attemptNumber: input.attemptNumber,
        runtimeScope: input.runtimeScope,
      }),
    )
    .digest("hex");
}

function parseAttemptLockStoredResult(
  value: unknown,
): NfeEmailDispatchSaleAttemptLockStoredResult | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as Partial<NfeEmailDispatchSaleAttemptLockStoredResult>;

  if (
    (candidate.finalStatus === "SENT" ||
      candidate.finalStatus === "FAILED_TRANSIENT" ||
      candidate.finalStatus === "FAILED_FINAL" ||
      candidate.finalStatus === "DELIVERY_UNKNOWN") &&
    typeof candidate.releasedAt === "string" &&
    candidate.releasedAt.trim().length > 0
  ) {
    return {
      finalStatus: candidate.finalStatus,
      releasedAt: candidate.releasedAt.trim(),
    };
  }

  return null;
}

function readRequiredText(value: string, fieldName: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_ATTEMPT_LOCK_INVALID_TEXT",
      message: `NF-e attempt lock activity requires a non-empty ${fieldName}`,
    });
  }

  return normalizedValue;
}

function readPositiveInteger(value: number, fieldName: string): number {
  if (Number.isSafeInteger(value) && value > 0) {
    return value;
  }

  throw new PermanentIntegrationError({
    code: "NFE_EMAIL_DISPATCH_ATTEMPT_LOCK_INVALID_INTEGER",
    message: `NF-e attempt lock activity requires a positive integer for ${fieldName}`,
  });
}

function normalizeAttemptLockError(error: unknown, action: string): Error {
  if (isIntegrationError(error)) {
    return error;
  }

  return new TransientIntegrationError({
    code: "NFE_EMAIL_DISPATCH_ATTEMPT_LOCK_FAILED",
    message: `NF-e attempt lock activity could not ${action} the shared sale-attempt reservation`,
    cause: error,
  });
}
