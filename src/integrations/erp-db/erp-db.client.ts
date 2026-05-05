import { createPool } from "mysql2/promise";
import type { Pool, PoolOptions } from "mysql2/promise";
import { PermanentIntegrationError, TransientIntegrationError } from "../../domain/shared/integration-error.types.js";
import { erpDbConfig } from "../../infra/config/erp-db.config.js";
import { erpDbQueries } from "./erp-db.queries.js";
import type {
  ErpDbClient,
  ErpDbConnectionConfig,
  ErpDbPingRow,
  ErpDbQueryParams,
  ErpDbRow,
} from "./erp-db.types.js";

const READ_ONLY_STATEMENT_PATTERN = /^SELECT\b/i;

const TRANSIENT_ERP_DB_ERROR_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
  "PROTOCOL_SEQUENCE_TIMEOUT",
  "PROTOCOL_CONNECTION_LOST",
]);

const PERMANENT_ERP_DB_ERROR_CODES = new Set([
  "ER_ACCESS_DENIED_ERROR",
  "ER_BAD_DB_ERROR",
  "ER_BAD_FIELD_ERROR",
  "ER_DBACCESS_DENIED_ERROR",
  "ER_NO_SUCH_TABLE",
  "ER_PARSE_ERROR",
]);

interface ErpDbDriverError {
  code?: string;
}

let sharedErpDbPool: Pool | null = null;
let sharedErpDbClient: ErpDbClient | null = null;

export function createErpDbClient(
  config: ErpDbConnectionConfig = erpDbConfig,
): ErpDbClient {
  return createErpDbClientFromPool(createPool(buildErpDbPoolOptions(config)));
}

export function getSharedErpDbClient(): ErpDbClient {
  if (sharedErpDbClient !== null) {
    return sharedErpDbClient;
  }

  sharedErpDbPool = createPool(buildErpDbPoolOptions(erpDbConfig));
  sharedErpDbClient = createErpDbClientFromPool(sharedErpDbPool, {
    allowClose: false,
  });

  return sharedErpDbClient;
}

export async function closeSharedErpDbClient(): Promise<void> {
  if (sharedErpDbPool === null) {
    return;
  }

  const pool = sharedErpDbPool;

  sharedErpDbPool = null;
  sharedErpDbClient = null;

  await pool.end();
}

function buildErpDbPoolOptions(config: ErpDbConnectionConfig): PoolOptions {
  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    connectionLimit: config.connectionLimit,
    connectTimeout: config.connectTimeoutMs,
    waitForConnections: true,
    queueLimit: 0,
    enableKeepAlive: true,
  };
}

function createErpDbClientFromPool(
  pool: Pool,
  options: {
    allowClose?: boolean;
  } = {},
): ErpDbClient {
  const shouldClosePool = options.allowClose ?? true;

  return {
    async ping(): Promise<void> {
      await this.select<ErpDbPingRow>(erpDbQueries.pingConnection);
    },

    async select<TRow extends ErpDbRow = ErpDbRow>(
      statement: string,
      params: ErpDbQueryParams = [],
    ): Promise<TRow[]> {
      ensureReadOnlyStatement(statement);

      try {
        const [rows] = await pool.execute(statement, [...params]);

        if (!Array.isArray(rows)) {
          throw new PermanentIntegrationError({
            code: "ERP_DB_UNEXPECTED_RESULT",
            message: "ERP database returned an unexpected result for a read-only query",
          });
        }

        return rows as TRow[];
      } catch (error) {
        throw normalizeErpDbError(error);
      }
    },

    async close(): Promise<void> {
      if (!shouldClosePool) {
        return;
      }

      await pool.end();
    },
  };
}

function ensureReadOnlyStatement(statement: string): void {
  if (READ_ONLY_STATEMENT_PATTERN.test(statement.trim())) {
    return;
  }

  throw new PermanentIntegrationError({
    code: "ERP_DB_READ_ONLY_QUERY_REQUIRED",
    message: "ERP database client accepts only read-only SELECT statements",
  });
}

function normalizeErpDbError(error: unknown): Error {
  if (
    error instanceof PermanentIntegrationError ||
    error instanceof TransientIntegrationError
  ) {
    return error;
  }

  const code = readDriverErrorCode(error);

  if (code !== null && TRANSIENT_ERP_DB_ERROR_CODES.has(code)) {
    return new TransientIntegrationError({
      code: "ERP_DB_UNAVAILABLE",
      message: "ERP database is temporarily unavailable",
      cause: error,
    });
  }

  if (code === "ER_ACCESS_DENIED_ERROR") {
    return new PermanentIntegrationError({
      code: "ERP_DB_ACCESS_DENIED",
      message: "ERP database credentials were rejected",
      cause: error,
    });
  }

  if (code === "ER_BAD_DB_ERROR") {
    return new PermanentIntegrationError({
      code: "ERP_DB_DATABASE_NOT_FOUND",
      message: "ERP database name is invalid",
      cause: error,
    });
  }

  if (code !== null && PERMANENT_ERP_DB_ERROR_CODES.has(code)) {
    return new PermanentIntegrationError({
      code: "ERP_DB_INVALID_QUERY",
      message: "ERP database query is invalid",
      cause: error,
    });
  }

  return new TransientIntegrationError({
    code: "ERP_DB_QUERY_FAILED",
    message: "ERP database query failed with an unknown transient condition",
    cause: error,
  });
}

function readDriverErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const maybeDriverError = error as ErpDbDriverError;

  return typeof maybeDriverError.code === "string" ? maybeDriverError.code : null;
}
