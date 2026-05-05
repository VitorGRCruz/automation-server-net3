export type ErpDbQueryValue = string | number | boolean | Date | null;

export type ErpDbQueryParams = readonly ErpDbQueryValue[];

export type ErpDbRow = Record<string, unknown>;

export interface ErpDbConnectionConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  connectTimeoutMs: number;
  connectionLimit: number;
}

export interface ErpDbPingRow extends ErpDbRow {
  ok: number;
}

export interface ErpDbCsatEligibleRow extends ErpDbRow {
  id_cliente: number | string;
  id_contrato: number | string;
  id_os: number | string;
  nome_cliente: string;
  id_ticket: number | string | null;
  id_filial: number | string;
}

export interface ErpDbEquipmentRetrievalVerificationEligibleRow extends ErpDbRow {
  id_cobranca: number | string;
  id_os_retirada: number | string;
  id_receber: number | string;
  id_cidade: number | string | null;
  id_cliente: number | string;
  id_contrato_kit: number | string | null;
  id_filial: number | string | null;
}

export interface ErpDbClient {
  ping(): Promise<void>;
  select<TRow extends ErpDbRow = ErpDbRow>(
    statement: string,
    params?: ErpDbQueryParams,
  ): Promise<TRow[]>;
  close(): Promise<void>;
}
