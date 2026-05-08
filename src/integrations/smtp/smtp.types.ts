import type { SendMailOptions } from "nodemailer";

export type SmtpAddressInput = string | readonly string[];

export interface SmtpAttachmentBaseInput {
  filename?: string;
  contentType?: string;
  contentDisposition?: "attachment" | "inline";
  cid?: string;
}

export interface SmtpAttachmentContentInput extends SmtpAttachmentBaseInput {
  content: string | Buffer;
  encoding?: BufferEncoding;
  path?: never;
}

export interface SmtpAttachmentPathInput extends SmtpAttachmentBaseInput {
  path: string;
  content?: never;
  encoding?: never;
}

export type SmtpAttachmentInput =
  | SmtpAttachmentContentInput
  | SmtpAttachmentPathInput;

export interface SmtpAuthConfig {
  username: string;
  password: string;
}

export interface SmtpPoolConfig {
  maxConnections: number;
  maxMessages: number;
  rateDeltaMs: number;
  rateLimit: number;
}

export interface SmtpTransportConfig {
  host: string;
  port: number;
  secure: boolean;
  connectionTimeoutMs: number;
  greetingTimeoutMs: number;
  socketTimeoutMs: number;
  dnsTimeoutMs: number;
  requireTls: boolean;
  tlsServername?: string;
  pool?: SmtpPoolConfig;
}

export interface SmtpScopeConfig {
  auth: SmtpAuthConfig;
  defaultFrom: string;
  defaultReplyTo?: SmtpAddressInput;
}

export interface SmtpVerifyInput {
  auth: SmtpAuthConfig;
}

export interface SmtpSendMessageInput {
  from: string;
  to?: SmtpAddressInput;
  cc?: SmtpAddressInput;
  bcc?: SmtpAddressInput;
  replyTo?: SmtpAddressInput;
  subject: string;
  text?: string;
  html?: string;
  attachments?: readonly SmtpAttachmentInput[];
}

export interface SmtpSendInput extends SmtpSendMessageInput {
  auth: SmtpAuthConfig;
}

export interface SmtpScopeSendInput {
  from?: string;
  to?: SmtpAddressInput;
  cc?: SmtpAddressInput;
  bcc?: SmtpAddressInput;
  replyTo?: SmtpAddressInput;
  subject: string;
  text?: string;
  html?: string;
  attachments?: readonly SmtpAttachmentInput[];
}

export interface SmtpEnvelope {
  from?: string | false;
  to: string[];
}

export interface SmtpSendOutput {
  messageId: string;
  accepted: string[];
  rejected: string[];
  pending: string[];
  response: string;
  envelope: SmtpEnvelope;
}

export interface SmtpTransportAddress {
  address: string;
  name?: string;
}

export interface SmtpRawSendInfo {
  envelope: {
    from?: string | false;
    to?: string | string[];
  };
  messageId: string;
  accepted: Array<string | SmtpTransportAddress>;
  rejected: Array<string | SmtpTransportAddress>;
  pending: Array<string | SmtpTransportAddress>;
  response: string;
}

export interface SmtpTransportError extends Error {
  code?: string;
  command?: string;
  response?: string;
  responseCode?: number;
  errno?: string | number;
  syscall?: string;
  path?: string;
  rejectedErrors?: Array<{
    recipient?: string;
    code?: string;
    response?: string;
    responseCode?: number;
    command?: string;
    message?: string;
  }>;
}

export interface SmtpTransport {
  verify(): Promise<true>;
  sendMail(options: SendMailOptions): Promise<SmtpRawSendInfo>;
  close?(): void;
}

export interface SmtpClient {
  probe(input: SmtpVerifyInput): Promise<void>;
  send(input: SmtpSendInput): Promise<SmtpSendOutput>;
  close?(): void | Promise<void>;
}

export interface SmtpScope {
  verify(): Promise<void>;
  send(input: SmtpScopeSendInput): Promise<SmtpSendOutput>;
}
