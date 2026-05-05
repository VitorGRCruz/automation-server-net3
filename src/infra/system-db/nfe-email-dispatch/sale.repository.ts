import {
  NFE_EMAIL_DISPATCH_SALE_STATUSES,
  type NfeEmailDispatchSaleManualProcessingSnapshot,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import type { SystemDbClient, SystemDbQueryValue } from "../system-db.types.js";
import {
  type CountNfeEmailDispatchSalesByStatusInput,
  type CountNfeEmailDispatchSalesByStatusResult,
  type InsertNfeEmailDispatchSalesIdempotentlyInput,
  type InsertNfeEmailDispatchSalesIdempotentlyResult,
  type NfeEmailDispatchSaleStatusSnapshot,
  type SearchNfeEmailDispatchSalesInput,
  type SearchNfeEmailDispatchSalesResult,
} from "./contracts.js";
import { buildRegionalCurrentDateTime3, normalizeDateTime3 } from "./date-time.js";
import { mapSaleManualProcessingRow, mapSaleRecordRow, mapSaleStatusRow } from "./mappers.js";
import { normalizePaginationLimit, normalizePaginationOffset } from "./pagination.js";
import {
  type NfeEmailDispatchSaleManualProcessingRow,
  type NfeEmailDispatchSaleRecordRow,
  type NfeEmailDispatchSaleStatusCountRow,
  type NfeEmailDispatchSaleStatusRow,
} from "./row-types.js";
import { buildWhereClause, readRowNumber, selectCount } from "./sql.js";
import {
  normalizeInvoiceKeyFilter,
  normalizePositiveInteger,
  normalizeRuntimeScope,
  normalizeSaleStatus,
} from "./validation.js";

export async function searchNfeEmailDispatchSales(
  client: SystemDbClient,
  input: SearchNfeEmailDispatchSalesInput,
): Promise<SearchNfeEmailDispatchSalesResult> {
  const clauses: string[] = [];
  const params: SystemDbQueryValue[] = [];

  if (input.runtimeScope !== undefined) {
    clauses.push("sale.runtime_scope = ?");
    params.push(normalizeRuntimeScope(input.runtimeScope));
  }

  if (input.id !== undefined) {
    clauses.push("sale.id = ?");
    params.push(normalizePositiveInteger(input.id, "id"));
  }

  if (input.nfeEmailDispatchCustomerId !== undefined) {
    clauses.push("sale.nfe_email_dispatch_customer_id = ?");
    params.push(
      normalizePositiveInteger(
        input.nfeEmailDispatchCustomerId,
        "nfeEmailDispatchCustomerId",
      ),
    );
  }

  if (input.erpCustomerId !== undefined) {
    clauses.push("customer.erp_customer_id = ?");
    params.push(
      normalizePositiveInteger(input.erpCustomerId, "erpCustomerId"),
    );
  }

  if (input.erpSaleId !== undefined) {
    clauses.push("sale.erp_sale_id = ?");
    params.push(normalizePositiveInteger(input.erpSaleId, "erpSaleId"));
  }

  if (input.erpInvoiceKey !== undefined) {
    clauses.push("sale.erp_invoice_key = ?");
    params.push(normalizeInvoiceKeyFilter(input.erpInvoiceKey));
  }

  if (input.statuses !== undefined && input.statuses.length > 0) {
    clauses.push(
      `sale.status IN (${input.statuses.map(() => "?").join(", ")})`,
    );
    params.push(...input.statuses.map((status) => normalizeSaleStatus(status)));
  }

  if (input.invoiceEmittedFrom !== undefined) {
    clauses.push("sale.erp_invoice_emitted_at >= ?");
    params.push(normalizeDateTime3(input.invoiceEmittedFrom));
  }

  if (input.invoiceEmittedTo !== undefined) {
    clauses.push("sale.erp_invoice_emitted_at <= ?");
    params.push(normalizeDateTime3(input.invoiceEmittedTo));
  }

  if (input.lastAttemptFrom !== undefined) {
    clauses.push("sale.last_attempt_at >= ?");
    params.push(normalizeDateTime3(input.lastAttemptFrom));
  }

  if (input.lastAttemptTo !== undefined) {
    clauses.push("sale.last_attempt_at <= ?");
    params.push(normalizeDateTime3(input.lastAttemptTo));
  }

  if (input.sentFrom !== undefined) {
    clauses.push("sale.sent_at >= ?");
    params.push(normalizeDateTime3(input.sentFrom));
  }

  if (input.sentTo !== undefined) {
    clauses.push("sale.sent_at <= ?");
    params.push(normalizeDateTime3(input.sentTo));
  }

  if (input.createdFrom !== undefined) {
    clauses.push("sale.created_at >= ?");
    params.push(normalizeDateTime3(input.createdFrom));
  }

  if (input.createdTo !== undefined) {
    clauses.push("sale.created_at <= ?");
    params.push(normalizeDateTime3(input.createdTo));
  }

  const limit = normalizePaginationLimit(input.limit);
  const offset = normalizePaginationOffset(input.offset);
  const whereClause = buildWhereClause(clauses);
  const total = await selectCount(
    client,
    `
      SELECT COUNT(*) AS total
      FROM nfe_email_dispatch_sale AS sale
      INNER JOIN nfe_email_dispatch_customer AS customer
        ON customer.id = sale.nfe_email_dispatch_customer_id
      ${whereClause}
    `,
    params,
  );
  const rows = await client.select<NfeEmailDispatchSaleRecordRow>(
    `
      SELECT
        sale.id,
        sale.nfe_email_dispatch_customer_id,
        sale.runtime_scope,
        customer.erp_customer_id,
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
      ${whereClause}
      ORDER BY
        sale.erp_invoice_emitted_at DESC,
        sale.id DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `,
    params,
  );

  return {
    items: rows.map((row) => mapSaleRecordRow(row)),
    total,
  };
}

export async function countNfeEmailDispatchSalesByStatus(
  client: SystemDbClient,
  input: CountNfeEmailDispatchSalesByStatusInput,
): Promise<CountNfeEmailDispatchSalesByStatusResult> {
  const clauses: string[] = [];
  const params: SystemDbQueryValue[] = [];

  if (input.runtimeScope !== undefined) {
    clauses.push("runtime_scope = ?");
    params.push(normalizeRuntimeScope(input.runtimeScope));
  }

  if (input.lastAttemptFrom !== undefined) {
    clauses.push("last_attempt_at >= ?");
    params.push(normalizeDateTime3(input.lastAttemptFrom));
  }

  if (input.lastAttemptTo !== undefined) {
    clauses.push("last_attempt_at <= ?");
    params.push(normalizeDateTime3(input.lastAttemptTo));
  }

  if (input.sentFrom !== undefined) {
    clauses.push("sent_at >= ?");
    params.push(normalizeDateTime3(input.sentFrom));
  }

  if (input.sentTo !== undefined) {
    clauses.push("sent_at <= ?");
    params.push(normalizeDateTime3(input.sentTo));
  }

  if (input.createdFrom !== undefined) {
    clauses.push("created_at >= ?");
    params.push(normalizeDateTime3(input.createdFrom));
  }

  if (input.createdTo !== undefined) {
    clauses.push("created_at <= ?");
    params.push(normalizeDateTime3(input.createdTo));
  }

  const whereClause = buildWhereClause(clauses);
  const rows = await client.select<NfeEmailDispatchSaleStatusCountRow>(
    `
      SELECT
        status,
        COUNT(*) AS total
      FROM nfe_email_dispatch_sale
      ${whereClause}
      GROUP BY status
    `,
    params,
  );

  const countsByStatus = new Map<string, number>();

  for (const row of rows) {
    countsByStatus.set(
      normalizeSaleStatus(row.status),
      readRowNumber(row.total, "nfe_email_dispatch_sale_status_count.total"),
    );
  }

  const items = NFE_EMAIL_DISPATCH_SALE_STATUSES.map((status) => ({
    status,
    count: countsByStatus.get(status) ?? 0,
  }));

  return {
    items,
    total: items.reduce((sum, item) => sum + item.count, 0),
  };
}

export async function insertNfeEmailDispatchSalesIdempotently(
  client: SystemDbClient,
  input: InsertNfeEmailDispatchSalesIdempotentlyInput,
): Promise<InsertNfeEmailDispatchSalesIdempotentlyResult> {
  if (input.sales.length === 0) {
    return {
      receivedSales: 0,
      insertedSales: 0,
      ignoredSales: 0,
    };
  }

  const runtimeScope = normalizeRuntimeScope(input.runtimeScope);
  const currentDateTime = buildRegionalCurrentDateTime3();
  const params = input.sales.flatMap((sale) => [
    runtimeScope,
    sale.automationCustomerId,
    sale.erpSaleId,
    sale.erpInvoiceKey,
    sale.erpInvoiceEmittedAt,
    currentDateTime,
    currentDateTime,
  ]);

  const result = await client.execute(
    `
      INSERT INTO nfe_email_dispatch_sale (
        runtime_scope,
        nfe_email_dispatch_customer_id,
        erp_sale_id,
        erp_invoice_key,
        erp_invoice_emitted_at,
        status,
        created_at,
        updated_at
      ) VALUES ${input.sales
        .map(() => "(?, ?, ?, ?, ?, 'PENDING', ?, ?)")
        .join(", ")}
      ON DUPLICATE KEY UPDATE
        id = id
    `,
    params,
  );

  return {
    receivedSales: input.sales.length,
    insertedSales: result.affectedRows,
    ignoredSales: input.sales.length - result.affectedRows,
  };
}

export async function findNfeEmailDispatchSaleForManualProcessing(
  client: SystemDbClient,
  saleId: number,
  runtimeScopeInput: string,
): Promise<NfeEmailDispatchSaleManualProcessingSnapshot | null> {
  const runtimeScope = normalizeRuntimeScope(runtimeScopeInput);
  const normalizedSaleId = normalizePositiveInteger(saleId, "saleId");
  const rows = await client.select<NfeEmailDispatchSaleManualProcessingRow>(
    `
      SELECT
        id,
        erp_sale_id,
        status,
        attempt_count,
        first_attempt_at,
        last_attempt_at,
        sent_at,
        last_error_message,
        updated_at
      FROM nfe_email_dispatch_sale
      WHERE runtime_scope = ? AND id = ?
      LIMIT 1
    `,
    [runtimeScope, normalizedSaleId],
  );

  const [row] = rows;

  return row === undefined ? null : mapSaleManualProcessingRow(row);
}

export async function findNfeEmailDispatchSaleStatus(
  client: SystemDbClient,
  saleId: number,
  runtimeScopeInput: string,
): Promise<NfeEmailDispatchSaleStatusSnapshot | null> {
  const runtimeScope = normalizeRuntimeScope(runtimeScopeInput);
  const rows = await client.select<NfeEmailDispatchSaleStatusRow>(
    `
      SELECT
        id,
        status,
        attempt_count,
        last_attempt_at,
        sent_at,
        last_error_message,
        updated_at
      FROM nfe_email_dispatch_sale
      WHERE runtime_scope = ? AND id = ?
      LIMIT 1
    `,
    [runtimeScope, saleId],
  );

  if (rows.length === 0) {
    return null;
  }

  const [row] = rows;

  if (row === undefined) {
    return null;
  }

  return mapSaleStatusRow(row);
}
