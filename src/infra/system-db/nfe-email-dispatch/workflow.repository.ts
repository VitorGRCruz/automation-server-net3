import type {
  NfeEmailDispatchEligibleSale,
  NfeEmailDispatchSaleToProcess,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import { PermanentIntegrationError } from "../../../domain/shared/integration-error.types.js";
import type { SystemDbClient } from "../system-db.types.js";
import {
  type ClaimManualNfeEmailDispatchSaleInput,
  type ClaimManualNfeEmailDispatchSaleResult,
  type ClaimNfeEmailDispatchSaleInput,
  type ClaimNfeEmailDispatchSaleResult,
  type FinalizeNfeEmailDispatchSaleDirectInput,
  type FinalizeNfeEmailDispatchSaleDirectResult,
  type FinalizeNfeEmailDispatchSaleInput,
  type FinalizeNfeEmailDispatchSaleResult,
  type LoadEligibleNfeEmailDispatchSalesInput,
  type RollbackManualNfeEmailDispatchSaleClaimInput,
  type RollbackManualNfeEmailDispatchSaleClaimResult,
} from "./contracts.js";
import { normalizeDateTime3 } from "./date-time.js";
import { mapEligibleSaleRow } from "./mappers.js";
import { type NfeEmailDispatchEligibleSaleRow, type NfeEmailDispatchSaleToProcessRow } from "./row-types.js";
import { readRowNumber } from "./sql.js";
import { findNfeEmailDispatchSaleStatus } from "./sale.repository.js";
import {
  normalizeFinalStatus,
  normalizeMaxSendAttempts,
  normalizeNonNegativeInteger,
  normalizeOptionalErrorMessage,
  normalizeOptionalSentAt,
  normalizePositiveInteger,
  normalizeRuntimeScope,
  normalizeSaleStatus,
} from "./validation.js";

export async function loadEligibleNfeEmailDispatchSales(
  client: SystemDbClient,
  input: LoadEligibleNfeEmailDispatchSalesInput,
): Promise<NfeEmailDispatchSaleToProcess[]> {
  const runtimeScope = normalizeRuntimeScope(input.runtimeScope);
  const maxSendAttempts = normalizeMaxSendAttempts(
    input.maxSendAttempts,
    "Eligible sale",
  );

  const rows = await client.select<NfeEmailDispatchSaleToProcessRow>(
    `
      SELECT
        id,
        erp_sale_id,
        attempt_count
      FROM nfe_email_dispatch_sale
      WHERE
        runtime_scope = ?
        AND (
          status = 'PENDING'
          OR (
            status = 'FAILED_TRANSIENT'
            AND attempt_count < ?
          )
        )
      ORDER BY
        created_at ASC,
        id ASC
    `,
    [runtimeScope, maxSendAttempts],
  );

  return rows.map((row) => ({
    nfeEmailDispatchSaleId: readRowNumber(row.id, "nfe_email_dispatch_sale.id"),
    erpSaleId: readRowNumber(row.erp_sale_id, "nfe_email_dispatch_sale.erp_sale_id"),
    currentAttemptCount: readRowNumber(
      row.attempt_count,
      "nfe_email_dispatch_sale.attempt_count",
    ),
  }));
}

export async function claimNfeEmailDispatchSale(
  client: SystemDbClient,
  input: ClaimNfeEmailDispatchSaleInput,
): Promise<ClaimNfeEmailDispatchSaleResult> {
  const normalizedAttemptStartedAt = normalizeDateTime3(input.attemptStartedAt);
  const runtimeScope = normalizeRuntimeScope(input.runtimeScope);
  const maxSendAttempts = normalizeMaxSendAttempts(
    input.maxSendAttempts,
    "Claim",
  );

  const result = await client.execute(
    `
      UPDATE nfe_email_dispatch_sale
      SET
        status = 'IN_PROGRESS',
        attempt_count = attempt_count + 1,
        first_attempt_at = COALESCE(first_attempt_at, ?),
        last_attempt_at = ?,
        last_error_message = NULL
      WHERE
        runtime_scope = ?
        AND
        id = ?
        AND (
          status = 'PENDING'
          OR (
            status = 'FAILED_TRANSIENT'
            AND attempt_count < ?
          )
        )
    `,
    [
      normalizedAttemptStartedAt,
      normalizedAttemptStartedAt,
      runtimeScope,
      input.saleId,
      maxSendAttempts,
    ],
  );

  const claimedSale = await findClaimedNfeEmailDispatchSaleByAttemptStartedAt(
    client,
    input.saleId,
    normalizedAttemptStartedAt,
    runtimeScope,
  );

  if (result.affectedRows === 1) {
    if (claimedSale === null) {
      throw new PermanentIntegrationError({
        code: "NFE_EMAIL_DISPATCH_CLAIM_RELOAD_FAILED",
        message:
          "Claimed NF-e email dispatch sale could not be reloaded after marking it IN_PROGRESS",
      });
    }

    return {
      status: "claimed",
      attemptCount: claimedSale.attemptCount,
    };
  }

  if (claimedSale !== null) {
    return {
      status: "already-claimed-by-this-attempt",
      attemptCount: claimedSale.attemptCount,
    };
  }

  return {
    status: "skipped",
  };
}

export async function claimManualNfeEmailDispatchSale(
  client: SystemDbClient,
  input: ClaimManualNfeEmailDispatchSaleInput,
): Promise<ClaimManualNfeEmailDispatchSaleResult> {
  const normalizedAttemptStartedAt = normalizeDateTime3(input.attemptStartedAt);
  const runtimeScope = normalizeRuntimeScope(input.runtimeScope);
  const normalizedSaleId = normalizePositiveInteger(input.saleId, "saleId");
  const result = await client.execute(
    `
      UPDATE nfe_email_dispatch_sale
      SET
        status = 'IN_PROGRESS',
        attempt_count = attempt_count + 1,
        first_attempt_at = COALESCE(first_attempt_at, ?),
        last_attempt_at = ?,
        last_error_message = NULL
      WHERE
        runtime_scope = ?
        AND id = ?
        AND status IN (
          'PENDING',
          'FAILED_TRANSIENT',
          'FAILED_FINAL',
          'DELIVERY_UNKNOWN'
        )
    `,
    [
      normalizedAttemptStartedAt,
      normalizedAttemptStartedAt,
      runtimeScope,
      normalizedSaleId,
    ],
  );

  const claimedSale = await findClaimedNfeEmailDispatchSaleByAttemptStartedAt(
    client,
    normalizedSaleId,
    normalizedAttemptStartedAt,
    runtimeScope,
  );

  if (result.affectedRows === 1) {
    if (claimedSale === null) {
      throw new PermanentIntegrationError({
        code: "NFE_EMAIL_DISPATCH_MANUAL_CLAIM_RELOAD_FAILED",
        message:
          "Claimed manual NF-e email dispatch sale could not be reloaded after marking it IN_PROGRESS",
      });
    }

    return {
      status: "claimed",
      attemptCount: claimedSale.attemptCount,
    };
  }

  if (claimedSale !== null) {
    return {
      status: "already-claimed-by-this-attempt",
      attemptCount: claimedSale.attemptCount,
    };
  }

  return {
    status: "skipped",
  };
}

export async function findClaimedNfeEmailDispatchSaleByAttemptStartedAt(
  client: SystemDbClient,
  saleId: number,
  attemptStartedAt: Date | string,
  runtimeScopeInput: string,
): Promise<NfeEmailDispatchEligibleSale | null> {
  const normalizedAttemptStartedAt = normalizeDateTime3(attemptStartedAt);
  const runtimeScope = normalizeRuntimeScope(runtimeScopeInput);
  const rows = await client.select<NfeEmailDispatchEligibleSaleRow>(
    `
      SELECT
        sale.id,
        sale.nfe_email_dispatch_customer_id,
        customer.erp_customer_id,
        customer.created_at AS customer_created_at,
        sale.erp_sale_id,
        sale.erp_invoice_key,
        sale.erp_invoice_emitted_at,
        sale.status,
        sale.attempt_count,
        sale.first_attempt_at,
        sale.last_attempt_at,
        sale.sent_at,
        sale.last_error_message,
        sale.created_at,
        sale.updated_at
      FROM nfe_email_dispatch_sale AS sale
      INNER JOIN nfe_email_dispatch_customer AS customer
        ON customer.id = sale.nfe_email_dispatch_customer_id
      WHERE
        sale.runtime_scope = ? AND
        sale.id = ? AND
        sale.status = 'IN_PROGRESS' AND
        sale.last_attempt_at = ?
      LIMIT 1
    `,
    [runtimeScope, saleId, normalizedAttemptStartedAt],
  );

  const [row] = rows;

  return row === undefined ? null : mapEligibleSaleRow(row);
}

export async function rollbackManualNfeEmailDispatchSaleClaim(
  client: SystemDbClient,
  input: RollbackManualNfeEmailDispatchSaleClaimInput,
): Promise<RollbackManualNfeEmailDispatchSaleClaimResult> {
  const runtimeScope = normalizeRuntimeScope(input.runtimeScope);
  const normalizedSaleId = normalizePositiveInteger(input.saleId, "saleId");
  const currentAttemptCount = normalizePositiveInteger(
    input.currentAttemptCount,
    "currentAttemptCount",
  );
  const currentAttemptStartedAt = normalizeDateTime3(input.currentAttemptStartedAt);
  const previousStatus = normalizeSaleStatus(input.previousStatus);
  const previousAttemptCount = normalizeNonNegativeInteger(
    input.previousAttemptCount,
    "previousAttemptCount",
  );
  const previousFirstAttemptAt = normalizeNullableDateTime3(
    input.previousFirstAttemptAt,
  );
  const previousLastAttemptAt = normalizeNullableDateTime3(
    input.previousLastAttemptAt,
  );
  const previousLastErrorMessage = normalizeNullableErrorMessage(
    input.previousLastErrorMessage,
  );
  const result = await client.execute(
    `
      UPDATE nfe_email_dispatch_sale
      SET
        status = ?,
        attempt_count = ?,
        first_attempt_at = ?,
        last_attempt_at = ?,
        last_error_message = ?
      WHERE
        runtime_scope = ?
        AND id = ?
        AND status = 'IN_PROGRESS'
        AND attempt_count = ?
        AND last_attempt_at = ?
    `,
    [
      previousStatus,
      previousAttemptCount,
      previousFirstAttemptAt,
      previousLastAttemptAt,
      previousLastErrorMessage,
      runtimeScope,
      normalizedSaleId,
      currentAttemptCount,
      currentAttemptStartedAt,
    ],
  );

  if (result.affectedRows === 1) {
    return {
      status: "restored",
    };
  }

  return {
    status: "noop",
    snapshot: await findNfeEmailDispatchSaleStatus(
      client,
      normalizedSaleId,
      runtimeScope,
    ),
  };
}

export async function finalizeNfeEmailDispatchSale(
  client: SystemDbClient,
  input: FinalizeNfeEmailDispatchSaleInput,
): Promise<FinalizeNfeEmailDispatchSaleResult> {
  const finalStatus = normalizeFinalStatus(input.finalStatus);
  const normalizedAttemptStartedAt = normalizeDateTime3(input.attemptStartedAt);
  const normalizedSentAt = normalizeOptionalSentAt(finalStatus, input.sentAt);
  const normalizedErrorMessage = normalizeOptionalErrorMessage(input.errorMessage);
  const runtimeScope = normalizeRuntimeScope(input.runtimeScope);

  const result = await client.execute(
    `
      UPDATE nfe_email_dispatch_sale
      SET
        status = ?,
        sent_at = ?,
        last_error_message = ?
      WHERE
        runtime_scope = ? AND
        id = ? AND
        status = 'IN_PROGRESS' AND
        last_attempt_at = ?
    `,
    [
      finalStatus,
      normalizedSentAt,
      normalizedErrorMessage,
      runtimeScope,
      input.saleId,
      normalizedAttemptStartedAt,
    ],
  );

  const snapshot = await findNfeEmailDispatchSaleStatus(
    client,
    input.saleId,
    runtimeScope,
  );

  if (result.affectedRows === 0) {
    return {
      status: "noop",
      snapshot,
    };
  }

  if (snapshot === null) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_FINALIZATION_RELOAD_FAILED",
      message:
        "Finalized NF-e email dispatch sale could not be reloaded after persisting its final status",
    });
  }

  return {
    status: "finalized",
    snapshot,
  };
}

