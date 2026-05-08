import type { AutomationRuntimePolicyInput } from "../shared/automation-runtime-policy.types.js";

export const NFE_EMAIL_DISPATCH_SALE_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "SENT",
  "FAILED_TRANSIENT",
  "FAILED_FINAL",
  "DELIVERY_UNKNOWN",
] as const;

export type NfeEmailDispatchSaleStatus =
  (typeof NFE_EMAIL_DISPATCH_SALE_STATUSES)[number];

export const NFE_EMAIL_DISPATCH_PROCESSABLE_STATUSES = [
  "PENDING",
  "FAILED_TRANSIENT",
] as const;

export type NfeEmailDispatchProcessableStatus =
  (typeof NFE_EMAIL_DISPATCH_PROCESSABLE_STATUSES)[number];

export const NFE_EMAIL_DISPATCH_FINALIZATION_STATUSES = [
  "SENT",
  "FAILED_TRANSIENT",
  "FAILED_FINAL",
  "DELIVERY_UNKNOWN",
] as const;

export type NfeEmailDispatchFinalizationStatus =
  (typeof NFE_EMAIL_DISPATCH_FINALIZATION_STATUSES)[number];

export const NFE_EMAIL_DISPATCH_TERMINAL_STATUSES = [
  "SENT",
  "FAILED_FINAL",
  "DELIVERY_UNKNOWN",
] as const;

export type NfeEmailDispatchTerminalStatus =
  (typeof NFE_EMAIL_DISPATCH_TERMINAL_STATUSES)[number];

export type NfeEmailDispatchWorkflowSource = "manual" | "schedule";

export const NFE_EMAIL_DISPATCH_DEFAULT_DISCOVERY_WINDOW_DAYS = 15;
export const NFE_EMAIL_DISPATCH_DEFAULT_MAX_CONCURRENT_CHILDREN = 5;
export const NFE_EMAIL_DISPATCH_DEFAULT_MAX_SEND_ATTEMPTS = 3;
export const NFE_EMAIL_DISPATCH_EMAIL_SUBJECT = "Sua Nota Fiscal - NET3 WIFI";
export const NFE_EMAIL_DISCOVERY_RUNNING_MESSAGE =
  "Workflow de descoberta de NF-e ainda está em execução.";
export const NFE_EMAIL_CONTEXT_NOT_FOUND_MESSAGE =
  "Venda não encontrada ou não elegível no ERP no momento do envio.";
export const NFE_EMAIL_CONTEXT_INVALID_RECIPIENTS_MESSAGE =
  "Cliente sem e-mail válido para envio da NF-e.";
export const NFE_EMAIL_CONTEXT_PERMANENT_FAILURE_MESSAGE =
  "Falha definitiva ao buscar informações da venda no ERP";
export const NFE_EMAIL_CONTEXT_TRANSIENT_FAILURE_MESSAGE =
  "Falha no servidor ao buscar informações da venda";
export const NFE_EMAIL_PDF_INVALID_MESSAGE =
  "PDF da NF-e não encontrado ou inválido na IXC.";
export const NFE_EMAIL_PDF_TRANSIENT_FAILURE_MESSAGE =
  "Falha no servidor ao buscar o PDF da NF-e na IXC.";
export const NFE_EMAIL_SMTP_TRANSIENT_FAILURE_MESSAGE =
  "Falha temporária ao enviar a NF-e por e-mail.";
export const NFE_EMAIL_TEMPLATE_RENDER_TRANSIENT_FAILURE_MESSAGE =
  "Falha temporária ao montar o e-mail da NF-e.";

export interface NfeEmailDispatchCustomer {
  id: number;
  erpCustomerId: number;
  createdAt: string;
}

export interface ErpNfeSaleCandidate {
  automationCustomerId: number;
  erpCustomerId: number;
  erpSaleId: number;
  erpInvoiceKey: string | null;
  erpInvoiceEmittedAt: string;
}

