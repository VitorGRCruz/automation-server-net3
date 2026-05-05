import {
  ApplicationFailure,
  log,
  proxyActivities,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";
import type {
  CsatCloseCycleAfterContactFailureInput,
  CsatMutableActivityExecutionContext,
  CsatProcessSurveyItemWorkflowInput,
  CsatProcessSurveyItemWorkflowResult,
  CsatWhatsappContact,
  ForwardServiceOrderOnFailureFailureResult,
  RegisterCsatSuccessEventOnOsActivityResult,
  SendCsatMessageActivityFailureResult,
} from "../../../domain/csat/csat-start-survey.types.js";
import {
  CSAT_OPA_CONTACT_SERVER_FAILURE,
  CSAT_OPA_CUSTOMER_LOOKUP_FAILURE,
} from "../../../domain/csat/csat-start-survey.types.js";
import { temporalTaskQueues } from "../../../infra/config/temporal-task-queues.js";
import type * as csatOpaCustomerActivities from "../../activities/csat/find-opa-customer.activity.js";
import type * as csatOpaContactActivities from "../../activities/csat/find-whatsapp-contact.activity.js";
import type * as csatIxcForwardActivities from "../../activities/csat/forward-service-order-on-failure.activity.js";
import type * as csatIxcRegisterActivities from "../../activities/csat/register-csat-success-event-on-os.activity.js";
import type * as csatIxcSendActivities from "../../activities/csat/send-csat-message.activity.js";
import { normalizeAutomationRuntimePolicy } from "../shared/automation-runtime-policy.workflow.js";
import {
  findRootApplicationFailure,
  readWorkflowFailureMessage,
} from "../shared/workflow-failure.workflow.js";

const STANDARD_ACTIVITY_OPTIONS = {
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "5 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    nonRetryableErrorTypes: ["PermanentIntegrationError"],
  },
};

const MUTATING_IDEMPOTENT_ACTIVITY_OPTIONS = {
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "30 seconds",
    backoffCoefficient: 1,
    maximumAttempts: 6,
    nonRetryableErrorTypes: ["PermanentIntegrationError"],
  },
};

const { findOpaCustomerActivity } = proxyActivities<typeof csatOpaCustomerActivities>({
  taskQueue: temporalTaskQueues.opa,
  ...STANDARD_ACTIVITY_OPTIONS,
});

const { forwardServiceOrderOnFailureActivity } = proxyActivities<
  typeof csatIxcForwardActivities
>({
  taskQueue: temporalTaskQueues.ixc,
  ...MUTATING_IDEMPOTENT_ACTIVITY_OPTIONS,
});

const { findWhatsappContactActivity } = proxyActivities<typeof csatOpaContactActivities>({
  taskQueue: temporalTaskQueues.opa,
  ...STANDARD_ACTIVITY_OPTIONS,
});

const { sendCsatMessageActivity } = proxyActivities<typeof csatIxcSendActivities>({
  taskQueue: temporalTaskQueues.ixc,
  ...MUTATING_IDEMPOTENT_ACTIVITY_OPTIONS,
});

const { registerCsatSuccessEventOnOsActivity } = proxyActivities<
  typeof csatIxcRegisterActivities
>({
  taskQueue: temporalTaskQueues.ixc,
  startToCloseTimeout: "2 minutes",
  retry: {
    maximumAttempts: 1,
  },
});

const REGISTER_SUCCESS_EVENT_MAX_ATTEMPTS = 6;
const REGISTER_SUCCESS_EVENT_RETRY_DELAY = "30 seconds";

type CsatChildWorkflowStep =
  | "find-opa-customer"
  | "find-whatsapp-contact"
  | "send-csat-message"
  | "register-success-event"
  | "forward-service-order-on-failure";

interface ForwardServiceOrderAfterFailureInput {
  step: CsatChildWorkflowStep;
  failureMessage: string;
}

/**
 * Child workflow for each CSAT-eligible record.
 * This phase resolves the OPA customer, finds a valid WhatsApp contact, sends the message via IXC,
 * and forwards the OS on failure.
 */
