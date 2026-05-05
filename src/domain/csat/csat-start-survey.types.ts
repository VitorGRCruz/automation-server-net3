import type { AutomationRuntimePolicyInput } from "../shared/automation-runtime-policy.types.js";
import type { StepSuccessResult } from "../shared/step-result.types.js";

export type CsatWorkflowStartSource = "manual" | "webhook" | "schedule";

export interface CsatEligibleRecord {
  idCliente: number;
  idContrato: number;
  idOs: number;
  nomeCliente: string;
  idTicket: number | null;
  idFilial: number;
}

export interface CsatStartSurveyWorkflowInput {
  requestId: string;
  source: CsatWorkflowStartSource;
  runtimePolicy?: AutomationRuntimePolicyInput;
}

export type CsatStartSurveyWorkflowStatus = "no-eligible-items" | "child-workflows-started";

export interface CsatStartSurveyWorkflowResult {
  requestId: string;
  source: CsatWorkflowStartSource;
  status: CsatStartSurveyWorkflowStatus;
  eligibleItemsFound: number;
  childWorkflowsStarted: number;
  skippedAlreadyRunning: number;
  skippedStartFailures: number;
  triggerFailureReason?: string;
}

export interface CsatProcessSurveyItemWorkflowInput {
  requestId: string;
  item: CsatEligibleRecord;
  runtimePolicy?: AutomationRuntimePolicyInput;
}

export const CSAT_OPA_CUSTOMER_LOOKUP_FAILURE = "FALHA NO SERVIDOR AO BUSCAR CLIENTE NO OPA";
export const CSAT_NO_CONTACT_FOUND_IN_OPA = "NENHUM CONTATO ENCONTRADO NO OPA";
export const CSAT_OPA_CONTACT_LOOKUP_FAILURE = "FALHA AO BUSCAR CONTATO DO CLIENTE NO OPA";
export const CSAT_OPA_CUSTOMER_OWNER_NOT_FOUND = "CONTATO DO TITULAR NÃO ENCONTRADO NO OPA";
export const CSAT_OPA_CUSTOMER_OWNER_WITHOUT_CONTACT =
  "NENHUM CONTATO DO TITULAR REGISTRADO NO OPA";
export const CSAT_OPA_CUSTOMER_WITHOUT_WHATSAPP_CONTACT =
  "O TITULAR NÃO POSSUI CONTATO PARA WHATSAPP NO OPA";
export const CSAT_OPA_CUSTOMER_WITHOUT_VALID_WHATSAPP =
  "O TITULAR NÃO POSSUI WHATSAPP VÁLIDO NO OPA";
export const CSAT_OPA_CONTACT_SERVER_FAILURE = "FALHA NO SERVIDOR AO BUSCAR CONTATO DO CLIENTE";
export const CSAT_SEND_MESSAGE_SERVER_FAILURE =
  "FALHA NO SERVIDOR AO ENVIAR MENSAGEM AO CLIENTE";
export const CSAT_FORWARD_FAILURE_SECTOR_ID = "35";
export const CSAT_FORWARD_FAILURE_STATUS = "EN";
export const CSAT_IXC_OMNICHANNEL_MESSAGE_ID = "16";
export const CSAT_IXC_SUCCESS_EVENT_STATUS = "A";
export const CSAT_IXC_SUCCESS_EVENT_ID = "18";
export const CSAT_IXC_SUCCESS_EVENT_BILLING_TYPE = "NENHUM";
export const CSAT_IXC_SUCCESS_EVENT_FINALIZE_PROCESS = "N";

export interface OpaCustomerReference {
  opaIdCliente: string;
}

export interface CsatMutableActivityExecutionContext {
  workflowId: string;
  workflowName: string;
  idempotencyScope?: string;
}

export type FindOpaCustomerFailureType = "permanent" | "terminal";

export type FindOpaCustomerResult =
  | {
      status: "success";
      opaIdCliente: string;
    }
  | {
      status: "failed";
      failureType: FindOpaCustomerFailureType;
      eventMessage: typeof CSAT_OPA_CUSTOMER_LOOKUP_FAILURE;
    };

export type FindOpaCustomerActivityResult = FindOpaCustomerResult;

export interface ForwardServiceOrderOnFailureInput {
  requestId: string;
  executionContext: CsatMutableActivityExecutionContext;
  idOs: number;
  failureMessage: string;
}

export type ForwardServiceOrderOnFailureFailureType =
  | "pending"
  | "response-error"
  | "html"
  | "permanent";

export interface ForwardServiceOrderOnFailureFailureResult {
  status: "failed";
  failureType: ForwardServiceOrderOnFailureFailureType;
  message: string;
  shouldBeRetriedByNextTrigger: true;
}

