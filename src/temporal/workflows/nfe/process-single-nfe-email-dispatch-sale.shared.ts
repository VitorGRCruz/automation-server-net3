import type { SendSmtpEmailActivityResult } from "../../activities/shared/send-smtp-email.activity.js";
import {
  NFE_EMAIL_CONTEXT_PERMANENT_FAILURE_MESSAGE,
  NFE_EMAIL_CONTEXT_TRANSIENT_FAILURE_MESSAGE,
  NFE_EMAIL_PDF_TRANSIENT_FAILURE_MESSAGE,
  NFE_EMAIL_SMTP_TRANSIENT_FAILURE_MESSAGE,
  NFE_EMAIL_TEMPLATE_RENDER_TRANSIENT_FAILURE_MESSAGE,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import {
  classifyProcessingActivityFailure,
  readWorkflowErrorMessage,
} from "./process-nfe-email-dispatch-sales.shared.js";

export type NfeEmailDispatchProcessingStage = "erp" | "ixc" | "render" | "smtp";

export function classifyUnhandledProcessingFailure(
  processingStage: NfeEmailDispatchProcessingStage,
  error: unknown,
): {
  finalStatus: "FAILED_TRANSIENT" | "FAILED_FINAL";
  errorMessage: string;
} {
  const failure = classifyProcessingActivityFailure(error);
  const technicalMessage = readWorkflowErrorMessage(error);

  switch (processingStage) {
    case "erp":
      return {
        finalStatus: failure.finalStatus,
        errorMessage:
          failure.finalStatus === "FAILED_FINAL"
            ? NFE_EMAIL_CONTEXT_PERMANENT_FAILURE_MESSAGE
            : NFE_EMAIL_CONTEXT_TRANSIENT_FAILURE_MESSAGE,
      };
    case "ixc":
      return {
        finalStatus: failure.finalStatus,
        errorMessage:
          failure.finalStatus === "FAILED_FINAL"
            ? technicalMessage
            : NFE_EMAIL_PDF_TRANSIENT_FAILURE_MESSAGE,
      };
    case "render":
      return {
        finalStatus: failure.finalStatus,
        errorMessage:
          failure.finalStatus === "FAILED_FINAL"
            ? technicalMessage
            : NFE_EMAIL_TEMPLATE_RENDER_TRANSIENT_FAILURE_MESSAGE,
      };
    case "smtp":
      return {
        finalStatus: failure.finalStatus,
        errorMessage:
          failure.finalStatus === "FAILED_FINAL"
            ? technicalMessage
            : NFE_EMAIL_SMTP_TRANSIENT_FAILURE_MESSAGE,
      };
  }
}

export function resolveSmtpResultToFinalization(
  smtpResult: SendSmtpEmailActivityResult,
): {
  status: "SENT" | "FAILED_FINAL" | "DELIVERY_UNKNOWN";
  errorMessage?: string;
} {
  if (smtpResult.status === "success") {
    return {
      status: "SENT",
    };
  }

  if (smtpResult.failureType === "pending") {
    return {
      status: "DELIVERY_UNKNOWN",
      errorMessage: smtpResult.message,
    };
  }

  return {
    status: "FAILED_FINAL",
    errorMessage: smtpResult.message,
  };
}

export function buildSmtpIdempotencyKey(
  nfeEmailDispatchSaleId: number,
  attemptCount: number,
): string {
  return `nfe-email-dispatch-sale-${nfeEmailDispatchSaleId}-attempt-${attemptCount}`;
}

export function buildNfeAttachmentFilename(numeroNf: string): string {
  const sanitizedNumeroNf = numeroNf
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `nfe-${sanitizedNumeroNf || "sem-numero"}.pdf`;
}
