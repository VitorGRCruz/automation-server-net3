import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { systemDbConfig } from "../config/system-db.config.js";
import { withSystemDbClient } from "./system-db.client.js";
import type { SystemDbClient } from "./system-db.types.js";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectoryPath = path.dirname(currentFilePath);
const migrationFiles = [
  path.join(currentDirectoryPath, "migrations", "001_create_workflow_step_idempotency.sql"),
  path.join(
    currentDirectoryPath,
    "migrations",
    "002_add_workflow_step_idempotency_pending_lease.sql",
  ),
  path.join(
    currentDirectoryPath,
    "migrations",
    "003_create_nfe_email_dispatch_tables.sql",
  ),
  path.join(
    currentDirectoryPath,
    "migrations",
    "004_add_nfe_runtime_scope.sql",
  ),
  path.join(
    currentDirectoryPath,
    "migrations",
    "005_add_nfe_first_attempt_at.sql",
  ),
] as const;

const WORKFLOW_STEP_IDEMPOTENCY_PENDING_LEASE_COLUMNS = [
  "lease_token",
  "attempt_count",
  "last_attempted_at",
  "pending_expires_at",
] as const;

interface ExistingColumnRow extends Record<string, unknown> {
  column_name: string;
}

interface ExistingColumnDefinitionRow extends Record<string, unknown> {
  data_type: string;
  character_maximum_length: number | null;
}

interface ExistingIndexRow extends Record<string, unknown> {
  index_name: string;
}

export interface SystemDbMigrationSummary {
  host: string;
  port: number;
  database: string;
  appliedMigrations: string[];
  skippedMigrations: string[];
}

export async function runSystemDbMigrations(): Promise<SystemDbMigrationSummary> {
  const appliedMigrations: string[] = [];
  const skippedMigrations: string[] = [];

  await withSystemDbClient(async (client) => {
    for (const migrationFile of migrationFiles) {
      const migrationName = path.basename(migrationFile);

      if (migrationName === "002_add_workflow_step_idempotency_pending_lease.sql") {
        const applied = await ensureWorkflowStepIdempotencyPendingLeaseColumns(client);

        if (applied) {
          appliedMigrations.push(migrationName);
        } else {
          skippedMigrations.push(migrationName);
        }

        continue;
      }

      if (migrationName === "001_create_workflow_step_idempotency.sql") {
        const applied = await ensureWorkflowStepIdempotencyKeyLength(client);

        if (applied) {
          appliedMigrations.push(migrationName);
        } else {
          skippedMigrations.push(migrationName);
        }

        const script = (await readFile(migrationFile, "utf8")).trim();

        if (script.length === 0) {
          continue;
        }

        for (const sqlStatement of splitSqlStatements(script)) {
          await client.execute(sqlStatement);
        }

        continue;
      }

      if (migrationName === "004_add_nfe_runtime_scope.sql") {
        const applied = await ensureNfeEmailDispatchRuntimeScope(client);

        if (applied) {
          appliedMigrations.push(migrationName);
        } else {
          skippedMigrations.push(migrationName);
        }

        continue;
      }

      if (migrationName === "005_add_nfe_first_attempt_at.sql") {
        const applied = await ensureNfeEmailDispatchFirstAttemptAt(client);

        if (applied) {
          appliedMigrations.push(migrationName);
        } else {
          skippedMigrations.push(migrationName);
        }

        continue;
      }

      const script = (await readFile(migrationFile, "utf8")).trim();

      if (script.length === 0) {
        continue;
      }

      for (const sqlStatement of splitSqlStatements(script)) {
        await client.execute(sqlStatement);
      }

      appliedMigrations.push(migrationName);
    }
  });

  return {
    host: systemDbConfig.host,
    port: systemDbConfig.port,
    database: systemDbConfig.database,
    appliedMigrations,
    skippedMigrations,
  };
}

async function ensureWorkflowStepIdempotencyPendingLeaseColumns(
  client: SystemDbClient,
): Promise<boolean> {
  const existingColumns = await client.select<ExistingColumnRow>(
    `
      SELECT COLUMN_NAME AS column_name
      FROM information_schema.columns
      WHERE
        table_schema = DATABASE() AND
        table_name = 'workflow_step_idempotency' AND
        column_name IN (?, ?, ?, ?)
    `,
    [...WORKFLOW_STEP_IDEMPOTENCY_PENDING_LEASE_COLUMNS],
  );

  const existingColumnNames = new Set(existingColumns.map((row) => row.column_name));
  const missingColumnClauses: string[] = [];

  if (!existingColumnNames.has("lease_token")) {
    missingColumnClauses.push("ADD COLUMN lease_token CHAR(36) NULL AFTER execution_status");
  }

  if (!existingColumnNames.has("attempt_count")) {
    missingColumnClauses.push(
      "ADD COLUMN attempt_count INT UNSIGNED NOT NULL DEFAULT 1 AFTER lease_token",
    );
  }

  if (!existingColumnNames.has("last_attempted_at")) {
    missingColumnClauses.push("ADD COLUMN last_attempted_at DATETIME NULL AFTER attempt_count");
  }

  if (!existingColumnNames.has("pending_expires_at")) {
    missingColumnClauses.push(
      "ADD COLUMN pending_expires_at DATETIME NULL AFTER last_attempted_at",
    );
  }

  if (missingColumnClauses.length === 0) {
    return false;
  }

  await client.execute(
    `
      ALTER TABLE workflow_step_idempotency
      ${missingColumnClauses.join(",\n      ")}
    `,
  );

  return true;
}

