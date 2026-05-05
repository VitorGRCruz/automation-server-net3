export interface OpaClientConfig {
  baseUrl: string;
  apiToken: string;
  timeoutMs: number;
}

export interface OpaFindCustomerRequest {
  idCliente: number;
}

export interface OpaFindCustomerContactsRequest {
  opaIdCliente: string;
}

export interface OpaJsonResponse {
  responseType: "json";
  httpStatus: number;
  contentType: string | null;
  body: unknown;
}

export interface OpaHtmlResponse {
  responseType: "html";
  httpStatus: number;
  contentType: string | null;
  bodyText: string;
}

export type OpaApiResponse = OpaJsonResponse | OpaHtmlResponse;
export type OpaFindCustomerResponse = OpaApiResponse;
export type OpaFindCustomerContactsResponse = OpaApiResponse;

export interface OpaClient {
  probe(): Promise<void>;
  findCustomerById(input: OpaFindCustomerRequest): Promise<OpaFindCustomerResponse>;
  findCustomerContactsByCustomerId(
    input: OpaFindCustomerContactsRequest,
  ): Promise<OpaFindCustomerContactsResponse>;
}

export interface OpaResponseEnvelope {
  status?: unknown;
  code?: unknown;
  data?: unknown;
  description?: unknown;
}

export interface OpaCustomerRow {
  _id?: unknown;
}

export interface OpaContactPhoneRow {
  tipo?: unknown;
  numero?: unknown;
}

export interface OpaContactRow {
  classificacao?: unknown;
  fones?: unknown;
}
