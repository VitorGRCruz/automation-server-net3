import type { AutomationRuntimePolicyInput } from "../shared/automation-runtime-policy.types.js";
import type { StepSuccessResult } from "../shared/step-result.types.js";

export type EquipmentRetrievalVerificationWorkflowSource =
  | "manual"
  | "schedule"
  | "recovery";

export const EQUIPMENT_RETRIEVAL_VERIFICATION_CREATE_ORDER_SUBJECT_ID = "104";
export const EQUIPMENT_RETRIEVAL_VERIFICATION_CREATE_ORDER_SECTOR_ID = "15";
export const EQUIPMENT_RETRIEVAL_VERIFICATION_CREATE_ORDER_STATUS = "A";

export interface EquipmentRetrievalVerificationTriggerWorkflowInput {
  requestId: string;
  source: EquipmentRetrievalVerificationWorkflowSource;
  startAt: string;
  originRequestId?: string;
  runtimePolicy?: AutomationRuntimePolicyInput;
}

export interface EquipmentRetrievalVerificationEligibleRecord {
  idCobranca: number;
  idOsRetirada: number;
  idReceber: number;
  idCidade: number;
  idCliente: number;
  idContratoKit: number;
  idFilial: number;
}

export interface EquipmentRetrievalVerificationInvalidRecord {
  idCobranca: number;
  idOsRetirada: number;
  idReceber: number;
  idCliente: number;
  idCidade: number | null;
  idContratoKit: number | null;
  idFilial: number | null;
  missingFields: Array<"idCidade" | "idContratoKit" | "idFilial">;
}

export interface EquipmentRetrievalVerificationActivityExecutionContext {
  workflowId: string;
  workflowName: string;
  idempotencyScope?: string;
}

export interface EquipmentRetrievalVerificationFetchEligiblesActivityInput {
  requestId: string;
  startAt: string;
}

export interface EquipmentRetrievalVerificationFetchEligiblesActivityData {
  validRecords: EquipmentRetrievalVerificationEligibleRecord[];
  invalidRecords: EquipmentRetrievalVerificationInvalidRecord[];
}

export interface EquipmentRetrievalVerificationFetchEligiblesActivityEmptyResult {
  status: "empty";
  data: EquipmentRetrievalVerificationFetchEligiblesActivityData;
}

export type EquipmentRetrievalVerificationFetchEligiblesActivityResult =
  | StepSuccessResult<EquipmentRetrievalVerificationFetchEligiblesActivityData>
  | EquipmentRetrievalVerificationFetchEligiblesActivityEmptyResult;

export interface EquipmentRetrievalVerificationProcessItemWorkflowInput {
  requestId: string;
  item: EquipmentRetrievalVerificationEligibleRecord;
  runtimePolicy?: AutomationRuntimePolicyInput;
}

export interface EquipmentRetrievalVerificationCreateOrderActivityInput {
  requestId: string;
  executionContext: EquipmentRetrievalVerificationActivityExecutionContext;
  item: EquipmentRetrievalVerificationEligibleRecord;
}

export interface EquipmentRetrievalVerificationCreateOrderActivitySuccessData {
  createdServiceOrderId: string | number | null;
  recordedAt: string;
}

export type EquipmentRetrievalVerificationCreateOrderActivityFailureType =
  | "pending"
  | "response-error"
  | "html"
  | "permanent";

export interface EquipmentRetrievalVerificationCreateOrderActivityFailureResult {
  status: "failure";
  failureType: EquipmentRetrievalVerificationCreateOrderActivityFailureType;
  message: string;
}

export type EquipmentRetrievalVerificationCreateOrderActivityResult =
  | StepSuccessResult<EquipmentRetrievalVerificationCreateOrderActivitySuccessData>
  | EquipmentRetrievalVerificationCreateOrderActivityFailureResult;

export type EquipmentRetrievalVerificationProcessItemWorkflowResult =
  | {
      requestId: string;
      status: "order-created";
      item: EquipmentRetrievalVerificationEligibleRecord;
      createdServiceOrderId: string | number | null;
      recordedAt: string;
    }
  | {
      requestId: string;
      status: "permanent-failure";
      item: EquipmentRetrievalVerificationEligibleRecord;
      failureMessage: string;
    };

export interface RegisterEquipmentRetrievalVerificationTriggerFailureActivityInput {
  requestId: string;
  source: EquipmentRetrievalVerificationWorkflowSource;
  startAt: string;
  round: 1 | 2;
  errorKind: "transient" | "permanent";
  details: string;
  originRequestId?: string;
}

export interface RegisterEquipmentRetrievalVerificationTriggerFailureActivityData {
  recordedAt: string;
}

export type RegisterEquipmentRetrievalVerificationTriggerFailureActivityResult =
  StepSuccessResult<RegisterEquipmentRetrievalVerificationTriggerFailureActivityData>;

export type EquipmentRetrievalVerificationTriggerWorkflowStatus =
  | "no-eligible-items"
  | "child-workflows-started";

export interface EquipmentRetrievalVerificationTriggerWorkflowResult {
  requestId: string;
  source: EquipmentRetrievalVerificationWorkflowSource;
  startAt: string;
  status: EquipmentRetrievalVerificationTriggerWorkflowStatus;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  childWorkflowsStarted: number;
  skippedAlreadyRunning: number;
  skippedStartFailures: number;
  triggerFailureReason?: string;
}