export type NfeCustomerNfeSaleCandidate = ErpNfeSaleCandidate;

export interface NfeEmailDispatchSaleJob {
  id: number;
  nfeEmailDispatchCustomerId: number;
  erpSaleId: number;
  erpInvoiceKey: string | null;
  erpInvoiceEmittedAt: string;
  status: NfeEmailDispatchSaleStatus;
  attemptCount: number;
  firstAttemptAt: string | null;
  lastAttemptAt: string | null;
  sentAt: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NfeEmailDispatchSaleRecord extends NfeEmailDispatchSaleJob {
  runtimeScope: string;
  erpCustomerId: number;
}

export interface NfeEmailDispatchSaleStatusCount {
  status: NfeEmailDispatchSaleStatus;
  count: number;
}

export interface NfeEmailDispatchEligibleSale extends NfeEmailDispatchSaleJob {
  erpCustomerId: number;
  customerCreatedAt: string;
}

export interface NfeEmailDispatchSaleToProcess {
  nfeEmailDispatchSaleId: number;
  erpSaleId: number;
  currentAttemptCount: number;
}

export interface FetchCustomerNfeSalesCandidatesWorkflowInput {
  requestId: string;
  source: NfeEmailDispatchWorkflowSource;
  discoveryWindowDays?: number;
  maxConcurrentChildren?: number;
  runtimePolicy?: AutomationRuntimePolicyInput;
}

export interface FetchCustomerNfeSalesCandidatesSummary {
  totalCustomers: number;
  successCustomers: number;
  failedCustomers: number;
  totalFoundSales: number;
  totalQueuedSales: number;
  failedCustomerIds: number[];
}

export type FetchCustomerNfeSalesCandidatesWorkflowStatus =
  | "SUCCESS"
  | "PARTIAL_FAILURE";

export interface FetchCustomerNfeSalesCandidatesWorkflowResult {
  requestId: string;
  source: NfeEmailDispatchWorkflowSource;
  discoveryStartedAt: string;
  discoveryWindowDays: number;
  maxConcurrentChildren: number;
  status: FetchCustomerNfeSalesCandidatesWorkflowStatus;
  summary: FetchCustomerNfeSalesCandidatesSummary;
}

export interface FetchSingleCustomerNfeSalesCandidatesWorkflowInput {
  automationCustomerId: number;
  erpCustomerId: number;
  customerCreatedAt: string;
  discoveryStartedAt: string;
  discoveryWindowDays: number;
  runtimePolicy?: AutomationRuntimePolicyInput;
}

export interface FetchSingleCustomerNfeSalesCandidatesWorkflowResult {
  automationCustomerId: number;
  erpCustomerId: number;
  status: "SUCCESS" | "FAILED";
  foundSales: number;
  queuedSales: number;
  errorMessage?: string;
}

export interface FetchCustomerNfeSalesCandidatesFromErpActivityInput {
  automationCustomerId: number;
  erpCustomerId: number;
  effectiveStart: string;
}

export interface EnqueueNfeEmailDispatchSalesActivityInput {
  candidates: readonly ErpNfeSaleCandidate[];
  runtimeScope: string;
}

export interface EnqueueNfeEmailDispatchSalesActivityResult {
  receivedCandidates: number;
  queuedSales: number;
}

export interface ProcessNfeEmailDispatchSalesWorkflowInput {
  requestId: string;
  source: NfeEmailDispatchWorkflowSource;
  maxConcurrentChildren?: number;
  maxSendAttempts?: number;
  discoveryWorkflowId?: string;
  runtimePolicy?: AutomationRuntimePolicyInput;
}

export interface ProcessNfeEmailDispatchSalesSummary {
  totalEligibleSales: number;
  completedChildren: number;
  skippedSales: number;
  sentSales: number;
  failedTransientSales: number;
  failedFinalSales: number;
  deliveryUnknownSales: number;
  childWorkflowFailures: number;
  failedSaleIds: number[];
}

export type ProcessNfeEmailDispatchSalesWorkflowStatus =
  | "SUCCESS"
  | "PARTIAL_FAILURE"
  | "SKIPPED_DISCOVERY_RUNNING";

export interface ProcessNfeEmailDispatchSalesWorkflowResult {
  requestId: string;
  source: NfeEmailDispatchWorkflowSource;
  maxConcurrentChildren: number;
  maxSendAttempts: number;
  status: ProcessNfeEmailDispatchSalesWorkflowStatus;
  summary: ProcessNfeEmailDispatchSalesSummary;
  blockedByWorkflowId?: string;
  message?: string;
}

export interface ProcessSingleNfeEmailDispatchSaleWorkflowInput {
  nfeEmailDispatchSaleId: number;
  erpSaleId: number;
  currentAttemptCount: number;
  maxSendAttempts: number;
  runtimePolicy?: AutomationRuntimePolicyInput;
}

export interface ManualProcessNfeEmailDispatchSaleWorkflowInput {
  requestId: string;
  nfeEmailDispatchSaleId: number;
  erpSaleId: number;
  attemptCount: number;
  attemptStartedAt: string;
  runtimePolicy?: AutomationRuntimePolicyInput;
}

export interface NfeSaleEmailContext {
  recipients: string[];
  nomeCliente: string;
  idVenda: number;
  valorTotal: number;
  numeroNf: string;
  nfeChave: string | null;
}

export interface FetchNfePdfFromIxcResult {
  pdfPath: string;
}

export interface FetchNfePdfFromIxcActivityInput {
  nfeEmailDispatchSaleId: number;
  erpSaleId: number;
  attemptCount: number;
}

export interface LoadNfeEmailDispatchEligibleSalesActivityInput {
  maxSendAttempts: number;
  runtimeScope: string;
}

export interface CheckNfeEmailDispatchDiscoveryRunningActivityInput {
  discoveryWorkflowId: string;
}

export interface CheckNfeEmailDispatchDiscoveryRunningActivityResult {
  isRunning: boolean;
  discoveryWorkflowId: string;
  runId?: string;
}

export interface ClaimNfeEmailDispatchSaleActivityInput {
  nfeEmailDispatchSaleId: number;
  attemptStartedAt: string;
  maxSendAttempts: number;
  runtimeScope: string;
}

export type ClaimNfeEmailDispatchSaleActivityResult =
  | {
      status: "CLAIMED";
      attemptCount: number;
    }
  | {
      status: "ALREADY_CLAIMED_BY_THIS_ATTEMPT";
      attemptCount: number;
    }
  | {
      status: "SKIPPED";
    };

export interface FetchNfeSaleEmailContextFromErpActivityInput {
  erpSaleId: number;
}

export interface RenderNfeEmailTemplateActivityInput {
  emailContext: NfeSaleEmailContext;
}

export interface RenderNfeEmailTemplateActivityResult {
  html: string;
  text: string;
}

export type FetchNfeSaleEmailContextFromErpResult =
  | {
      status: "SUCCESS";
      data: NfeSaleEmailContext;
    }
  | {
      status: "FAILED_FINAL";
      errorMessage: string;
    };

export interface FinalizeNfeEmailDispatchSaleActivityInput {
  nfeEmailDispatchSaleId: number;
  attemptStartedAt: string;
  attemptCount: number;
  maxSendAttempts: number;
  status: NfeEmailDispatchFinalizationStatus;
  errorMessage?: string;
  runtimeScope: string;
}

export interface FinalizeNfeEmailDispatchSaleActivityResult {
  nfeEmailDispatchSaleId: number;
  status: NfeEmailDispatchFinalizationStatus;
  attemptCount: number;
  errorMessage?: string;
  sentAt?: string;
}

export interface ProcessSingleNfeEmailDispatchSaleWorkflowResult {
  nfeEmailDispatchSaleId: number;
  erpSaleId: number;
  status:
    | "SENT"
    | "FAILED_TRANSIENT"
    | "FAILED_FINAL"
    | "DELIVERY_UNKNOWN"
    | "SKIPPED";
  attemptCount?: number;
  errorMessage?: string;
}

export interface ManualProcessNfeEmailDispatchSaleWorkflowResult {
  nfeEmailDispatchSaleId: number;
  erpSaleId: number;
  status:
    | "SENT"
    | "FAILED_TRANSIENT"
    | "FAILED_FINAL"
    | "DELIVERY_UNKNOWN";
  attemptCount: number;
  errorMessage?: string;
}

export interface NfeEmailDispatchSaleManualProcessingSnapshot {
  nfeEmailDispatchSaleId: number;
  erpSaleId: number;
  status: NfeEmailDispatchSaleStatus;
  attemptCount: number;
  firstAttemptAt: string | null;
  lastAttemptAt: string | null;
  sentAt: string | null;
  lastErrorMessage: string | null;
  updatedAt: string;
}

export interface LoadNfeEmailDispatchSaleForManualProcessingActivityInput {
  nfeEmailDispatchSaleId: number;
  runtimeScope: string;
}

export type LoadNfeEmailDispatchSaleForManualProcessingActivityResult =
  | {
      status: "FOUND";
      sale: NfeEmailDispatchSaleManualProcessingSnapshot;
    }
  | {
      status: "NOT_FOUND";
    };

export interface AcquireNfeEmailDispatchSaleAttemptLockActivityInput {
  requestId: string;
  workflowId: string;
  nfeEmailDispatchSaleId: number;
  attemptNumber: number;
  runtimeScope: string;
}

export type AcquireNfeEmailDispatchSaleAttemptLockActivityResult =
  | {
      status: "ACQUIRED";
      leaseToken: string;
    }
  | {
      status: "PENDING";
    }
  | {
      status: "ALREADY_PROCESSED";
      finalStatus?: NfeEmailDispatchFinalizationStatus;
    };

export interface CompleteNfeEmailDispatchSaleAttemptLockActivityInput {
  workflowId: string;
  nfeEmailDispatchSaleId: number;
  attemptNumber: number;
  runtimeScope: string;
  leaseToken: string;
  finalStatus: NfeEmailDispatchFinalizationStatus;
}

export interface CancelNfeEmailDispatchSaleAttemptLockActivityInput {
  nfeEmailDispatchSaleId: number;
  attemptNumber: number;
  runtimeScope: string;
  leaseToken: string;
}

export interface FinalizeManualNfeEmailDispatchSaleActivityInput {
  nfeEmailDispatchSaleId: number;
  attemptStartedAt: string;
  attemptCount: number;
  status: NfeEmailDispatchFinalizationStatus;
  errorMessage?: string;
  runtimeScope: string;
}

export interface FinalizeManualNfeEmailDispatchSaleActivityResult {
  nfeEmailDispatchSaleId: number;
  status: NfeEmailDispatchFinalizationStatus;
  attemptCount: number;
  errorMessage?: string;
  sentAt?: string;
}

export function isNfeEmailDispatchProcessableStatus(
  status: NfeEmailDispatchSaleStatus,
): status is NfeEmailDispatchProcessableStatus {
  return NFE_EMAIL_DISPATCH_PROCESSABLE_STATUSES.includes(
    status as NfeEmailDispatchProcessableStatus,
  );
}

export function isNfeEmailDispatchTerminalStatus(
  status: NfeEmailDispatchSaleStatus,
): status is NfeEmailDispatchTerminalStatus {
  return NFE_EMAIL_DISPATCH_TERMINAL_STATUSES.includes(
    status as NfeEmailDispatchTerminalStatus,
  );
}
