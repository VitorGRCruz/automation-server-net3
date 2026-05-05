import type { NfeEmailDispatchSaleStatus } from "../../../domain/nfe/nfe-email-dispatch.types.js";
import type { SystemDbRow } from "../system-db.types.js";

export interface NfeEmailDispatchCustomerRow extends SystemDbRow {
  id: number | string;
  erp_customer_id: number | string;
  created_at: string;
}

export interface NfeEmailDispatchEligibleSaleRow extends SystemDbRow {
  id: number | string;
  nfe_email_dispatch_customer_id: number | string;
  erp_customer_id: number | string;
  customer_created_at: string;
  erp_sale_id: number | string;
  erp_invoice_key: string | null;
  erp_invoice_emitted_at: string;
  status: NfeEmailDispatchSaleStatus;
  attempt_count: number | string;
  first_attempt_at: string | null;
  last_attempt_at: string | null;
  sent_at: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface NfeEmailDispatchSaleRecordRow extends SystemDbRow {
  id: number | string;
  nfe_email_dispatch_customer_id: number | string;
  runtime_scope: string;
  erp_customer_id: number | string;
  erp_sale_id: number | string;
  erp_invoice_key: string | null;
  erp_invoice_emitted_at: string;
  status: NfeEmailDispatchSaleStatus;
  attempt_count: number | string;
  first_attempt_at: string | null;
  last_attempt_at: string | null;
  sent_at: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface NfeEmailDispatchSaleStatusRow extends SystemDbRow {
  id: number | string;
  status: NfeEmailDispatchSaleStatus;
  attempt_count: number | string;
  last_attempt_at: string | null;
  sent_at: string | null;
  last_error_message: string | null;
  updated_at: string;
}

export interface NfeEmailDispatchSaleManualProcessingRow extends SystemDbRow {
  id: number | string;
  erp_sale_id: number | string;
  status: NfeEmailDispatchSaleStatus;
  attempt_count: number | string;
  first_attempt_at: string | null;
  last_attempt_at: string | null;
  sent_at: string | null;
  last_error_message: string | null;
  updated_at: string;
}

export interface NfeEmailDispatchSaleToProcessRow extends SystemDbRow {
  id: number | string;
  erp_sale_id: number | string;
  attempt_count: number | string;
}

export interface CountRow extends SystemDbRow {
  total: number | string;
}

export interface NfeEmailDispatchSaleStatusCountRow extends SystemDbRow {
  status: NfeEmailDispatchSaleStatus;
  total: number | string;
}