export type ForwardServiceOrderOnFailureResult =
  | {
      status: "success";
      forwardedToSectorId: typeof CSAT_FORWARD_FAILURE_SECTOR_ID;
    }
  | ForwardServiceOrderOnFailureFailureResult;

export type ForwardServiceOrderOnFailureActivityInput = ForwardServiceOrderOnFailureInput;
export type ForwardServiceOrderOnFailureActivityResult = ForwardServiceOrderOnFailureResult;

export type CsatProcessSurveyItemWorkflowResult =
  | {
      requestId: string;
      status: "service-order-success-event-recorded";
      item: CsatEligibleRecord;
      contact: CsatWhatsappContact;
      recordedAt: string;
    }
  | {
      requestId: string;
      status: "service-order-forwarded-on-failure";
      item: CsatEligibleRecord;
      failureMessage: string;
      forwardedToSectorId: typeof CSAT_FORWARD_FAILURE_SECTOR_ID;
    };

export interface FetchCsatEligibleItemsActivityInput {
  requestId: string;
}

export interface FetchCsatEligibleItemsActivityData {
  records: CsatEligibleRecord[];
}

export interface FetchCsatEligibleItemsActivityEmptyResult {
  status: "empty";
  data: FetchCsatEligibleItemsActivityData;
}

export type FetchCsatEligibleItemsActivityResult =
  | StepSuccessResult<FetchCsatEligibleItemsActivityData>
  | FetchCsatEligibleItemsActivityEmptyResult;

export interface FindOpaCustomerActivityInput {
  idCliente: number;
}

export interface CsatWhatsappContact {
  contatoWhatsapp: string;
}

export interface FindWhatsappContactActivityInput {
  opaIdCliente: string;
}

export type FindWhatsappContactFailureReason =
  | typeof CSAT_NO_CONTACT_FOUND_IN_OPA
  | typeof CSAT_OPA_CONTACT_LOOKUP_FAILURE
  | typeof CSAT_OPA_CUSTOMER_OWNER_NOT_FOUND
  | typeof CSAT_OPA_CUSTOMER_OWNER_WITHOUT_CONTACT
  | typeof CSAT_OPA_CUSTOMER_WITHOUT_WHATSAPP_CONTACT
  | typeof CSAT_OPA_CUSTOMER_WITHOUT_VALID_WHATSAPP
  | typeof CSAT_OPA_CONTACT_SERVER_FAILURE;

export type FindWhatsappContactResult =
  | {
      status: "success";
      contatoWhatsapp: string;
    }
  | {
      status: "failure";
      motivoFalha: FindWhatsappContactFailureReason;
    };

export type FindWhatsappContactActivityResult = FindWhatsappContactResult;

export interface CsatCloseCycleAfterContactFailureInput {
  idOs: number;
  motivoFalha: FindWhatsappContactFailureReason;
}

export interface SendCsatMessageActivityInput {
  requestId: string;
  executionContext: CsatMutableActivityExecutionContext;
  idOs: number;
  idCliente: number;
  contatoWhatsapp: string;
}

export type SendCsatMessageActivityFailureType =
  | "pending"
  | "response-error"
  | "html"
  | "permanent";

export interface SendCsatMessageActivityFailureResult {
  status: "failure";
  failureType: SendCsatMessageActivityFailureType;
  message: string;
}

export type SendCsatMessageActivityResult =
  | {
      status: "success";
    }
  | SendCsatMessageActivityFailureResult;

export interface RegisterCsatSuccessEventOnOsActivityInput {
  requestId: string;
  executionContext: CsatMutableActivityExecutionContext;
  idOs: number;
  contatoWhatsapp: string;
}

export type RegisterCsatSuccessEventOnOsFailureType =
  | "permanent"
  | "transient"
  | "response-error"
  | "html";

export interface RegisterCsatSuccessEventOnOsActivitySuccessResult {
  status: "success";
  recordedAt: string;
}

export interface RegisterCsatSuccessEventOnOsActivityFailureResult {
  status: "failure";
  failureType: RegisterCsatSuccessEventOnOsFailureType;
  message: string;
}

export type RegisterCsatSuccessEventOnOsActivityResult =
  | RegisterCsatSuccessEventOnOsActivitySuccessResult
  | RegisterCsatSuccessEventOnOsActivityFailureResult;

export interface RegisterCsatTriggerFailureActivityInput {
  requestId: string;
  source: CsatWorkflowStartSource;
  details: string;
}

export interface RegisterCsatTriggerFailureActivityData {
  recordedAt: string;
}

export type RegisterCsatTriggerFailureActivityResult =
  StepSuccessResult<RegisterCsatTriggerFailureActivityData>;