export async function csatProcessSurveyItemWorkflow(
  input: CsatProcessSurveyItemWorkflowInput,
): Promise<CsatProcessSurveyItemWorkflowResult> {
  const runtimePolicy = normalizeAutomationRuntimePolicy(input.runtimePolicy);
  const mutableExecutionContext = buildMutableExecutionContext(runtimePolicy);
  log.info("CSAT child started", buildChildLogContext(input));

  try {
    const customerLookupResult = await findOpaCustomerActivity({
      idCliente: input.item.idCliente,
    });

    if (customerLookupResult.status === "failed") {
      log.warn(
        "CSAT child step returned failure",
        buildChildStepLogContext(input, "find-opa-customer", {
          failureType: customerLookupResult.failureType,
          failureMessage: customerLookupResult.eventMessage,
        }),
      );

      return forwardServiceOrderAfterFailure(input, mutableExecutionContext, {
        step: "find-opa-customer",
        failureMessage: customerLookupResult.eventMessage,
      });
    }

    log.info(
      "CSAT child step completed",
      buildChildStepLogContext(input, "find-opa-customer", {
        opaIdCliente: customerLookupResult.opaIdCliente,
      }),
    );

    return resolveWhatsappContact(
      input,
      mutableExecutionContext,
      customerLookupResult.opaIdCliente,
    );
  } catch (error) {
    const failureType = classifyRetriedActivityFailure(error);

    log.warn(
      "CSAT child step exhausted retries",
      buildChildStepLogContext(input, "find-opa-customer", {
        failureType,
        failureMessage: CSAT_OPA_CUSTOMER_LOOKUP_FAILURE,
      }),
    );

    return forwardServiceOrderAfterFailure(input, mutableExecutionContext, {
      step: "find-opa-customer",
      failureMessage: CSAT_OPA_CUSTOMER_LOOKUP_FAILURE,
    });
  }
}

async function resolveWhatsappContact(
  input: CsatProcessSurveyItemWorkflowInput,
  mutableExecutionContext: CsatMutableActivityExecutionContext,
  opaIdCliente: string,
): Promise<CsatProcessSurveyItemWorkflowResult> {
  try {
    const contactLookupResult = await findWhatsappContactActivity({
      opaIdCliente,
    });

    if (contactLookupResult.status === "failure") {
      log.warn(
        "CSAT child step returned failure",
        buildChildStepLogContext(input, "find-whatsapp-contact", {
          opaIdCliente,
          failureMessage: contactLookupResult.motivoFalha,
        }),
      );

      return closeCycleAfterContactFailure(input, mutableExecutionContext, {
        motivoFalha: contactLookupResult.motivoFalha,
      });
    }

    log.info(
      "CSAT child step completed",
      buildChildStepLogContext(input, "find-whatsapp-contact", {
        opaIdCliente,
        contatoWhatsapp: contactLookupResult.contatoWhatsapp,
      }),
    );

    return sendWhatsappMessage(input, mutableExecutionContext, {
      contatoWhatsapp: contactLookupResult.contatoWhatsapp,
    });
  } catch (error) {
    const failureType = classifyRetriedActivityFailure(error);

    log.warn(
      "CSAT child step exhausted retries",
      buildChildStepLogContext(input, "find-whatsapp-contact", {
        opaIdCliente,
        failureType,
        failureMessage: CSAT_OPA_CONTACT_SERVER_FAILURE,
      }),
    );

    return closeCycleAfterContactFailure(input, mutableExecutionContext, {
      motivoFalha: CSAT_OPA_CONTACT_SERVER_FAILURE,
    });
  }
}

async function sendWhatsappMessage(
  input: CsatProcessSurveyItemWorkflowInput,
  mutableExecutionContext: CsatMutableActivityExecutionContext,
  contact: CsatWhatsappContact,
): Promise<CsatProcessSurveyItemWorkflowResult> {
  let sendResult: Awaited<ReturnType<typeof sendCsatMessageActivity>>;

  try {
    sendResult = await sendCsatMessageActivity({
      requestId: input.requestId,
      executionContext: mutableExecutionContext,
      idOs: input.item.idOs,
      idCliente: input.item.idCliente,
      contatoWhatsapp: contact.contatoWhatsapp,
    });
  } catch (error) {
    return failSendCsatMessageActivityExecution(input, contact, error);
  }

  if (sendResult.status === "failure") {
    log.warn(
      "CSAT child step returned failure",
      buildChildStepLogContext(input, "send-csat-message", {
        contatoWhatsapp: contact.contatoWhatsapp,
        failureType: sendResult.failureType,
        message: sendResult.message,
      }),
    );

    if (sendResult.failureType === "response-error") {
      return forwardServiceOrderAfterFailure(input, mutableExecutionContext, {
        step: "send-csat-message",
        failureMessage: sendResult.message,
      });
    }

    return failSendCsatMessageResult(input, contact, sendResult);
  }

  log.info(
    "CSAT child step completed",
    buildChildStepLogContext(input, "send-csat-message", {
      contatoWhatsapp: contact.contatoWhatsapp,
    }),
  );

  return registerSuccessEventOnServiceOrder(input, mutableExecutionContext, contact);
}

