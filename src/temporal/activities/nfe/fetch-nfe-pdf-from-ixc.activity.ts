import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  FetchNfePdfFromIxcActivityInput,
  FetchNfePdfFromIxcResult,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import { NFE_EMAIL_PDF_INVALID_MESSAGE } from "../../../domain/nfe/nfe-email-dispatch.types.js";
import {
  PermanentIntegrationError,
  TransientIntegrationError,
  isIntegrationError,
} from "../../../domain/shared/integration-error.types.js";
import { nfeEmailDispatchConfig } from "../../../infra/config/nfe-email-dispatch.config.js";
import { createIxcClient } from "../../../integrations/ixc/ixc.client.js";
import type { PrintInvoicePdfResponse } from "../../../integrations/ixc/ixc.types.js";

const PDF_SIGNATURE = "%PDF";
const PDF_DATA_URL_PREFIX = /^data:application\/pdf;base64,/i;
const HTML_TAG_PATTERN = /<[^>]*>/g;
const BASE64_BLOCK_PATTERN = /[A-Za-z0-9+/=\s]{80,}/g;

interface NodeErrorWithCode {
  code?: string;
}

export async function fetchNfePdfFromIxcActivity(
  input: FetchNfePdfFromIxcActivityInput,
): Promise<FetchNfePdfFromIxcResult> {
  const validatedInput = validateFetchNfePdfFromIxcActivityInput(input);
  const ixcClient = createIxcClient();

  try {
    const response = await ixcClient.printInvoicePdf({
      saleId: validatedInput.erpSaleId,
    });
    const rawPayload = readRawPdfPayload(response);
    const pdfBase64 = extractPdfBase64(rawPayload);
    const pdfBuffer = decodePdfBase64(pdfBase64);
    const pdfPath = await savePdfBuffer(validatedInput, pdfBuffer);

    return { pdfPath };
  } catch (error) {
    throw normalizeFetchNfePdfFromIxcError(error);
  }
}

function validateFetchNfePdfFromIxcActivityInput(
  input: FetchNfePdfFromIxcActivityInput,
): FetchNfePdfFromIxcActivityInput {
  if (
    !Number.isInteger(input.nfeEmailDispatchSaleId) ||
    input.nfeEmailDispatchSaleId <= 0
  ) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_SALE_ID",
      message: "NF-e PDF activity requires a positive nfeEmailDispatchSaleId",
    });
  }

  if (!Number.isInteger(input.erpSaleId) || input.erpSaleId <= 0) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_ERP_SALE_ID",
      message: "NF-e PDF activity requires a positive erpSaleId",
    });
  }

  if (!Number.isInteger(input.attemptCount) || input.attemptCount <= 0) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_ATTEMPT_COUNT",
      message: "NF-e PDF activity requires a positive attemptCount",
    });
  }

  return {
    nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
    erpSaleId: input.erpSaleId,
    attemptCount: input.attemptCount,
  };
}

function readRawPdfPayload(response: PrintInvoicePdfResponse): string {
  if (response.responseType === "html") {
    return response.bodyText;
  }

  if (typeof response.body === "string") {
    return response.body;
  }

  throw new PermanentIntegrationError({
    code: "NFE_EMAIL_DISPATCH_INVALID_IXC_PDF_RESPONSE",
    message: NFE_EMAIL_PDF_INVALID_MESSAGE,
  });
}

function extractPdfBase64(rawPayload: string): string {
  const trimmedPayload = rawPayload.trim();

  if (trimmedPayload.length === 0) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_EMPTY_IXC_PDF_RESPONSE",
      message: NFE_EMAIL_PDF_INVALID_MESSAGE,
    });
  }

  const candidates = collectBase64Candidates(trimmedPayload);
  let fallbackCandidate: string | null = null;

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeBase64Candidate(candidate);

    if (normalizedCandidate === null) {
      continue;
    }

    if (fallbackCandidate === null) {
      fallbackCandidate = normalizedCandidate;
    }

    if (normalizedCandidate.startsWith("JVBERi0")) {
      return normalizedCandidate;
    }
  }

  if (fallbackCandidate !== null) {
    return fallbackCandidate;
  }

  throw new PermanentIntegrationError({
    code: "NFE_EMAIL_DISPATCH_INVALID_IXC_PDF_BASE64",
    message: NFE_EMAIL_PDF_INVALID_MESSAGE,
  });
}

function collectBase64Candidates(rawPayload: string): string[] {
  const strippedHtmlPayload = stripHtml(rawPayload);
  const matches = [
    ...rawPayload.matchAll(BASE64_BLOCK_PATTERN),
    ...strippedHtmlPayload.matchAll(BASE64_BLOCK_PATTERN),
  ];

  return [
    rawPayload,
    strippedHtmlPayload,
    ...matches
      .map((match) => match[0])
      .filter((candidate): candidate is string => candidate !== undefined),
  ];
}

function stripHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&#13;/gi, "\n")
    .replace(/&#10;/gi, "\n")
    .replace(HTML_TAG_PATTERN, " ");
}

function normalizeBase64Candidate(value: string): string | null {
  const normalizedValue = value
    .trim()
    .replace(PDF_DATA_URL_PREFIX, "")
    .replace(/^["']+|["']+$/g, "")
    .replace(/\s+/g, "");

  if (!looksLikeBase64(normalizedValue)) {
    return null;
  }

  return normalizedValue;
}

function looksLikeBase64(value: string): boolean {
  return (
    value.length >= 16 &&
    value.length % 4 !== 1 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}

function decodePdfBase64(pdfBase64: string): Buffer {
  const pdfBuffer = Buffer.from(pdfBase64, "base64");

  if (pdfBuffer.length === 0) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_EMPTY_IXC_PDF_BUFFER",
      message: NFE_EMAIL_PDF_INVALID_MESSAGE,
    });
  }

  if (pdfBuffer.subarray(0, 4).toString("utf8") !== PDF_SIGNATURE) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_IXC_PDF_HEADER",
      message: NFE_EMAIL_PDF_INVALID_MESSAGE,
    });
  }

  return pdfBuffer;
}

async function savePdfBuffer(
  input: FetchNfePdfFromIxcActivityInput,
  pdfBuffer: Buffer,
): Promise<string> {
  await mkdir(nfeEmailDispatchConfig.pdfTmpDir, { recursive: true });

  const randomSuffix = randomBytes(3).toString("hex");
  const filename = `job-${input.nfeEmailDispatchSaleId}-attempt-${input.attemptCount}-${randomSuffix}.pdf`;
  const pdfPath = join(nfeEmailDispatchConfig.pdfTmpDir, filename);

  await writeFile(pdfPath, pdfBuffer);

  return pdfPath;
}

function normalizeFetchNfePdfFromIxcError(error: unknown): Error {
  if (isIntegrationError(error)) {
    return error;
  }

  const code = readNodeErrorCode(error);

  if (
    code === "ENOENT" ||
    code === "EACCES" ||
    code === "EPERM" ||
    code === "ENOSPC"
  ) {
    return new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_PDF_TMP_WRITE_REJECTED",
      message: "NF-e PDF activity could not persist the PDF in the configured temporary directory",
      cause: error,
    });
  }

  return new TransientIntegrationError({
    code: "NFE_EMAIL_DISPATCH_FETCH_PDF_FAILED",
    message: "NF-e PDF fetch failed with an unknown transient error",
    cause: error,
  });
}

function readNodeErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const { code } = error as NodeErrorWithCode;

  return typeof code === "string" ? code : null;
}
