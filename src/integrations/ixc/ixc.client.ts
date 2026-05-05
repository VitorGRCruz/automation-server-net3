import {
  PermanentIntegrationError,
  TransientIntegrationError,
  isIntegrationError,
} from "../../domain/shared/integration-error.types.js";
import { executeSharedHttpRequest } from "../../infra/http/shared-http-client.js";
import { ixcConfig } from "../../infra/config/ixc.config.js";
import type {
  ChangeServiceOrderSectorRequest,
  ChangeServiceOrderSectorResponse,
  CreateServiceOrderRequest,
  CreateServiceOrderResponse,
  IxcClient,
  IxcClientConfig,
  IxcApiResponse,
  RegisterServiceOrderMessageRequest,
  RegisterServiceOrderMessageResponse,
  PrintInvoicePdfRequest,
  PrintInvoicePdfResponse,
  SendWhatsappOmnichannelMessageRequest,
  SendWhatsappOmnichannelMessageResponse,
} from "./ixc.types.js";

const TRANSIENT_HTTP_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
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

interface IxcOperationDescriptor {
  endpoint: string;
  errorCodePrefix: string;
  operationLabel: string;
}

const CHANGE_SERVICE_ORDER_SECTOR_OPERATION = {
  endpoint: "su_oss_chamado_alterar_setor",
  errorCodePrefix: "IXC_CHANGE_SERVICE_ORDER_SECTOR",
  operationLabel: "IXC change service order sector",
} as const satisfies IxcOperationDescriptor;

const CREATE_SERVICE_ORDER_OPERATION = {
  endpoint: "su_oss_chamado",
  errorCodePrefix: "IXC_CREATE_SERVICE_ORDER",
  operationLabel: "IXC create service order",
} as const satisfies IxcOperationDescriptor;

const SEND_WHATSAPP_OMNICHANNEL_MESSAGE_OPERATION = {
  endpoint: "botaoAjax_22282",
  errorCodePrefix: "IXC_SEND_WHATSAPP_OMNICHANNEL_MESSAGE",
  operationLabel: "IXC send WhatsApp OmniChannel message",
} as const satisfies IxcOperationDescriptor;

const REGISTER_SERVICE_ORDER_MESSAGE_OPERATION = {
  endpoint: "su_oss_chamado_mensagem",
  errorCodePrefix: "IXC_REGISTER_SERVICE_ORDER_MESSAGE",
  operationLabel: "IXC register service order message",
} as const satisfies IxcOperationDescriptor;

const PRINT_INVOICE_PDF_OPERATION = {
  endpoint: "imprimir_nota",
  errorCodePrefix: "IXC_PRINT_INVOICE_PDF",
  operationLabel: "IXC print invoice PDF",
} as const satisfies IxcOperationDescriptor;

const IXC_CONNECTIVITY_PROBE_OPERATION = {
  endpoint: CHANGE_SERVICE_ORDER_SECTOR_OPERATION.endpoint,
  errorCodePrefix: "IXC_HEALTHCHECK",
  operationLabel: "IXC connectivity probe",
} as const satisfies IxcOperationDescriptor;