export async function finalizeNfeEmailDispatchSaleDirect(
  client: SystemDbClient,
  input: FinalizeNfeEmailDispatchSaleDirectInput,
): Promise<FinalizeNfeEmailDispatchSaleDirectResult> {
  const normalizedSaleId = normalizePositiveInteger(input.saleId, "saleId");
  const expectedStatus = normalizeSaleStatus(input.expectedStatus);
  const expectedAttemptCount = normalizeNonNegativeInteger(
    input.expectedAttemptCount,
    "expectedAttemptCount",
  );
  const finalStatus = normalizeFinalStatus(input.finalStatus);
  const normalizedAttemptStartedAt = normalizeDateTime3(input.attemptStartedAt);
  const normalizedSentAt = normalizeOptionalSentAt(finalStatus, input.sentAt);
  const normalizedErrorMessage = normalizeOptionalErrorMessage(input.errorMessage);
  const runtimeScope = normalizeRuntimeScope(input.runtimeScope);

  const result = await client.execute(
    `
      UPDATE nfe_email_dispatch_sale
      SET
        attempt_count = attempt_count + 1,
        first_attempt_at = COALESCE(first_attempt_at, ?),
        last_attempt_at = ?,
        status = ?,
        sent_at = ?,
        last_error_message = ?
      WHERE
        runtime_scope = ? AND
        id = ? AND
        status = ? AND
        attempt_count = ?
    `,
    [
      normalizedAttemptStartedAt,
      normalizedAttemptStartedAt,
      finalStatus,
      normalizedSentAt,
      normalizedErrorMessage,
      runtimeScope,
      normalizedSaleId,
      expectedStatus,
      expectedAttemptCount,
    ],
  );

  const snapshot = await findNfeEmailDispatchSaleStatus(
    client,
    normalizedSaleId,
    runtimeScope,
  );

  if (result.affectedRows === 0) {
    if (snapshot === null) {
      return {
        status: "not-found",
      };
    }

    return {
      status: "conflict",
      snapshot,
    };
  }

  if (snapshot === null) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_DIRECT_FINALIZATION_RELOAD_FAILED",
      message:
        "Direct-finalized NF-e email dispatch sale could not be reloaded after persisting its final status",
    });
  }

  return {
    status: "finalized",
    snapshot,
  };
}

function normalizeNullableDateTime3(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }

  return normalizeDateTime3(value);
}

function normalizeNullableErrorMessage(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return normalizeOptionalErrorMessage(value);
}