async function registerSuccessEventOnServiceOrder(
  input: CsatProcessSurveyItemWorkflowInput,
  mutableExecutionContext: CsatMutableActivityExecutionContext,
  contact: CsatWhatsappContact,
): Promise<CsatProcessSurveyItemWorkflowResult> {
  for (let attempt = 1; attempt <= REGISTER_SUCCESS_EVENT_MAX_ATTEMPTS; attempt += 1) {
    const registerResult = await registerCsatSuccessEventOnOsActivity({
      requestId: input.requestId,
      executionContext: mutableExecutionContext,
      idOs: input.item.idOs,
      contatoWhatsapp: contact.contatoWhatsapp,
    });

    if (registerResult.status === "success") {
      log.info(
        "CSAT child step completed",
        buildChildStepLogContext(input, "register-success-event", {
          contatoWhatsapp: contact.contatoWhatsapp,
          attempt,
          recordedAt: registerResult.recordedAt,
        }),
      );

      return {
        requestId: input.requestId,
        status: "service-order-success-event-recorded",
        item: input.item,
        contact,
        recordedAt: registerResult.recordedAt,
      };
    }

    log.warn(
      "CSAT child step returned failure",
      buildChildStepLogContext(input, "register-success-event", {
        contatoWhatsapp: contact.contatoWhatsapp,
        attempt,
        failureType: registerResult.failureType,
        message: registerResult.message,
      }),
    );

    if (
      registerResult.failureType !== "transient" ||
      attempt === REGISTER_SUCCESS_EVENT_MAX_ATTEMPTS
    ) {
      return failRegisterSuccessEventOnServiceOrder(input, contact, registerResult, attempt);
    }

    await sleep(REGISTER_SUCCESS_EVENT_RETRY_DELAY);
  }

  throw ApplicationFailure.nonRetryable(
    `CSAT child workflow exhausted success event registration retries for service order ${input.item.idOs}`,
    "CSAT_REGISTER_SUCCESS_EVENT_UNREACHABLE_STATE",
  );
}

async function closeCycleAfterContactFailure(
  input: CsatProcessSurveyItemWorkflowInput,
  mutableExecutionContext: CsatMutableActivityExecutionContext,
  closeCycleInput: Omit<CsatCloseCycleAfterContactFailureInput, "idOs">,
): Promise<CsatProcessSurveyItemWorkflowResult> {
  return forwardServiceOrderAfterFailure(input, mutableExecutionContext, {
    step: "find-whatsapp-contact",
    failureMessage: closeCycleInput.motivoFalha,
  });
}

async function forwardServiceOrderAfterFailure(
  input: CsatProcessSurveyItemWorkflowInput,
  mutableExecutionContext: CsatMutableActivityExecutionContext,
  failureInput: ForwardServiceOrderAfterFailureInput,
): Promise<CsatProcessSurveyItemWorkflowResult> {
  let forwardResult: Awaited<ReturnType<typeof forwardServiceOrderOnFailureActivity>>;

  try {
    forwardResult = await forwardServiceOrderOnFailureActivity({
      requestId: input.requestId,
      executionContext: mutableExecutionContext,
      idOs: input.item.idOs,
      failureMessage: failureInput.failureMessage,
    });
  } catch (error) {
    return failForwardServiceOrderActivityExecution(input, failureInput, error);
  }

  if (forwardResult.status === "failed") {
    return failForwardServiceOrderResult(input, failureInput, forwardResult);
  }

  log.info(
    "CSAT child step completed",
    buildChildStepLogContext(input, "forward-service-order-on-failure", {
      failedStep: failureInput.step,
      failureMessage: failureInput.failureMessage,
      forwardedToSectorId: forwardResult.forwardedToSectorId,
    }),
  );

  return {
    requestId: input.requestId,
    status: "service-order-forwarded-on-failure",
    item: input.item,
    failureMessage: failureInput.failureMessage,
    forwardedToSectorId: forwardResult.forwardedToSectorId,
  };
}