export function createIxcClient(config: IxcClientConfig = ixcConfig): IxcClient {
  return {
    async probe(): Promise<void> {
      const response = await executeIxcProbeRequest(
        config,
        IXC_CONNECTIVITY_PROBE_OPERATION,
      );

      if (response.status === 401 || response.status === 403) {
        throw new PermanentIntegrationError({
          code: "IXC_HEALTHCHECK_ACCESS_DENIED",
          message: `IXC connectivity probe was rejected with HTTP ${response.status}`,
        });
      }

      if (response.status === 404) {
        throw new PermanentIntegrationError({
          code: "IXC_HEALTHCHECK_ENDPOINT_NOT_FOUND",
          message: "IXC connectivity probe endpoint was not found",
        });
      }

      if (response.status >= 500) {
        throw new TransientIntegrationError({
          code: "IXC_HEALTHCHECK_UNAVAILABLE",
          message: `IXC connectivity probe failed temporarily with HTTP ${response.status}`,
        });
      }

      if (isHtmlResponse(response.contentType, response.bodyText)) {
        throw new PermanentIntegrationError({
          code: "IXC_HEALTHCHECK_INVALID_RESPONSE",
          message: "IXC connectivity probe returned HTML instead of a lightweight API response",
        });
      }

      if (
        response.status >= 200 &&
        response.status < 300
      ) {
        return;
      }

      if (
        response.status === 400 ||
        response.status === 405 ||
        response.status === 415 ||
        response.status === 422
      ) {
        return;
      }

      throw new PermanentIntegrationError({
        code: "IXC_HEALTHCHECK_REQUEST_REJECTED",
        message: `IXC connectivity probe failed permanently with HTTP ${response.status}`,
      });
    },
    async changeServiceOrderSector(
      input: ChangeServiceOrderSectorRequest,
    ): Promise<ChangeServiceOrderSectorResponse> {
      return callIxcApi(config, CHANGE_SERVICE_ORDER_SECTOR_OPERATION, {
        id_chamado: String(input.idOs),
        id_setor: input.sectorId,
        mensagem: input.message,
        status: input.status,
      });
    },
    async createServiceOrder(
      input: CreateServiceOrderRequest,
    ): Promise<CreateServiceOrderResponse> {
      return callIxcApi(config, CREATE_SERVICE_ORDER_OPERATION, {
        tipo: input.type,
        id_assunto: input.serviceOrderSubjectId,
        id_cliente: String(input.idCliente),
        id_filial: String(input.idFilial),
        id_contrato_kit: String(input.idContratoKit),
        origem_endereco: input.addressOrigin,
        prioridade: input.priority,
        setor: input.sectorId,
        mensagem: input.message,
        status: input.status,
        melhor_horario_agenda: input.bestScheduleWindow,
        liberado: input.released,
        id_receber: String(input.idReceber),
        id_cidade: String(input.idCidade),
      });
    },
    async sendWhatsappOmnichannelMessage(
      input: SendWhatsappOmnichannelMessageRequest,
    ): Promise<SendWhatsappOmnichannelMessageResponse> {
      return callIxcApi(config, SEND_WHATSAPP_OMNICHANNEL_MESSAGE_OPERATION, {
        tipo_envio_mensagem: "omnichannel",
        celular: input.contatoWhatsapp,
        id_cliente: String(input.idCliente),
        msg_omnichannel: input.messageTemplateId,
      });
    },
    async registerServiceOrderMessage(
      input: RegisterServiceOrderMessageRequest,
    ): Promise<RegisterServiceOrderMessageResponse> {
      return callIxcApi(config, REGISTER_SERVICE_ORDER_MESSAGE_OPERATION, {
        id_chamado: String(input.idOs),
        mensagem: input.message,
        status: input.status,
        id_evento: input.eventId,
        tipo_cobranca: input.billingType,
        finaliza_processo: input.finalizeProcess,
      });
    },
    async printInvoicePdf(
      input: PrintInvoicePdfRequest,
    ): Promise<PrintInvoicePdfResponse> {
      return callIxcApi(config, PRINT_INVOICE_PDF_OPERATION, {
        id: String(input.saleId),
        base64: "S",
      });
    },
  };
}

interface IxcProbeResponse {
  status: number;
  contentType: string | null;
  bodyText: string;
}

