import type {
  NfeEmailDispatchCustomer,
  NfeEmailDispatchEligibleSale,
  NfeEmailDispatchSaleManualProcessingSnapshot,
  NfeEmailDispatchSaleRecord,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import type { NfeEmailDispatchSaleStatusSnapshot } from "./contracts.js";
import {
  type NfeEmailDispatchCustomerRow,
  type NfeEmailDispatchEligibleSaleRow,
  type NfeEmailDispatchSaleManualProcessingRow,
  type NfeEmailDispatchSaleRecordRow,
  type NfeEmailDispatchSaleStatusRow,
} from "./row-types.js";
import { readRowNumber } from "./sql.js";

export function mapCustomerRow(
  row: NfeEmailDispatchCustomerRow,
): NfeEmailDispatchCustomer {
  return {
    id: readRowNumber(row.id, "nfe_email_dispatch_customer.id"),
    erpCustomerId: readRowNumber(
      row.erp_customer_id,
      "nfe_email_dispatch_customer.erp_customer_id",
    ),
    createdAt: row.created_at,
  };
}

export function mapEligibleSaleRow(
  row: NfeEmailDispatchEligibleSaleRow,
): NfeEmailDispatchEligibleSale {
  return {
    id: readRowNumber(row.id, "nfe_email_dispatch_sale.id"),
    nfeEmailDispatchCustomerId: readRowNumber(
      row.nfe_email_dispatch_customer_id,
      "nfe_email_dispatch_sale.nfe_email_dispatch_customer_id",
    ),
    erpCustomerId: readRowNumber(
      row.erp_customer_id,
      "nfe_email_dispatch_customer.erp_customer_id",
    ),
    customerCreatedAt: row.customer_created_at,
    erpSaleId: readRowNumber(row.erp_sale_id, "nfe_email_dispatch_sale.erp_sale_id"),
    erpInvoiceKey: row.erp_invoice_key,
    erpInvoiceEmittedAt: row.erp_invoice_emitted_at,
    status: row.status,
    attemptCount: readRowNumber(
      row.attempt_count,
      "nfe_email_dispatch_sale.attempt_count",
    ),
    firstAttemptAt: row.first_attempt_at,
    lastAttemptAt: row.last_attempt_at,
    sentAt: row.sent_at,
    lastErrorMessage: row.last_error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSaleRecordRow(
  row: NfeEmailDispatchSaleRecordRow,
): NfeEmailDispatchSaleRecord {
  return {
    id: readRowNumber(row.id, "nfe_email_dispatch_sale.id"),
    nfeEmailDispatchCustomerId: readRowNumber(
      row.nfe_email_dispatch_customer_id,
      "nfe_email_dispatch_sale.nfe_email_dispatch_customer_id",
    ),
    runtimeScope: row.runtime_scope,
    erpCustomerId: readRowNumber(
      row.erp_customer_id,
      "nfe_email_dispatch_customer.erp_customer_id",
    ),
    erpSaleId: readRowNumber(row.erp_sale_id, "nfe_email_dispatch_sale.erp_sale_id"),
    erpInvoiceKey: row.erp_invoice_key,
    erpInvoiceEmittedAt: row.erp_invoice_emitted_at,
    status: row.status,
    attemptCount: readRowNumber(
      row.attempt_count,
      "nfe_email_dispatch_sale.attempt_count",
    ),
    firstAttemptAt: row.first_attempt_at,
    lastAttemptAt: row.last_attempt_at,
    sentAt: row.sent_at,
    lastErrorMessage: row.last_error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSaleStatusRow(
  row: NfeEmailDispatchSaleStatusRow,
): NfeEmailDispatchSaleStatusSnapshot {
  return {
    saleId: readRowNumber(row.id, "nfe_email_dispatch_sale.id"),
    status: row.status,
    attemptCount: readRowNumber(
      row.attempt_count,
      "nfe_email_dispatch_sale.attempt_count",
    ),
    lastAttemptAt: row.last_attempt_at,
    sentAt: row.sent_at,
    lastErrorMessage: row.last_error_message,
    updatedAt: row.updated_at,
  };
}

export function mapSaleManualProcessingRow(
  row: NfeEmailDispatchSaleManualProcessingRow,
): NfeEmailDispatchSaleManualProcessingSnapshot {
  return {
    nfeEmailDispatchSaleId: readRowNumber(row.id, "nfe_email_dispatch_sale.id"),
    erpSaleId: readRowNumber(row.erp_sale_id, "nfe_email_dispatch_sale.erp_sale_id"),
    status: row.status,
    attemptCount: readRowNumber(
      row.attempt_count,
      "nfe_email_dispatch_sale.attempt_count",
    ),
    firstAttemptAt: row.first_attempt_at,
    lastAttemptAt: row.last_attempt_at,
    sentAt: row.sent_at,
    lastErrorMessage: row.last_error_message,
    updatedAt: row.updated_at,
  };
}
