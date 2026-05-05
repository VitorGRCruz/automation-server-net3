import { randomUUID } from "node:crypto";
import type { ResultSetHeader } from "mysql2/promise";
import {
  PermanentIntegrationError,
  TransientIntegrationError,
} from "../../domain/shared/integration-error.types.js";
import { recordWorkflowStepIdempotencyFinalization, recordWorkflowStepIdempotencyReservation } from "../observability/metrics.js";
import { writeStructuredConsoleLog } from "../runtime/structured-console-log.js";
import type { SystemDbClient, SystemDbRow } from "./system-db.types.js";

const WORKFLOW_STEP_IDEMPOTENCY_TABLE = "workflow_step_idempotency";
const PENDING_RESERVATION_TTL_SECONDS = 90;
const MAX_RESERVATION_RELOAD_ATTEMPTS = 3;

type WorkflowStepExecutionStatus = "pending" | "completed" | "failed";

export interface WorkflowStepIdempotencyReservationInput<TResult> {
  workflowName: string;
  workflowId: string;
  stepName: string;
  idempotencyKey: string;
  requestId: string;
  payloadHash: string;
  parseResult: (value: unknown) => TResult | null;
}

export type WorkflowStepIdempotencyReservation<TResult> =
  | {
      reservationStatus: "reserved";
      recordId: number;
      leaseToken: string;
    }
  | {
      reservationStatus: "pending";
      recordId: number;
      updatedAt: string;
    }
  | {
      reservationStatus: "completed";
      recordId: number;
      updatedAt: string;
      result: TResult;
    }
  | {
      reservationStatus: "failed";
      recordId: number;
      updatedAt: string;
      result: TResult;
    };

export interface FinalizeWorkflowStepIdempotencyInput<TResult> {
  workflowName: string;
  stepName: string;
  idempotencyKey: string;
  leaseToken: string;
  result: TResult;
  externalReference?: string;
}

export interface CancelWorkflowStepIdempotencyReservationInput {
  workflowName: string;
  stepName: string;
  idempotencyKey: string;
  leaseToken: string;
}

