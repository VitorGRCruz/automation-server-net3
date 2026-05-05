export interface IxcClientConfig {
  baseUrl: string;
  basicAuthCredential: string;
  timeoutMs: number;
}

export interface ChangeServiceOrderSectorRequest {
  idOs: number;
  sectorId: string;
  message: string;
  status: string;
}

export interface SendWhatsappOmnichannelMessageRequest {
  idCliente: number;
  contatoWhatsapp: string;
  messageTemplateId: string;
}

export interface CreateServiceOrderRequest {
  type: string;
  serviceOrderSubjectId: string;
  idCliente: number;
  idFilial: number;
  idContratoKit: number;
  addressOrigin: string;
  priority: string;
  sectorId: string;
  message: string;
  status: string;
  bestScheduleWindow: string;
  released: string;
  idReceber: number;
  idCidade: number;
}

export interface RegisterServiceOrderMessageRequest {
  idOs: number;
  message: string;
  status: string;
  eventId: string;
  billingType: string;
  finalizeProcess: string;
}

export interface PrintInvoicePdfRequest {
  saleId: number;
}

export interface IxcJsonResponse {
  responseType: "json";
  httpStatus: number;
  contentType: string | null;
  body: unknown;
}

export interface IxcHtmlResponse {
  responseType: "html";
  httpStatus: number;
  contentType: string | null;
  bodyText: string;
}

export type IxcApiResponse = IxcJsonResponse | IxcHtmlResponse;
export type ChangeServiceOrderSectorResponse = IxcApiResponse;
export type SendWhatsappOmnichannelMessageResponse = IxcApiResponse;
export type RegisterServiceOrderMessageResponse = IxcApiResponse;
export type CreateServiceOrderResponse = IxcApiResponse;
export type PrintInvoicePdfResponse = IxcApiResponse;

export interface IxcClient {
  probe(): Promise<void>;
  changeServiceOrderSector(
    input: ChangeServiceOrderSectorRequest,
  ): Promise<ChangeServiceOrderSectorResponse>;
  createServiceOrder(input: CreateServiceOrderRequest): Promise<CreateServiceOrderResponse>;
  sendWhatsappOmnichannelMessage(
    input: SendWhatsappOmnichannelMessageRequest,
  ): Promise<SendWhatsappOmnichannelMessageResponse>;
  registerServiceOrderMessage(
    input: RegisterServiceOrderMessageRequest,
  ): Promise<RegisterServiceOrderMessageResponse>;
  printInvoicePdf(input: PrintInvoicePdfRequest): Promise<PrintInvoicePdfResponse>;
}

export interface IxcMutationEnvelope {
  type?: unknown;
  message?: unknown;
  id?: unknown;
}