async function ensureWorkflowStepIdempotencyKeyLength(
  client: SystemDbClient,
): Promise<boolean> {
  const existingColumns = await client.select<ExistingColumnDefinitionRow>(
    `
      SELECT
        DATA_TYPE AS data_type,
        CHARACTER_MAXIMUM_LENGTH AS character_maximum_length
      FROM information_schema.columns
      WHERE
        table_schema = DATABASE() AND
        table_name = 'workflow_step_idempotency' AND
        column_name = 'idempotency_key'
    `,
  );

  const [column] = existingColumns;

  if (column === undefined) {
    return false;
  }

  const dataType = String(column.data_type).toLowerCase();
  const maximumLength =
    column.character_maximum_length === null
      ? null
      : Number(column.character_maximum_length);

  if (dataType === "varchar" && maximumLength !== null && maximumLength >= 255) {
    return false;
  }

  await client.execute(
    `
      ALTER TABLE workflow_step_idempotency
      MODIFY COLUMN idempotency_key VARCHAR(255) NOT NULL
    `,
  );

  return true;
}

async function ensureNfeEmailDispatchRuntimeScope(
  client: SystemDbClient,
): Promise<boolean> {
  const existingColumns = await client.select<ExistingColumnRow>(
    `
      SELECT COLUMN_NAME AS column_name
      FROM information_schema.columns
      WHERE
        table_schema = DATABASE() AND
        table_name = 'nfe_email_dispatch_sale' AND
        column_name = 'runtime_scope'
    `,
  );
  const existingIndexes = await client.select<ExistingIndexRow>(
    `
      SELECT DISTINCT INDEX_NAME AS index_name
      FROM information_schema.statistics
      WHERE
        table_schema = DATABASE() AND
        table_name = 'nfe_email_dispatch_sale' AND
        index_name IN (
          'uk_nfe_email_dispatch_sale__customer_sale',
          'uk_nfe_email_dispatch_sale__scope_customer_sale',
          'idx_nfe_email_dispatch_sale__scope_status'
        )
    `,
  );

  const existingColumnNames = new Set(existingColumns.map((row) => row.column_name));
  const existingIndexNames = new Set(existingIndexes.map((row) => row.index_name));
  const alterationClauses: string[] = [];

  if (!existingColumnNames.has("runtime_scope")) {
    alterationClauses.push(
      "ADD COLUMN runtime_scope VARCHAR(120) NOT NULL DEFAULT 'production' AFTER nfe_email_dispatch_customer_id",
    );
  }

  if (existingIndexNames.has("uk_nfe_email_dispatch_sale__customer_sale")) {
    alterationClauses.push("DROP INDEX uk_nfe_email_dispatch_sale__customer_sale");
  }

  if (!existingIndexNames.has("uk_nfe_email_dispatch_sale__scope_customer_sale")) {
    alterationClauses.push(
      "ADD UNIQUE KEY uk_nfe_email_dispatch_sale__scope_customer_sale (runtime_scope, nfe_email_dispatch_customer_id, erp_sale_id)",
    );
  }

  if (!existingIndexNames.has("idx_nfe_email_dispatch_sale__scope_status")) {
    alterationClauses.push(
      "ADD KEY idx_nfe_email_dispatch_sale__scope_status (runtime_scope, status)",
    );
  }

  if (alterationClauses.length === 0) {
    return false;
  }

  await client.execute(
    `
      ALTER TABLE nfe_email_dispatch_sale
      ${alterationClauses.join(",\n      ")}
    `,
  );

  return true;
}

async function ensureNfeEmailDispatchFirstAttemptAt(
  client: SystemDbClient,
): Promise<boolean> {
  const existingColumns = await client.select<ExistingColumnRow>(
    `
      SELECT COLUMN_NAME AS column_name
      FROM information_schema.columns
      WHERE
        table_schema = DATABASE() AND
        table_name = 'nfe_email_dispatch_sale' AND
        column_name = 'first_attempt_at'
    `,
  );

  if (existingColumns.length > 0) {
    return false;
  }

  await client.execute(
    `
      ALTER TABLE nfe_email_dispatch_sale
      ADD COLUMN first_attempt_at DATETIME(3) NULL AFTER attempt_count
    `,
  );

  return true;
}

function splitSqlStatements(script: string): string[] {
  return script
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function run(): Promise<void> {
  const summary = await runSystemDbMigrations();
  console.log(JSON.stringify(summary, null, 2));
}

const entrypointPath = process.argv[1];
const isDirectExecution =
  typeof entrypointPath === "string" &&
  pathToFileURL(path.resolve(entrypointPath)).href === import.meta.url;

if (isDirectExecution) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