function classifyRetriedActivityFailure(error: unknown): "permanent" | "terminal" {
  const workflowError = typeof error === "object" && error !== null ? error : null;
  const causeError = findRootApplicationFailure(error);

  if (causeError !== null) {
    return causeError.nonRetryable || causeError.type === "PermanentIntegrationError"
      ? "permanent"
      : "terminal";
  }

  if (workflowError instanceof ApplicationFailure) {
    return workflowError.nonRetryable || workflowError.type === "PermanentIntegrationError"
      ? "permanent"
      : "terminal";
  }

  return "terminal";
}

function failForwardServiceOrderStep(
  input: CsatProcessSurveyItemWorkflowInput,
  failureInput: ForwardServiceOrderAfterFailureInput,
  details: string,
  failureCode: string,
  nonRetryable: boolean,
  cause?: Error,
): never {
  log.error(
    "CSAT child step failed terminally",
    buildChildStepLogContext(input, "forward-service-order-on-failure", {
      failedStep: failureInput.step,
      failureMessage: failureInput.failureMessage,
      details,
    }),
  );

  throw ApplicationFailure.create({
    message:
      `CSAT child workflow failed to forward service order ${input.item.idOs} ` +
      `after ${failureInput.step}: ${details}`,
    type: failureCode,
    nonRetryable,
    ...(cause === undefined ? {} : { cause }),
  });
}

function failSendCsatMessageResult(
  input: CsatProcessSurveyItemWorkflowInput,
  contact: CsatWhatsappContact,
  result: SendCsatMessageActivityFailureResult,
): never {
  log.error(
    "CSAT child step failed terminally",
    buildChildStepLogContext(input, "send-csat-message", {
      contatoWhatsapp: contact.contatoWhatsapp,
      failureType: result.failureType,
      message: result.message,
    }),
  );

  throw ApplicationFailure.create({
    message:
      `CSAT child workflow could not confirm the WhatsApp delivery for service order ` +
      `${input.item.idOs}: ${result.message}`,
    type: buildSendCsatMessageFailureCode(result.failureType),
    nonRetryable: result.failureType === "permanent",
  });
}

function failSendCsatMessageActivityExecution(
  input: CsatProcessSurveyItemWorkflowInput,
  contact: CsatWhatsappContact,
  error: unknown,
): never {
  const failureType = classifyRetriedActivityFailure(error);
  const failureMessage = readExecutionFailureMessage(
    error,
    "CSAT send message activity failed with an unknown error",
  );

  log.error(
    "CSAT child step exhausted retries",
    buildChildStepLogContext(input, "send-csat-message", {
      contatoWhatsapp: contact.contatoWhatsapp,
      failureType,
      message: failureMessage,
    }),
  );

  throw ApplicationFailure.create({
    message:
      `CSAT child workflow exhausted the send message activity for service order ` +
      `${input.item.idOs}: ${failureMessage}`,
    type:
      failureType === "permanent"
        ? "CSAT_SEND_MESSAGE_ACTIVITY_PERMANENT_FAILURE"
        : "CSAT_SEND_MESSAGE_ACTIVITY_RETRY_EXHAUSTED",
    nonRetryable: failureType === "permanent",
    ...(error instanceof Error ? { cause: error } : {}),
  });
}

function buildSendCsatMessageFailureCode(
  failureType: SendCsatMessageActivityFailureResult["failureType"],
): string {
  switch (failureType) {
    case "pending":
      return "CSAT_SEND_MESSAGE_PENDING_CONFIRMATION";
    case "response-error":
      return "CSAT_SEND_MESSAGE_RESPONSE_ERROR";
    case "html":
      return "CSAT_SEND_MESSAGE_HTML_RESPONSE";
    case "permanent":
      return "CSAT_SEND_MESSAGE_PERMANENT_FAILURE";
  }
}

function failForwardServiceOrderResult(
  input: CsatProcessSurveyItemWorkflowInput,
  failureInput: ForwardServiceOrderAfterFailureInput,
  result: ForwardServiceOrderOnFailureFailureResult,
): never {
  return failForwardServiceOrderStep(
    input,
    failureInput,
    result.message,
    buildForwardServiceOrderFailureCode(result.failureType),
    result.failureType === "permanent",
  );
}

