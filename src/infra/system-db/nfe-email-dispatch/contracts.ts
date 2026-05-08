import type {
  NfeCustomerNfeSaleCandidate,
  NfeEmailDispatchCustomer,
  NfeEmailDispatchFinalizationStatus,
  NfeEmailDispatchSaleRecord,
  NfeEmailDispatchSaleStatus,
  NfeEmailDispatchSaleStatusCount,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";

export interface InsertNfeEmailDispatchSalesIdempotentlyInput {
  sales: readonly NfeCustomerNfeSaleCandidate[];
  runtimeScope: string;
}

export interface InsertNfeEmailDispatchSalesIdempotentlyResult {
  receivedSales: number;
  insertedSales: number;
  ignoredSales: number;
}

export interface UpsertNfeEmailDispatchCustomerInput {
  erpCustomerId: number;
}

export interface UpsertNfeEmailDispatchCustomerResult {
  customer: NfeEmailDispatchCustomer;
  created: boolean;
}

export interface DeleteNfeEmailDispatchCustomerInput {
  id?: number;
  erpCustomerId?: number;
}

export type DeleteNfeEmailDispatchCustomerResult =
  | {
      status: "deleted";
      customer: NfeEmailDispatchCustomer;
    }
  | {
      status: "not-found";
    };

export interface SearchNfeEmailDispatchCustomersInput {
  id?: number;
  erpCustomerId?: number;
  erpCustomerIds?: readonly number[];
  createdFrom?: string;
  createdTo?: string;
  limit: number;
  offset: number;
}

export interface SearchNfeEmailDispatchCustomersResult {
  items: NfeEmailDispatchCustomer[];
  total: number;
}

export interface SearchNfeEmailDispatchSalesInput {
  id?: number;
  nfeEmailDispatchCustomerId?: number;
  erpCustomerId?: number;
  erpSaleId?: number;
  erpInvoiceKey?: string;
  statuses?: readonly NfeEmailDispatchSaleStatus[];
  runtimeScope?: string;
  invoiceEmittedFrom?: string;
  invoiceEmittedTo?: string;
  lastAttemptFrom?: string;
  lastAttemptTo?: string;
  sentFrom?: string;
  sentTo?: string;
  createdFrom?: string;
  createdTo?: string;
  limit: number;
  offset: number;
}

export interface SearchNfeEmailDispatchSalesResult {
  items: NfeEmailDispatchSaleRecord[];
  total: number;
}

export interface CountNfeEmailDispatchSalesByStatusInput {
  runtimeScope?: string;
  lastAttemptFrom?: string;
  lastAttemptTo?: string;
  sentFrom?: string;
  sentTo?: string;
  createdFrom?: string;
  createdTo?: string;
}

export interface CountNfeEmailDispatchSalesByStatusResult {
  items: NfeEmailDispatchSaleStatusCount[];
  total: number;
}

export interface LoadEligibleNfeEmailDispatchSalesInput {
  maxSendAttempts: number;
  runtimeScope: string;
}

export interface ClaimNfeEmailDispatchSaleInput {
  saleId: number;
  attemptStartedAt: Date | string;
  maxSendAttempts: number;
  runtimeScope: string;
}

export type ClaimNfeEmailDispatchSaleResult =
  | {
      status: "claimed";
      attemptCount: number;
    }
  | {
      status: "already-claimed-by-this-attempt";
      attemptCount: number;
    }
  | {
      status: "skipped";
    };

export interface ClaimManualNfeEmailDispatchSaleInput {
  saleId: number;
  attemptStartedAt: Date | string;
  runtimeScope: string;
}

export type ClaimManualNfeEmailDispatchSaleResult =
  | {
      status: "claimed";
      attemptCount: number;
    }
  | {
      status: "already-claimed-by-this-attempt";
      attemptCount: number;
    }
  | {
      status: "skipped";
    };

export interface RollbackManualNfeEmailDispatchSaleClaimInput {
  saleId: number;
  runtimeScope: string;
  currentAttemptCount: number;
  currentAttemptStartedAt: Date | string;
  previousStatus: NfeEmailDispatchSaleStatus;
  previousAttemptCount: number;
  previousFirstAttemptAt: Date | string | null;
  previousLastAttemptAt: Date | string | null;
  previousLastErrorMessage: string | null;
}

export type RollbackManualNfeEmailDispatchSaleClaimResult =
  | {
      status: "restored";
    }
  | {
      status: "noop";
      snapshot: NfeEmailDispatchSaleStatusSnapshot | null;
    };

export interface FinalizeNfeEmailDispatchSaleInput {
  saleId: number;
  attemptStartedAt: Date | string;
  finalStatus: NfeEmailDispatchFinalizationStatus;
  runtimeScope: string;
  errorMessage?: string;
  sentAt?: Date | string;
}

export interface NfeEmailDispatchSaleStatusSnapshot {
  saleId: number;
  status: NfeEmailDispatchSaleStatus;
  attemptCount: number;
  lastAttemptAt: string | null;
  sentAt: string | null;
  lastErrorMessage: string | null;
  updatedAt: string;
}

export type FinalizeNfeEmailDispatchSaleResult =
  | {
      status: "finalized";
      snapshot: NfeEmailDispatchSaleStatusSnapshot;
    }
  | {
      status: "noop";
      snapshot: NfeEmailDispatchSaleStatusSnapshot | null;
    };

export interface FinalizeNfeEmailDispatchSaleDirectInput {
  saleId: number;
  expectedStatus: NfeEmailDispatchSaleStatus;
  expectedAttemptCount: number;
  attemptStartedAt: Date | string;
  finalStatus: NfeEmailDispatchFinalizationStatus;
  runtimeScope: string;
  errorMessage?: string;
  sentAt?: Date | string;
}

export type FinalizeNfeEmailDispatchSaleDirectResult =
  | {
      status: "finalized";
      snapshot: NfeEmailDispatchSaleStatusSnapshot;
    }
  | {
      status: "not-found";
    }
  | {
      status: "conflict";
      snapshot: NfeEmailDispatchSaleStatusSnapshot;
    };