async function callIxcApi(
  config: IxcClientConfig,
  operation: IxcOperationDescriptor,
  payload: Record<string, string>,
): Promise<IxcApiResponse> {
  const requestBody = JSON.stringify(payload);

  try {
    const response = await executeSharedHttpRequest({
      url: new URL(buildIxcUrl(config.baseUrl, operation.endpoint)),
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${encodeIxcBasicAuthCredential(config.basicAuthCredential)}`,
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(requestBody)),
      },
      body: requestBody,
      timeoutMs: config.timeoutMs,
    });
    const contentType = readHeaderValue(response.headers["content-type"]);
    const bodyText = response.bodyText;

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw classifyIxcHttpError(operation, response.statusCode, contentType, bodyText);
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
        code: `${operation.errorCodePrefix}_INVALID_CONTENT_TYPE`,
        message: `${operation.operationLabel} returned an unsupported content type`,
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
        code: `${operation.errorCodePrefix}_INVALID_JSON`,
        message: `${operation.operationLabel} returned invalid JSON`,
        cause: error,
      });
    }
  } catch (error) {
    throw normalizeIxcClientError(operation, error);
  }
}

async function executeIxcProbeRequest(
  config: IxcClientConfig,
  operation: IxcOperationDescriptor,
): Promise<IxcProbeResponse> {
  try {
    const response = await executeSharedHttpRequest({
      url: new URL(buildIxcUrl(config.baseUrl, operation.endpoint)),
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${encodeIxcBasicAuthCredential(config.basicAuthCredential)}`,
      },
      timeoutMs: config.timeoutMs,
    });

    return {
      status: response.statusCode,
      contentType: readHeaderValue(response.headers["content-type"]),
      bodyText: response.bodyText,
    };
  } catch (error) {
    throw normalizeIxcClientError(operation, error);
  }
}

function buildIxcUrl(baseUrl: string, endpoint: string): string {
  return new URL(endpoint.replace(/^\/+/, ""), ensureTrailingSlash(baseUrl)).toString();
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function encodeIxcBasicAuthCredential(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function readHeaderValue(header: string | string[] | undefined): string | null {
  if (typeof header === "string") {
    return header;
  }

  if (Array.isArray(header)) {
    return header[0] ?? null;
  }

  return null;
}

function isJsonContentType(contentType: string | null): boolean {
  if (contentType === null) {
    return false;
  }

  const normalizedContentType = contentType.toLowerCase();

  return (
    normalizedContentType.includes("application/json") ||
    normalizedContentType.includes("text/x-json")
  );
}

function isHtmlResponse(contentType: string | null, bodyText: string): boolean {
  if (contentType !== null && contentType.toLowerCase().includes("text/html")) {
    return true;
  }

  return /^\s*<!doctype html\b/i.test(bodyText) || /^\s*<html\b/i.test(bodyText);
}

function classifyIxcHttpError(
  operation: IxcOperationDescriptor,
  statusCode: number,
  contentType: string | null,
  bodyText: string,
): Error {
  if (TRANSIENT_HTTP_STATUS_CODES.has(statusCode)) {
    return new TransientIntegrationError({
      code: `${operation.errorCodePrefix}_UNAVAILABLE`,
      message: `${operation.operationLabel} failed temporarily with HTTP ${statusCode}`,
    });
  }

  if (PERMANENT_HTTP_STATUS_CODES.has(statusCode) || isHtmlResponse(contentType, bodyText)) {
    return new PermanentIntegrationError({
      code: `${operation.errorCodePrefix}_REQUEST_REJECTED`,
      message: `${operation.operationLabel} failed permanently with HTTP ${statusCode}`,
    });
  }

  if (statusCode >= 500) {
    return new TransientIntegrationError({
      code: `${operation.errorCodePrefix}_UNAVAILABLE`,
      message: `${operation.operationLabel} failed temporarily with HTTP ${statusCode}`,
    });
  }

  return new PermanentIntegrationError({
    code: `${operation.errorCodePrefix}_REQUEST_REJECTED`,
    message: `${operation.operationLabel} failed permanently with HTTP ${statusCode}`,
  });
}

function normalizeIxcClientError(operation: IxcOperationDescriptor, error: unknown): Error {
  if (isIntegrationError(error)) {
    return error;
  }

  if (isAbortError(error) || isTransientFetchError(error)) {
    return new TransientIntegrationError({
      code: `${operation.errorCodePrefix}_TIMEOUT`,
      message: `${operation.operationLabel} timed out or failed with a transient network error`,
      cause: error,
    });
  }

  return new TransientIntegrationError({
    code: `${operation.errorCodePrefix}_UNKNOWN_FAILURE`,
    message: `${operation.operationLabel} failed with an unknown transient condition`,
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
