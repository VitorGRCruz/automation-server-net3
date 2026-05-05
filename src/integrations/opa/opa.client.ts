import type { IncomingHttpHeaders } from "node:http";
import {
  PermanentIntegrationError,
  TransientIntegrationError,
  isIntegrationError,
} from "../../domain/shared/integration-error.types.js";
import { executeSharedHttpRequest } from "../../infra/http/shared-http-client.js";
import { opaConfig } from "../../infra/config/opa.config.js";
import type {
  OpaApiResponse,
  OpaClient,
  OpaClientConfig,
  OpaFindCustomerRequest,
  OpaFindCustomerContactsRequest,
  OpaFindCustomerResponse,
} from "./opa.types.js";

const TRANSIENT_HTTP_STATUS_CODES = new Set([408, 429, 502, 503, 504]);
const PERMANENT_HTTP_STATUS_CODES = new Set([400, 401, 403, 404, 405, 406, 409, 410, 415, 422]);
const TRANSIENT_FETCH_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

interface ErrorWithCode {
  code?: string;
  cause?: unknown;
}

export function createOpaClient(config: OpaClientConfig = opaConfig): OpaClient {
  return {
    async probe(): Promise<void> {
      const response = await callOpaApi(config, "/cliente", {
        filter: {
          id: 0,
        },
      });

      if (response.responseType === "html") {
        throw new PermanentIntegrationError({
          code: "OPA_HEALTHCHECK_INVALID_RESPONSE",
          message: "OPA connectivity probe returned HTML instead of JSON",
        });
      }
    },
    async findCustomerById(input: OpaFindCustomerRequest): Promise<OpaFindCustomerResponse> {
      const response = await callOpaApi(config, "/cliente", {
        filter: {
          id: input.idCliente,
        },
      });

      return response;
    },
    async findCustomerContactsByCustomerId(
      input: OpaFindCustomerContactsRequest,
    ): Promise<OpaApiResponse> {
      const response = await callOpaApi(config, "/contato", {
        filter: {
          cli_emp: input.opaIdCliente,
        },
      });

      return response;
    },
  };
}

async function callOpaApi(
  config: OpaClientConfig,
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<OpaApiResponse> {
  const response = await executeOpaRequest(config, endpoint, payload);
  const contentType = response.headers["content-type"] ?? null;
  const bodyText = response.bodyText;

  try {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw classifyOpaHttpError(response.statusCode, contentType, bodyText);
    }

    if (isHtmlResponse(contentType, bodyText)) {
      return {
        responseType: "html",
        httpStatus: response.statusCode,
        contentType,
        bodyText,
      };
    }

    if (!isJsonContentType(contentType)) {
      throw new PermanentIntegrationError({
        code: "OPA_CUSTOMER_LOOKUP_INVALID_CONTENT_TYPE",
        message: "OPA customer lookup returned an unsupported content type",
      });
    }

    try {
      return {
        responseType: "json",
        httpStatus: response.statusCode,
        contentType,
        body: JSON.parse(bodyText) as unknown,
      };
    } catch (error) {
      throw new PermanentIntegrationError({
        code: "OPA_CUSTOMER_LOOKUP_INVALID_JSON",
        message: "OPA customer lookup returned invalid JSON",
        cause: error,
      });
    }
  } catch (error) {
    throw normalizeOpaClientError(error);
  }
}

interface OpaRawResponse {
  statusCode: number;
  headers: IncomingHttpHeaders;
  bodyText: string;
}

async function executeOpaRequest(
  config: OpaClientConfig,
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<OpaRawResponse> {
  const url = new URL(endpoint.replace(/^\/+/, ""), ensureTrailingSlash(config.baseUrl));
  const requestBody = JSON.stringify(payload);

  return executeSharedHttpRequest({
    url,
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(requestBody)),
    },
    body: requestBody,
    timeoutMs: config.timeoutMs,
  });
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function isJsonContentType(contentType: string | null): boolean {
  return contentType !== null && contentType.toLowerCase().includes("application/json");
}

function isHtmlResponse(contentType: string | null, bodyText: string): boolean {
  if (contentType !== null && contentType.toLowerCase().includes("text/html")) {
    return true;
  }

  return /^\s*<!doctype html\b/i.test(bodyText) || /^\s*<html\b/i.test(bodyText);
}

function classifyOpaHttpError(
  statusCode: number,
  contentType: string | null,
  bodyText: string,
): Error {
  if (TRANSIENT_HTTP_STATUS_CODES.has(statusCode)) {
    return new TransientIntegrationError({
      code: "OPA_CUSTOMER_LOOKUP_UNAVAILABLE",
      message: `OPA customer lookup failed temporarily with HTTP ${statusCode}`,
    });
  }

  if (PERMANENT_HTTP_STATUS_CODES.has(statusCode) || isHtmlResponse(contentType, bodyText)) {
    return new PermanentIntegrationError({
      code: "OPA_CUSTOMER_LOOKUP_REQUEST_REJECTED",
      message: `OPA customer lookup failed permanently with HTTP ${statusCode}`,
    });
  }

  if (statusCode >= 500) {
    return new TransientIntegrationError({
      code: "OPA_CUSTOMER_LOOKUP_UNAVAILABLE",
      message: `OPA customer lookup failed temporarily with HTTP ${statusCode}`,
    });
  }

  return new PermanentIntegrationError({
    code: "OPA_CUSTOMER_LOOKUP_REQUEST_REJECTED",
    message: `OPA customer lookup failed permanently with HTTP ${statusCode}`,
  });
}

function normalizeOpaClientError(error: unknown): Error {
  if (isIntegrationError(error)) {
    return error;
  }

  if (isAbortError(error) || isTransientFetchError(error)) {
    return new TransientIntegrationError({
      code: "OPA_CUSTOMER_LOOKUP_TIMEOUT",
      message: "OPA customer lookup timed out or failed with a transient network error",
      cause: error,
    });
  }

  return new TransientIntegrationError({
    code: "OPA_CUSTOMER_LOOKUP_UNKNOWN_FAILURE",
    message: "OPA customer lookup failed with an unknown transient condition",
    cause: error,
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isTransientFetchError(error: unknown): boolean {
  const code = readErrorCode(error);

  if (code !== null && TRANSIENT_FETCH_ERROR_CODES.has(code)) {
    return true;
  }

  const nestedCode = readNestedErrorCode(error);

  return nestedCode !== null && TRANSIENT_FETCH_ERROR_CODES.has(nestedCode);
}

function readErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const { code } = error as ErrorWithCode;

  return typeof code === "string" ? code : null;
}

function readNestedErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  return readErrorCode((error as ErrorWithCode).cause);
}
