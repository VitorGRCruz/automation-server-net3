import { PermanentIntegrationError } from "../../../domain/shared/integration-error.types.js";
import type { SystemDbClient, SystemDbQueryValue } from "../system-db.types.js";
import type { CountRow } from "./row-types.js";

export function buildWhereClause(clauses: readonly string[]): string {
  if (clauses.length === 0) {
    return "";
  }

  return `WHERE ${clauses.join("\n        AND ")}`;
}

export async function selectCount(
  client: SystemDbClient,
  statement: string,
  params: readonly SystemDbQueryValue[],
): Promise<number> {
  const rows = await client.select<CountRow>(statement, params);
  const [row] = rows;

  if (row === undefined) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_COUNT_RELOAD_FAILED",
      message: "NF-e email dispatch count query returned no row",
    });
  }

  return readRowNumber(row.total, "nfe_email_dispatch_count.total");
}

export function readRowNumber(value: number | string, columnName: string): number {
  const parsedValue =
    typeof value === "number" ? value : Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsedValue)) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_ROW_VALUE",
      message: `Expected a safe integer in ${columnName}`,
    });
  }

  return parsedValue;
}