function failForwardServiceOrderActivityExecution(
  input: CsatProcessSurveyItemWorkflowInput,
  failureInput: ForwardServiceOrderAfterFailureInput,
  error: unknown,
): never {
  const failureType = classifyRetriedActivityFailure(error);
  const failureMessage = readExecutionFailureMessage(
    error,
    "CSAT forward service order activity failed with an unknown error",
  );

  return failForwardServiceOrderStep(
    input,
    failureInput,
    failureMessage,
    failureType === "permanent"
      ? "CSAT_FORWARD_SERVICE_ORDER_ACTIVITY_PERMANENT_FAILURE"
      : "CSAT_FORWARD_SERVICE_ORDER_ACTIVITY_RETRY_EXHAUSTED",
    failureType === "permanent",
    error instanceof Error ? error : undefined,
  );
}

function buildForwardServiceOrderFailureCode(
  failureType: ForwardServiceOrderOnFailureFailureResult["failureType"],
): string {
  switch (failureType) {
    case "pending":
      return "CSAT_FORWARD_SERVICE_ORDER_PENDING_CONFIRMATION";
    case "response-error":
      return "CSAT_FORWARD_SERVICE_ORDER_RESPONSE_ERROR";
    case "html":
      return "CSAT_FORWARD_SERVICE_ORDER_HTML_RESPONSE";
    case "permanent":
      return "CSAT_FORWARD_SERVICE_ORDER_PERMANENT_FAILURE";
  }
}

function failRegisterSuccessEventOnServiceOrder(
  input: CsatProcessSurveyItemWorkflowInput,
  contact: CsatWhatsappContact,
  result: Extract<RegisterCsatSuccessEventOnOsActivityResult, { status: "failure" }>,
  attempt: number,
): never {
  log.error(
    "CSAT child step failed terminally",
    buildChildStepLogContext(input, "register-success-event", {
      contatoWhatsapp: contact.contatoWhatsapp,
      attempt,
      failureType: result.failureType,
      message: result.message,
    }),
  );

  throw ApplicationFailure.nonRetryable(
    `CSAT child workflow failed to register success event on service order ${input.item.idOs}: ${result.message}`,
    buildRegisterSuccessEventFailureCode(result, attempt),
  );
}

function buildRegisterSuccessEventFailureCode(
  result: Extract<RegisterCsatSuccessEventOnOsActivityResult, { status: "failure" }>,
  attempt: number,
): string {
  if (result.failureType === "transient" && attempt >= REGISTER_SUCCESS_EVENT_MAX_ATTEMPTS) {
    return "CSAT_REGISTER_SUCCESS_EVENT_RETRY_EXHAUSTED";
  }

  if (result.failureType === "permanent") {
    return "CSAT_REGISTER_SUCCESS_EVENT_PERMANENT_FAILURE";
  }

  if (result.failureType === "response-error") {
    return "CSAT_REGISTER_SUCCESS_EVENT_RESPONSE_ERROR";
  }

  if (result.failureType === "html") {
    return "CSAT_REGISTER_SUCCESS_EVENT_HTML_RESPONSE";
  }

  return "CSAT_REGISTER_SUCCESS_EVENT_TERMINAL_FAILURE";
}

function readExecutionFailureMessage(error: unknown, fallback: string): string {
  return readWorkflowFailureMessage(error, fallback);
}

function buildMutableExecutionContext(
  runtimePolicy: ReturnType<typeof normalizeAutomationRuntimePolicy>,
): CsatMutableActivityExecutionContext {
  const info = workflowInfo();

  return {
    workflowId: info.workflowId,
    workflowName: info.workflowType,
    idempotencyScope: runtimePolicy.idempotencyScope,
  };
}

function buildChildLogContext(
  input: CsatProcessSurveyItemWorkflowInput,
): Record<string, number | string | null> {
  const info = workflowInfo();

  return {
    requestId: input.requestId,
    workflowId: info.workflowId,
    idCliente: input.item.idCliente,
    idContrato: input.item.idContrato,
    idOs: input.item.idOs,
    idFilial: input.item.idFilial,
  };
}

function buildChildStepLogContext(
  input: CsatProcessSurveyItemWorkflowInput,
  step: CsatChildWorkflowStep,
  details: Record<string, number | string | null | undefined>,
): Record<string, number | string | null> {
  return {
    ...buildChildLogContext(input),
    step,
    ...stripUndefinedValues(details),
  };
}

function stripUndefinedValues(
  details: Record<string, number | string | null | undefined>,
): Record<string, number | string | null> {
  const normalizedDetails: Record<string, number | string | null> = {};

  for (const [key, value] of Object.entries(details)) {
    if (value !== undefined) {
      normalizedDetails[key] = value;
    }
  }

  return normalizedDetails;
}
