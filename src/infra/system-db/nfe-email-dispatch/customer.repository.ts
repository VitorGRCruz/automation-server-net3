import type { NfeEmailDispatchCustomer } from "../../../domain/nfe/nfe-email-dispatch.types.js";
import { PermanentIntegrationError } from "../../../domain/shared/integration-error.types.js";
import type { SystemDbClient, SystemDbQueryValue } from "../system-db.types.js";
import {
  type DeleteNfeEmailDispatchCustomerInput,
  type DeleteNfeEmailDispatchCustomerResult,
  type SearchNfeEmailDispatchCustomersInput,
  type SearchNfeEmailDispatchCustomersResult,
  type UpsertNfeEmailDispatchCustomerInput,
  type UpsertNfeEmailDispatchCustomerResult,
} from "./contracts.js";
import { buildRegionalCurrentDateTime3 } from "./date-time.js";
import { mapCustomerRow } from "./mappers.js";
import { normalizePaginationLimit, normalizePaginationOffset } from "./pagination.js";
import type { NfeEmailDispatchCustomerRow } from "./row-types.js";
import { buildWhereClause, readRowNumber, selectCount } from "./sql.js";
import {
  normalizePositiveInteger,
  normalizePositiveIntegerList,
} from "./validation.js";
import { normalizeDateTime3 } from "./date-time.js";

export async function loadNfeEmailDispatchCustomers(
  client: SystemDbClient,
): Promise<NfeEmailDispatchCustomer[]> {
  const rows = await client.select<NfeEmailDispatchCustomerRow>(
    `
      SELECT
        id,
        erp_customer_id,
        created_at
      FROM nfe_email_dispatch_customer
      ORDER BY id ASC
    `,
  );

  return rows.map((row) => mapCustomerRow(row));
}

export async function upsertNfeEmailDispatchCustomer(
  client: SystemDbClient,
  input: UpsertNfeEmailDispatchCustomerInput,
): Promise<UpsertNfeEmailDispatchCustomerResult> {
  const erpCustomerId = normalizePositiveInteger(
    input.erpCustomerId,
    "erpCustomerId",
  );
  const createdAt = buildRegionalCurrentDateTime3();
  const result = await client.execute(
    `
      INSERT INTO nfe_email_dispatch_customer (
        erp_customer_id,
        created_at
      ) VALUES (?, ?)
      ON DUPLICATE KEY UPDATE
        id = LAST_INSERT_ID(id)
    `,
    [erpCustomerId, createdAt],
  );
  const customerId = readRowNumber(
    result.insertId,
    "nfe_email_dispatch_customer.insert_id",
  );
  const customer = await findNfeEmailDispatchCustomerById(client, customerId);

  if (customer === null) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_CUSTOMER_UPSERT_RELOAD_FAILED",
      message:
        "NF-e email dispatch customer could not be reloaded after the idempotent upsert",
    });
  }

  return {
    customer,
    created: result.affectedRows === 1,
  };
}

export async function searchNfeEmailDispatchCustomers(
  client: SystemDbClient,
  input: SearchNfeEmailDispatchCustomersInput,
): Promise<SearchNfeEmailDispatchCustomersResult> {
  const clauses: string[] = [];
  const params: SystemDbQueryValue[] = [];

  if (input.id !== undefined) {
    clauses.push("id = ?");
    params.push(normalizePositiveInteger(input.id, "id"));
  }

  if (input.erpCustomerId !== undefined) {
    clauses.push("erp_customer_id = ?");
    params.push(
      normalizePositiveInteger(input.erpCustomerId, "erpCustomerId"),
    );
  }

  if (input.erpCustomerIds !== undefined && input.erpCustomerIds.length > 0) {
    const erpCustomerIds = normalizePositiveIntegerList(
      input.erpCustomerIds,
      "erpCustomerIds",
    );

    clauses.push(`erp_customer_id IN (${erpCustomerIds.map(() => "?").join(", ")})`);
    params.push(...erpCustomerIds);
  }

  if (input.createdFrom !== undefined) {
    clauses.push("created_at >= ?");
    params.push(normalizeDateTime3(input.createdFrom));
  }

  if (input.createdTo !== undefined) {
    clauses.push("created_at <= ?");
    params.push(normalizeDateTime3(input.createdTo));
  }

  const limit = normalizePaginationLimit(input.limit);
  const offset = normalizePaginationOffset(input.offset);
  const whereClause = buildWhereClause(clauses);
  const total = await selectCount(
    client,
    `
      SELECT COUNT(*) AS total
      FROM nfe_email_dispatch_customer
      ${whereClause}
    `,
    params,
  );
  const rows = await client.select<NfeEmailDispatchCustomerRow>(
    `
      SELECT
        id,
        erp_customer_id,
        created_at
      FROM nfe_email_dispatch_customer
      ${whereClause}
      ORDER BY
        created_at DESC,
        id DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `,
    params,
  );

  return {
    items: rows.map((row) => mapCustomerRow(row)),
    total,
  };
}

export async function deleteNfeEmailDispatchCustomer(
  client: SystemDbClient,
  input: DeleteNfeEmailDispatchCustomerInput,
): Promise<DeleteNfeEmailDispatchCustomerResult> {
  const customer = await findNfeEmailDispatchCustomer(client, input);

  if (customer === null) {
    return {
      status: "not-found",
    };
  }

  const result = await client.execute(
    `
      DELETE FROM nfe_email_dispatch_customer
      WHERE id = ?
      LIMIT 1
    `,
    [customer.id],
  );

  if (result.affectedRows === 0) {
    return {
      status: "not-found",
    };
  }

  return {
    status: "deleted",
    customer,
  };
}

async function findNfeEmailDispatchCustomerById(
  client: SystemDbClient,
  customerId: number,
): Promise<NfeEmailDispatchCustomer | null> {
  const rows = await client.select<NfeEmailDispatchCustomerRow>(
    `
      SELECT
        id,
        erp_customer_id,
        created_at
      FROM nfe_email_dispatch_customer
      WHERE id = ?
      LIMIT 1
    `,
    [customerId],
  );
  const [row] = rows;

  return row === undefined ? null : mapCustomerRow(row);
}

async function findNfeEmailDispatchCustomer(
  client: SystemDbClient,
  input: DeleteNfeEmailDispatchCustomerInput,
): Promise<NfeEmailDispatchCustomer | null> {
  if (input.id !== undefined) {
    return findNfeEmailDispatchCustomerById(
      client,
      normalizePositiveInteger(input.id, "id"),
    );
  }

  if (input.erpCustomerId !== undefined) {
    const rows = await client.select<NfeEmailDispatchCustomerRow>(
      `
        SELECT
          id,
          erp_customer_id,
          created_at
        FROM nfe_email_dispatch_customer
        WHERE erp_customer_id = ?
        LIMIT 1
      `,
      [normalizePositiveInteger(input.erpCustomerId, "erpCustomerId")],
    );
    const [row] = rows;

    return row === undefined ? null : mapCustomerRow(row);
  }

  throw new PermanentIntegrationError({
    code: "NFE_EMAIL_DISPATCH_CUSTOMER_DELETE_FILTER_REQUIRED",
    message: "NF-e email dispatch customer deletion requires id or erpCustomerId",
  });
}
