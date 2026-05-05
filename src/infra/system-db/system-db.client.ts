import { createPool } from "mysql2/promise";
import type { ResultSetHeader } from "mysql2/promise";
import type { Pool, PoolOptions } from "mysql2/promise";
import {
  PermanentIntegrationError,
  TransientIntegrationError,
  isIntegrationError,
} from "../../domain/shared/integration-error.types.js";
import { systemDbConfig } from "../config/system-db.config.js";
import type {
  SystemDbClient,
  SystemDbConnectionConfig,
  SystemDbQueryParams,
  SystemDbRow,
} from "./system-db.types.js";

const TRANSIENT_SYSTEM_DB_ERROR_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
  "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_SEQUENCE_TIMEOUT",
  "ER_LOCK_DEADLOCK",
  "ER_LOCK_WAIT_TIMEOUT",
]);

const PERMANENT_SYSTEM_DB_ERROR_CODES = new Set([
  "ER_ACCESS_DENIED_ERROR",
  "ER_BAD_DB_ERROR",
  "ER_BAD_FIELD_ERROR",
  "ER_DBACCESS_DENIED_ERROR",
  "ER_DUP_FIELDNAME",
  "ER_DUP_KEYNAME",
  "ER_NO_SUCH_TABLE",
  "ER_PARSE_ERROR",
  "ER_SYNTAX_ERROR",
]);

interface SystemDbDriverError {
  code?: string;
}

let sharedSystemDbPool: Pool | null = null;
let sharedSystemDbClient: SystemDbClient | null = null;

export function createSystemDbClient(
  config: SystemDbConnectionConfig = systemDbConfig,
): SystemDbClient {
  return createSystemDbClientFromPool(createPool(buildSystemDbPoolOptions(config)));
}

export function getSharedSystemDbClient(): SystemDbClient {
  if (sharedSystemDbClient !== null) {
    return sharedSystemDbClient;
  }

  sharedSystemDbPool = createPool(buildSystemDbPoolOptions(systemDbConfig));
  sharedSystemDbClient = createSystemDbClientFromPool(sharedSystemDbPool, {
    allowClose: false,
  });

  return sharedSystemDbClient;
}

export async function closeSharedSystemDbClient(): Promise<void> {
  if (sharedSystemDbPool === null) {
    return;
  }

  const pool = sharedSystemDbPool;

  sharedSystemDbPool = null;
  sharedSystemDbClient = null;

  await pool.end();
}

function buildSystemDbPoolOptions(config: SystemDbConnectionConfig): PoolOptions {
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
    dateStrings: true,
  };
}

function createSystemDbClientFromPool(
  pool: Pool,
  options: {
    allowClose?: boolean;
  } = {},
): SystemDbClient {
  const shouldClosePool = options.allowClose ?? true;

  return {
    async select<TRow extends SystemDbRow = SystemDbRow>(
      statement: string,
      params: SystemDbQueryParams = [],
    ): Promise<TRow[]> {
      try {
        const [rows] = await pool.execute(statement, [...params]);

        if (!Array.isArray(rows)) {
          throw new PermanentIntegrationError({
            code: "SYSTEM_DB_UNEXPECTED_SELECT_RESULT",
            message: "System database returned an unexpected result for a SELECT statement",
          });
        }

        return rows as TRow[];
      } catch (error) {
        throw normalizeSystemDbError(error);
      }
    },

    async execute(
      statement: string,
      params: SystemDbQueryParams = [],
    ): Promise<ResultSetHeader> {
      try {
        const [result] = await pool.execute(statement, [...params]);

        if (!isResultSetHeader(result)) {
          throw new PermanentIntegrationError({
            code: "SYSTEM_DB_UNEXPECTED_EXECUTE_RESULT",
            message: "System database returned an unexpected result for a write statement",
          });
        }

        return result;
      } catch (error) {
        throw normalizeSystemDbError(error);
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

export async function withSystemDbClient<TResult>(
  operation: (client: SystemDbClient) => Promise<TResult>,
  config: SystemDbConnectionConfig = systemDbConfig,
): Promise<TResult> {
  const client = createSystemDbClient(config);
  let result: TResult | null = null;
  let operationError: unknown = null;

  try {
    result = await operation(client);
  } catch (error) {
    operationError = error;
  }

  try {
    await client.close();
  } catch (error) {
    if (operationError === null) {
      throw normalizeSystemDbError(error);
    }
  }

  if (operationError !== null) {
    throw operationError;
  }

  return result as TResult;
}

function normalizeSystemDbError(error: unknown): Error {
  if (isIntegrationError(error)) {
    return error;
  }

  const code = readDriverErrorCode(error);

  if (code !== null && TRANSIENT_SYSTEM_DB_ERROR_CODES.has(code)) {
    return new TransientIntegrationError({
      code: "SYSTEM_DB_UNAVAILABLE",
      message: "System database is temporarily unavailable",
      cause: error,
    });
  }

  if (code === "ER_ACCESS_DENIED_ERROR") {
    return new PermanentIntegrationError({
      code: "SYSTEM_DB_ACCESS_DENIED",
      message: "System database credentials were rejected",
      cause: error,
    });
  }

  if (code === "ER_BAD_DB_ERROR") {
    return new PermanentIntegrationError({
      code: "SYSTEM_DB_DATABASE_NOT_FOUND",
      message: "System database name is invalid or does not exist",
      cause: error,
    });
  }

  if (code !== null && PERMANENT_SYSTEM_DB_ERROR_CODES.has(code)) {
    return new PermanentIntegrationError({
      code: "SYSTEM_DB_INVALID_QUERY",
      message: "System database query is invalid",
      cause: error,
    });
  }

  return new TransientIntegrationError({
    code: "SYSTEM_DB_QUERY_FAILED",
    message: "System database query failed with an unknown transient condition",
    cause: error,
  });
}

function readDriverErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const driverError = error as SystemDbDriverError;

  return typeof driverError.code === "string" ? driverError.code : null;
}

function isResultSetHeader(value: unknown): value is ResultSetHeader {
  return (
    typeof value === "object" &&
    value !== null &&
    "affectedRows" in value &&
    "insertId" in value
  );
}
