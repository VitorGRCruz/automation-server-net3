import type { ResultSetHeader } from "mysql2/promise";

export type SystemDbQueryValue = string | number | boolean | Date | null;

export type SystemDbQueryParams = readonly SystemDbQueryValue[];

export type SystemDbRow = Record<string, unknown>;

export interface SystemDbConnectionConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  connectTimeoutMs: number;
  connectionLimit: number;
}

export interface SystemDbClient {
  select<TRow extends SystemDbRow = SystemDbRow>(
    statement: string,
    params?: SystemDbQueryParams,
  ): Promise<TRow[]>;
  execute(
    statement: string,
    params?: SystemDbQueryParams,
  ): Promise<ResultSetHeader>;
  close(): Promise<void>;
}
