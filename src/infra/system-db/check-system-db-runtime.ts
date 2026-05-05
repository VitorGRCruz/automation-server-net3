import { isIntegrationError } from "../../domain/shared/integration-error.types.js";
import { systemDbConfig } from "../config/system-db.config.js";
import { withSystemDbClient } from "./system-db.client.js";

interface RuntimeCheckRow extends Record<string, unknown> {
  database_name: string | null;
  checked_at: string;
}

interface IdempotencyTotalsRow extends Record<string, unknown> {
  total_records: number | string | null;
  pending_records: number | string | null;
  completed_records: number | string | null;
  failed_records: number | string | null;
}

async function run(): Promise<void> {
  const result = await withSystemDbClient(async (client) => {
    const runtimeRows = await client.select<RuntimeCheckRow>(
      "SELECT DATABASE() AS database_name, UTC_TIMESTAMP() AS checked_at",
    );
    const totalsRows = await client.select<IdempotencyTotalsRow>(
      `
        SELECT
          COUNT(*) AS total_records,
          SUM(CASE WHEN execution_status = 'pending' THEN 1 ELSE 0 END) AS pending_records,
          SUM(CASE WHEN execution_status = 'completed' THEN 1 ELSE 0 END) AS completed_records,
          SUM(CASE WHEN execution_status = 'failed' THEN 1 ELSE 0 END) AS failed_records
        FROM workflow_step_idempotency
      `,
    );

    const runtimeRow = runtimeRows[0];
    const totalsRow = totalsRows[0];

    return {
      host: systemDbConfig.host,
      port: systemDbConfig.port,
      database: runtimeRow?.database_name ?? systemDbConfig.database,
      checkedAt: runtimeRow?.checked_at ?? new Date().toISOString(),
      idempotencyTable: {
        name: "workflow_step_idempotency",
        totalRecords: normalizeCount(totalsRow?.total_records),
        pendingRecords: normalizeCount(totalsRow?.pending_records),
        completedRecords: normalizeCount(totalsRow?.completed_records),
        failedRecords: normalizeCount(totalsRow?.failed_records),
      },
    };
  });

  console.log(JSON.stringify(result, null, 2));
}

function normalizeCount(value: number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  const normalizedValue = Number(value);

  return Number.isFinite(normalizedValue) ? normalizedValue : 0;
}

run().catch((error) => {
  if (isIntegrationError(error)) {
    console.error(
      JSON.stringify(
        {
          kind: error.kind,
          code: error.code,
          message: error.message,
          host: systemDbConfig.host,
          port: systemDbConfig.port,
          database: systemDbConfig.database,
        },
        null,
        2,
      ),
    );
  } else {
    console.error(error);
  }

  process.exit(1);
});