interface WorkflowStepIdempotencyRow extends SystemDbRow {
  id: number | string;
  workflow_name: string;
  workflow_id: string;
  step_name: string;
  idempotency_key: string;
  request_id: string;
  payload_hash: string;
  execution_status: WorkflowStepExecutionStatus;
  lease_token: string | null;
  attempt_count: number | string;
  last_attempted_at: string | null;
  pending_expires_at: string | null;
  external_reference: string | null;
  result_payload_json: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export async function reserveWorkflowStepIdempotency<TResult>(
  client: SystemDbClient,
  input: WorkflowStepIdempotencyReservationInput<TResult>,
): Promise<WorkflowStepIdempotencyReservation<TResult>> {
  const leaseToken = randomUUID();
  for (let attempt = 0; attempt < MAX_RESERVATION_RELOAD_ATTEMPTS; attempt += 1) {
    const insertResult = await client.execute(
      `
        INSERT IGNORE INTO ${WORKFLOW_STEP_IDEMPOTENCY_TABLE} (
          workflow_name,
          workflow_id,
          step_name,
          idempotency_key,
          request_id,
          payload_hash,
          execution_status,
          lease_token,
          attempt_count,
          last_attempted_at,
          pending_expires_at,
          external_reference,
          result_payload_json,
          created_at,
          updated_at,
          completed_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, 'pending', ?, 1, UTC_TIMESTAMP(),
          DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${PENDING_RESERVATION_TTL_SECONDS} SECOND),
          NULL, NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP(), NULL
        )
      `,
      [
        input.workflowName,
        input.workflowId,
        input.stepName,
        input.idempotencyKey,
        input.requestId,
        input.payloadHash,
        leaseToken,
      ],
    );

    if (insertResult.affectedRows === 1) {
      recordWorkflowStepIdempotencyReservation({
        workflow: input.workflowName,
        step: input.stepName,
        reservationStatus: "reserved",
      });

      writeStructuredConsoleLog("info", "Reserved workflow step idempotency record", {
        requestId: input.requestId,
        workflowId: input.workflowId,
        workflowName: input.workflowName,
        stepName: input.stepName,
        idempotencyKey: input.idempotencyKey,
        reservationStatus: "reserved",
        recordId: normalizeInsertId(insertResult),
        attemptCount: 1,
        reservationReason: "new-record",
      });

      return {
        reservationStatus: "reserved",
        recordId: normalizeInsertId(insertResult),
        leaseToken,
      };
    }

    const row = await findWorkflowStepIdempotencyRow(client, {
      workflowName: input.workflowName,
      stepName: input.stepName,
      idempotencyKey: input.idempotencyKey,
    });

    if (row === null) {
      writeStructuredConsoleLog(
        "warn",
        "Workflow step idempotency record disappeared during reservation reload",
        {
          requestId: input.requestId,
          workflowId: input.workflowId,
          workflowName: input.workflowName,
          stepName: input.stepName,
          idempotencyKey: input.idempotencyKey,
          reloadAttempt: attempt + 1,
        },
      );

      continue;
    }

    if (row.payload_hash !== input.payloadHash) {
      throw new PermanentIntegrationError({
        code: "SYSTEM_DB_IDEMPOTENCY_PAYLOAD_MISMATCH",
        message: buildPayloadMismatchMessage(input.stepName, input.idempotencyKey),
      });
    }

    if (row.execution_status === "pending") {
      const reclaimed = await tryReclaimExpiredPendingReservation(client, {
        workflowName: input.workflowName,
        workflowId: input.workflowId,
        stepName: input.stepName,
        idempotencyKey: input.idempotencyKey,
        requestId: input.requestId,
        payloadHash: input.payloadHash,
        recordId: readRowId(row.id),
        leaseToken,
      });

      if (reclaimed) {
        recordWorkflowStepIdempotencyReservation({
          workflow: input.workflowName,
          step: input.stepName,
          reservationStatus: "reserved",
        });

        writeStructuredConsoleLog("warn", "Reclaimed expired workflow step idempotency record", {
          requestId: input.requestId,
          workflowId: input.workflowId,
          workflowName: input.workflowName,
          stepName: input.stepName,
          idempotencyKey: input.idempotencyKey,
          reservationStatus: "reserved",
          recordId: readRowId(row.id),
          previousUpdatedAt: row.updated_at,
          previousAttemptCount: readAttemptCount(row.attempt_count),
          reservationReason: "expired-pending",
        });

        return {
          reservationStatus: "reserved",
          recordId: readRowId(row.id),
          leaseToken,
        };
      }

      if (isExpiredPendingReservation(row.pending_expires_at)) {
        continue;
      }

      recordWorkflowStepIdempotencyReservation({
        workflow: input.workflowName,
        step: input.stepName,
        reservationStatus: "pending",
      });

      writeStructuredConsoleLog("warn", "Workflow step idempotency record is still pending", {
        requestId: input.requestId,
        workflowId: input.workflowId,
        workflowName: input.workflowName,
        stepName: input.stepName,
        idempotencyKey: input.idempotencyKey,
        reservationStatus: "pending",
        recordId: readRowId(row.id),
        updatedAt: row.updated_at,
        attemptCount: readAttemptCount(row.attempt_count),
        pendingExpiresAt: row.pending_expires_at,
      });

      return {
        reservationStatus: "pending",
        recordId: readRowId(row.id),
        updatedAt: row.updated_at,
      };
    }

    if (row.execution_status === "completed") {
      recordWorkflowStepIdempotencyReservation({
        workflow: input.workflowName,
        step: input.stepName,
        reservationStatus: "completed",
      });

      writeStructuredConsoleLog("info", "Workflow step idempotency record reused completed result", {
        requestId: input.requestId,
        workflowId: input.workflowId,
        workflowName: input.workflowName,
        stepName: input.stepName,
        idempotencyKey: input.idempotencyKey,
        reservationStatus: "completed",
        recordId: readRowId(row.id),
        updatedAt: row.updated_at,
        attemptCount: readAttemptCount(row.attempt_count),
      });

      return {
        reservationStatus: "completed",
        recordId: readRowId(row.id),
        updatedAt: row.updated_at,
        result: readStoredResult(row, input.parseResult),
      };
    }

    recordWorkflowStepIdempotencyReservation({
      workflow: input.workflowName,
      step: input.stepName,
      reservationStatus: "failed",
    });

    writeStructuredConsoleLog("warn", "Workflow step idempotency record reused failed result", {
      requestId: input.requestId,
      workflowId: input.workflowId,
      workflowName: input.workflowName,
      stepName: input.stepName,
      idempotencyKey: input.idempotencyKey,
      reservationStatus: "failed",
      recordId: readRowId(row.id),
      updatedAt: row.updated_at,
      attemptCount: readAttemptCount(row.attempt_count),
    });

    return {
      reservationStatus: "failed",
      recordId: readRowId(row.id),
      updatedAt: row.updated_at,
      result: readStoredResult(row, input.parseResult),
    };
  }

  throw new TransientIntegrationError({
    code: "SYSTEM_DB_IDEMPOTENCY_RESERVATION_RACE",
    message: `System database could not stabilize idempotency reservation for step ${input.stepName}`,
  });
}

export async function markWorkflowStepIdempotencyCompleted<TResult>(
  client: SystemDbClient,
  input: FinalizeWorkflowStepIdempotencyInput<TResult>,
): Promise<void> {
  await finalizeWorkflowStepIdempotency(client, {
    ...input,
    executionStatus: "completed",
  });
}

export async function markWorkflowStepIdempotencyFailed<TResult>(
  client: SystemDbClient,
  input: FinalizeWorkflowStepIdempotencyInput<TResult>,
): Promise<void> {
  await finalizeWorkflowStepIdempotency(client, {
    ...input,
    executionStatus: "failed",
  });
}

export async function cancelWorkflowStepIdempotencyReservation(
  client: SystemDbClient,
  input: CancelWorkflowStepIdempotencyReservationInput,
): Promise<void> {
  const result = await client.execute(
    `
      DELETE FROM ${WORKFLOW_STEP_IDEMPOTENCY_TABLE}
      WHERE
        workflow_name = ? AND
        step_name = ? AND
        idempotency_key = ? AND
        execution_status = 'pending' AND
        lease_token = ?
    `,
    [
      input.workflowName,
      input.stepName,
      input.idempotencyKey,
      input.leaseToken,
    ],
  );

  if (result.affectedRows === 1) {
    writeStructuredConsoleLog("info", "Cancelled workflow step idempotency reservation", {
      workflowName: input.workflowName,
      stepName: input.stepName,
      idempotencyKey: input.idempotencyKey,
    });

    return;
  }

  const row = await loadWorkflowStepIdempotencyRow(client, {
    workflowName: input.workflowName,
    stepName: input.stepName,
    idempotencyKey: input.idempotencyKey,
  });

  if (row.execution_status === "completed" || row.execution_status === "failed") {
    writeStructuredConsoleLog("warn", "Workflow step idempotency reservation was already finalized before cancellation", {
      workflowName: input.workflowName,
      stepName: input.stepName,
      idempotencyKey: input.idempotencyKey,
      executionStatus: row.execution_status,
    });

    return;
  }

  if (row.lease_token !== input.leaseToken) {
    throw new TransientIntegrationError({
      code: "SYSTEM_DB_IDEMPOTENCY_LEASE_LOST",
      message: `System database lost the active idempotency lease for step ${input.stepName}`,
    });
  }

  throw new PermanentIntegrationError({
    code: "SYSTEM_DB_IDEMPOTENCY_CANCEL_NOT_FOUND",
    message: `System database could not cancel idempotency record for step ${input.stepName}`,
  });
}

async function finalizeWorkflowStepIdempotency<TResult>(
  client: SystemDbClient,
  input: FinalizeWorkflowStepIdempotencyInput<TResult> & {
    executionStatus: Exclude<WorkflowStepExecutionStatus, "pending">;
  },
): Promise<void> {
  const result = await client.execute(
    `
      UPDATE ${WORKFLOW_STEP_IDEMPOTENCY_TABLE}
      SET
        execution_status = ?,
        lease_token = NULL,
        external_reference = ?,
        result_payload_json = ?,
        updated_at = UTC_TIMESTAMP(),
        pending_expires_at = NULL,
        completed_at = UTC_TIMESTAMP()
      WHERE
        workflow_name = ? AND
        step_name = ? AND
        idempotency_key = ? AND
        execution_status = 'pending' AND
        lease_token = ?
    `,
    [
      input.executionStatus,
      input.externalReference ?? null,
      JSON.stringify(input.result),
      input.workflowName,
      input.stepName,
      input.idempotencyKey,
      input.leaseToken,
    ],
  );

  if (result.affectedRows === 1) {
    recordWorkflowStepIdempotencyFinalization({
      workflow: input.workflowName,
      step: input.stepName,
      finalStatus: input.executionStatus,
    });

    writeStructuredConsoleLog("info", "Finalized workflow step idempotency record", {
      workflowName: input.workflowName,
      stepName: input.stepName,
      idempotencyKey: input.idempotencyKey,
      finalStatus: input.executionStatus,
      externalReference: input.externalReference ?? null,
    });

    return;
  }

  const row = await loadWorkflowStepIdempotencyRow(client, {
    workflowName: input.workflowName,
    stepName: input.stepName,
    idempotencyKey: input.idempotencyKey,
  });

  if (row.execution_status === "completed" || row.execution_status === "failed") {
    writeStructuredConsoleLog("warn", "Workflow step idempotency record was already finalized", {
      workflowName: input.workflowName,
      stepName: input.stepName,
      idempotencyKey: input.idempotencyKey,
      finalStatus: row.execution_status,
      leaseToken: input.leaseToken,
      rowLeaseToken: row.lease_token,
    });

    return;
  }

  if (row.lease_token !== input.leaseToken) {
    throw new TransientIntegrationError({
      code: "SYSTEM_DB_IDEMPOTENCY_LEASE_LOST",
      message: `System database lost the active idempotency lease for step ${input.stepName}`,
    });
  }

  throw new PermanentIntegrationError({
    code: "SYSTEM_DB_IDEMPOTENCY_FINALIZE_NOT_FOUND",
    message: `System database could not finalize idempotency record for step ${input.stepName}`,
  });
}

async function loadWorkflowStepIdempotencyRow(
  client: SystemDbClient,
  input: {
    workflowName: string;
    stepName: string;
    idempotencyKey: string;
  },
): Promise<WorkflowStepIdempotencyRow> {
  const row = await findWorkflowStepIdempotencyRow(client, input);

  if (row === null) {
    throw new PermanentIntegrationError({
      code: "SYSTEM_DB_IDEMPOTENCY_RECORD_NOT_FOUND",
      message: `System database did not return an idempotency record for step ${input.stepName}`,
    });
  }

  return row;
}

async function findWorkflowStepIdempotencyRow(
  client: SystemDbClient,
  input: {
    workflowName: string;
    stepName: string;
    idempotencyKey: string;
  },
): Promise<WorkflowStepIdempotencyRow | null> {
  const rows = await client.select<WorkflowStepIdempotencyRow>(
    `
      SELECT
        id,
        workflow_name,
        workflow_id,
        step_name,
        idempotency_key,
        request_id,
        payload_hash,
        execution_status,
        lease_token,
        attempt_count,
        last_attempted_at,
        pending_expires_at,
        external_reference,
        result_payload_json,
        created_at,
        updated_at,
        completed_at
      FROM ${WORKFLOW_STEP_IDEMPOTENCY_TABLE}
      WHERE workflow_name = ? AND step_name = ? AND idempotency_key = ?
      LIMIT 1
    `,
    [input.workflowName, input.stepName, input.idempotencyKey],
  );

  const row = rows[0];

  return row ?? null;
}

async function tryReclaimExpiredPendingReservation(
  client: SystemDbClient,
  input: {
    workflowName: string;
    workflowId: string;
    stepName: string;
    idempotencyKey: string;
    requestId: string;
    payloadHash: string;
    recordId: number;
    leaseToken: string;
  },
): Promise<boolean> {
  const result = await client.execute(
    `
      UPDATE ${WORKFLOW_STEP_IDEMPOTENCY_TABLE}
      SET
        workflow_id = ?,
        request_id = ?,
        payload_hash = ?,
        lease_token = ?,
        attempt_count = attempt_count + 1,
        last_attempted_at = UTC_TIMESTAMP(),
        updated_at = UTC_TIMESTAMP(),
        pending_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${PENDING_RESERVATION_TTL_SECONDS} SECOND),
        completed_at = NULL
      WHERE
        id = ? AND
        execution_status = 'pending' AND
        (pending_expires_at IS NULL OR pending_expires_at <= UTC_TIMESTAMP())
    `,
    [
      input.workflowId,
      input.requestId,
      input.payloadHash,
      input.leaseToken,
      input.recordId,
    ],
  );

  return result.affectedRows === 1;
}

function readStoredResult<TResult>(
  row: WorkflowStepIdempotencyRow,
  parseResult: (value: unknown) => TResult | null,
): TResult {
  if (row.result_payload_json === null) {
    throw new PermanentIntegrationError({
      code: "SYSTEM_DB_IDEMPOTENCY_RESULT_MISSING",
      message: `System database stored an idempotency record without result payload for step ${row.step_name}`,
    });
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(row.result_payload_json) as unknown;
  } catch (error) {
    throw new PermanentIntegrationError({
      code: "SYSTEM_DB_IDEMPOTENCY_RESULT_INVALID_JSON",
      message: `System database stored invalid JSON for idempotency step ${row.step_name}`,
      cause: error,
    });
  }

  const parsedResult = parseResult(parsedJson);

  if (parsedResult !== null) {
    return parsedResult;
  }

  throw new PermanentIntegrationError({
    code: "SYSTEM_DB_IDEMPOTENCY_RESULT_INVALID_PAYLOAD",
    message: `System database stored an invalid idempotency result payload for step ${row.step_name}`,
  });
}

function normalizeInsertId(result: ResultSetHeader): number {
  const recordId = Number(result.insertId);

  if (Number.isSafeInteger(recordId) && recordId > 0) {
    return recordId;
  }

  throw new PermanentIntegrationError({
    code: "SYSTEM_DB_IDEMPOTENCY_INVALID_INSERT_ID",
    message: "System database returned an invalid insert id for an idempotency reservation",
  });
}

function readAttemptCount(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsedValue = Number(value);

    if (Number.isSafeInteger(parsedValue) && parsedValue > 0) {
      return parsedValue;
    }
  }

  throw new PermanentIntegrationError({
    code: "SYSTEM_DB_IDEMPOTENCY_INVALID_ATTEMPT_COUNT",
    message: "System database returned an invalid idempotency attempt count",
  });
}

function readRowId(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsedValue = Number(value);

    if (Number.isSafeInteger(parsedValue) && parsedValue > 0) {
      return parsedValue;
    }
  }

  throw new PermanentIntegrationError({
    code: "SYSTEM_DB_IDEMPOTENCY_INVALID_ROW_ID",
    message: "System database returned an invalid idempotency row id",
  });
}

function isExpiredPendingReservation(value: string | null): boolean {
  if (value === null) {
    return true;
  }

  return value <= formatUtcDateTime(new Date());
}

function formatUtcDateTime(value: Date): string {
  return value.toISOString().slice(0, 19).replace("T", " ");
}

function buildPayloadMismatchMessage(stepName: string, idempotencyKey: string): string {
  return `System database detected a payload mismatch for idempotency step ${stepName} and key ${idempotencyKey}`;
}
