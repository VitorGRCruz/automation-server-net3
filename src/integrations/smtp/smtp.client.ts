import { constants as fsConstants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import nodemailer from "nodemailer";
import type { SendMailOptions } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import {
  PermanentIntegrationError,
  TransientIntegrationError,
  isIntegrationError,
} from "../../domain/shared/integration-error.types.js";
import {
  smtpScopeConfig,
  smtpTransportConfig,
} from "../../infra/config/smtp.config.js";
import type {
  SmtpAddressInput,
  SmtpAttachmentInput,
  SmtpAuthConfig,
  SmtpClient,
  SmtpEnvelope,
  SmtpRawSendInfo,
  SmtpScope,
  SmtpScopeConfig,
  SmtpScopeSendInput,
  SmtpSendInput,
  SmtpSendOutput,
  SmtpTransport,
  SmtpTransportAddress,
  SmtpTransportConfig,
  SmtpTransportError,
} from "./smtp.types.js";

const SMTP_TIMEOUT_ERROR_CODES = new Set(["ETIMEDOUT"]);
const SMTP_CONNECTION_ERROR_CODES = new Set([
  "ECONNECTION",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "EDNS",
  "ENETUNREACH",
  "ENOTFOUND",
  "ESOCKET",
  "EHOSTUNREACH",
]);
const SMTP_ATTACHMENT_ERROR_CODES = new Set(["EFILEACCESS", "ESTREAM"]);

let sharedSmtpClient: SmtpClient | null = null;
let sharedSmtpScope: SmtpScope | null = null;

export function createSmtpClient(
  config: SmtpTransportConfig = smtpTransportConfig,
): SmtpClient {
  return {
    async probe(input): Promise<void> {
      const auth = normalizeAuthConfig(input.auth);
      const transport = createTransport(config, auth);

      try {
        await transport.verify();
      } catch (error) {
        throw normalizeSmtpError(error);
      } finally {
        transport.close?.();
      }
    },

    async send(input): Promise<SmtpSendOutput> {
      const auth = normalizeAuthConfig(input.auth);
      const message = await prepareMessage(input);
      const transport = createTransport(config, auth);

      try {
        const output = normalizeSendOutput(await transport.sendMail(message));

        if (output.rejected.length > 0 || output.pending.length > 0) {
          throw new PermanentIntegrationError({
            code: "SMTP_RECIPIENT_REJECTED",
            message:
              "SMTP server rejected one or more recipients while sending the email",
          });
        }

        return output;
      } catch (error) {
        throw normalizeSmtpError(error);
      } finally {
        transport.close?.();
      }
    },
  };
}

export function getSharedSmtpClient(): SmtpClient {
  if (sharedSmtpClient !== null) {
    return sharedSmtpClient;
  }

  sharedSmtpClient = createSmtpClient(smtpTransportConfig);

  return sharedSmtpClient;
}

export function createSmtpScope(
  config: SmtpScopeConfig = smtpScopeConfig,
  client: SmtpClient = getSharedSmtpClient(),
): SmtpScope {
  const normalizedScope = normalizeScopeConfig(config);

  return {
    async verify(): Promise<void> {
      await client.probe({
        auth: normalizedScope.auth,
      });
    },

    async send(input: SmtpScopeSendInput): Promise<SmtpSendOutput> {
      ensureScopeHasMessageDefaults(input);

      return client.send({
        auth: normalizedScope.auth,
        from: resolveMessageFrom(normalizedScope, input.from),
        ...(input.to === undefined ? {} : { to: input.to }),
        ...(input.cc === undefined ? {} : { cc: input.cc }),
        ...(input.bcc === undefined ? {} : { bcc: input.bcc }),
        ...resolveReplyTo(input.replyTo, normalizedScope.defaultReplyTo),
        subject: input.subject,
        ...(input.text === undefined ? {} : { text: input.text }),
        ...(input.html === undefined ? {} : { html: input.html }),
        ...(input.attachments === undefined
          ? {}
          : { attachments: input.attachments }),
      });
    },
  };
}

export function getSharedSmtpScope(): SmtpScope {
  if (sharedSmtpScope !== null) {
    return sharedSmtpScope;
  }

  sharedSmtpScope = createSmtpScope(smtpScopeConfig, getSharedSmtpClient());

  return sharedSmtpScope;
}

function createTransport(
  config: SmtpTransportConfig,
  auth: SmtpAuthConfig,
): SmtpTransport {
  return nodemailer.createTransport(
    buildSmtpTransportOptions(config, auth),
  ) as SmtpTransport;
}

function buildSmtpTransportOptions(
  config: SmtpTransportConfig,
  auth: SmtpAuthConfig,
): SMTPTransport.Options {
  return {
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: auth.username,
      pass: auth.password,
    },
    connectionTimeout: config.connectionTimeoutMs,
    greetingTimeout: config.greetingTimeoutMs,
    socketTimeout: config.socketTimeoutMs,
    dnsTimeout: config.dnsTimeoutMs,
    requireTLS: config.requireTls,
    ...(config.tlsServername === undefined
      ? {}
      : {
          tls: {
            servername: config.tlsServername,
          },
        }),
  };
}

function normalizeScopeConfig(config: SmtpScopeConfig): SmtpScopeConfig {
  return {
    auth: normalizeAuthConfig(config.auth),
    defaultFrom: normalizeRequiredString("defaultFrom", config.defaultFrom),
    ...(config.defaultReplyTo === undefined
      ? {}
      : {
          defaultReplyTo: normalizeAddressField(
            "defaultReplyTo",
            config.defaultReplyTo,
          ),
        }),
  };
}

function normalizeAuthConfig(auth: SmtpAuthConfig): SmtpAuthConfig {
  return {
    username: normalizeRequiredString("auth.username", auth.username),
    password: normalizeRequiredString("auth.password", auth.password),
  };
}

function resolveMessageFrom(
  scope: SmtpScopeConfig,
  from: string | undefined,
): string {
  if (from === undefined) {
    return scope.defaultFrom;
  }

  const normalizedFrom = from.trim();

  return normalizedFrom.length > 0 ? normalizedFrom : scope.defaultFrom;
}

function ensureScopeHasMessageDefaults(input: SmtpScopeSendInput): void {
  if (
    input.from !== undefined &&
    typeof input.from === "string" &&
    input.from.trim().length === 0
  ) {
    throw new PermanentIntegrationError({
      code: "SMTP_MESSAGE_INVALID",
      message: "SMTP scope send requires from to be a non-empty string when provided",
    });
  }
}

function resolveReplyTo(
  replyTo: SmtpAddressInput | undefined,
  defaultReplyTo: SmtpAddressInput | undefined,
): Pick<SmtpSendInput, "replyTo"> | Record<string, never> {
  const resolvedReplyTo = replyTo ?? defaultReplyTo;

  return resolvedReplyTo === undefined ? {} : { replyTo: resolvedReplyTo };
}

async function prepareMessage(input: SmtpSendInput): Promise<SendMailOptions> {
  const issues: string[] = [];
  const from = normalizeRequiredString("from", input.from);
  const subject = normalizeRequiredString("subject", input.subject);
  const to = normalizeOptionalAddressField("to", input.to, issues);
  const cc = normalizeOptionalAddressField("cc", input.cc, issues);
  const bcc = normalizeOptionalAddressField("bcc", input.bcc, issues);
  const replyTo = normalizeOptionalAddressField("replyTo", input.replyTo, issues);

  if (!hasRecipient(to) && !hasRecipient(cc) && !hasRecipient(bcc)) {
    issues.push("at least one recipient is required in to, cc or bcc");
  }

  const normalizedText = normalizeOptionalBody(input.text);
  const normalizedHtml = normalizeOptionalBody(input.html);

  if (normalizedText === undefined && normalizedHtml === undefined) {
    issues.push("text or html is required");
  }

  if (issues.length > 0) {
    throw new PermanentIntegrationError({
      code: "SMTP_MESSAGE_INVALID",
      message: issues.join("; "),
    });
  }

  const attachments = await prepareAttachments(input.attachments);

  return {
    from,
    subject,
    disableUrlAccess: true,
    ...(to === undefined ? {} : { to }),
    ...(cc === undefined ? {} : { cc }),
    ...(bcc === undefined ? {} : { bcc }),
    ...(replyTo === undefined ? {} : { replyTo }),
    ...(normalizedText === undefined ? {} : { text: normalizedText }),
    ...(normalizedHtml === undefined ? {} : { html: normalizedHtml }),
    ...(attachments.length === 0 ? {} : { attachments }),
  };
}

async function prepareAttachments(
  attachments: readonly SmtpAttachmentInput[] | undefined,
): Promise<NonNullable<SendMailOptions["attachments"]>> {
  if (attachments === undefined || attachments.length === 0) {
    return [];
  }

  return Promise.all(attachments.map((attachment) => prepareAttachment(attachment)));
}

async function prepareAttachment(
  attachment: SmtpAttachmentInput,
): Promise<NonNullable<SendMailOptions["attachments"]>[number]> {
  const filename = normalizeOptionalString(attachment.filename);
  const contentType = normalizeOptionalString(attachment.contentType);
  const cid = normalizeOptionalString(attachment.cid);

  if ("path" in attachment) {
    const normalizedPath = normalizeRequiredString("attachment.path", attachment.path);

    if (!isAbsolute(normalizedPath)) {
      throw new PermanentIntegrationError({
        code: "SMTP_ATTACHMENT_INVALID",
        message: `SMTP attachment path must be absolute: ${normalizedPath}`,
      });
    }

    try {
      await access(normalizedPath, fsConstants.R_OK);

      const fileStat = await stat(normalizedPath);

      if (!fileStat.isFile()) {
        throw new PermanentIntegrationError({
          code: "SMTP_ATTACHMENT_INVALID",
          message: `SMTP attachment path must reference a regular file: ${normalizedPath}`,
        });
      }
    } catch (error) {
      if (isIntegrationError(error)) {
        throw error;
      }

      throw new PermanentIntegrationError({
        code: "SMTP_ATTACHMENT_INVALID",
        message: `SMTP attachment path is not readable: ${normalizedPath}`,
        cause: error,
      });
    }

    return {
      path: normalizedPath,
      ...(filename === undefined ? {} : { filename }),
      ...(contentType === undefined ? {} : { contentType }),
      ...(attachment.contentDisposition === undefined
        ? {}
        : { contentDisposition: attachment.contentDisposition }),
      ...(cid === undefined ? {} : { cid }),
    };
  }

  return {
    content: attachment.content,
    ...(typeof attachment.content === "string" && attachment.encoding !== undefined
      ? { encoding: attachment.encoding }
      : {}),
    ...(filename === undefined ? {} : { filename }),
    ...(contentType === undefined ? {} : { contentType }),
    ...(attachment.contentDisposition === undefined
      ? {}
      : { contentDisposition: attachment.contentDisposition }),
    ...(cid === undefined ? {} : { cid }),
  };
}

function normalizeOptionalAddressField(
  fieldName: "to" | "cc" | "bcc" | "replyTo",
  value: SmtpAddressInput | undefined,
  issues: string[],
): string | string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    return normalizeAddressField(fieldName, value);
  } catch (error) {
    if (error instanceof PermanentIntegrationError) {
      issues.push(error.message);
      return undefined;
    }

    throw error;
  }
}

function normalizeAddressField(
  fieldName: string,
  value: SmtpAddressInput,
): string | string[] {
  const rawValues = Array.isArray(value) ? [...value] : [value];
  const normalizedValues = rawValues
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (normalizedValues.length === 0) {
    throw new PermanentIntegrationError({
      code: "SMTP_MESSAGE_INVALID",
      message: `${fieldName} must contain at least one address`,
    });
  }

  return normalizedValues.length === 1 ? normalizedValues[0] : normalizedValues;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function normalizeRequiredString(fieldName: string, value: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new PermanentIntegrationError({
      code: "SMTP_MESSAGE_INVALID",
      message: `${fieldName} is required`,
    });
  }

  return normalizedValue;
}

function normalizeOptionalBody(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function hasRecipient(value: string | string[] | undefined): boolean {
  if (typeof value === "string") {
    return value.length > 0;
  }

  return Array.isArray(value) && value.length > 0;
}

function normalizeSendOutput(info: SmtpRawSendInfo): SmtpSendOutput {
  return {
    messageId: info.messageId,
    accepted: normalizeAddressCollection(info.accepted),
    rejected: normalizeAddressCollection(info.rejected),
    pending: normalizeAddressCollection(info.pending),
    response: info.response,
    envelope: normalizeEnvelope(info.envelope),
  };
}

function normalizeEnvelope(info: SmtpRawSendInfo["envelope"]): SmtpEnvelope {
  return {
    ...(info.from === undefined ? {} : { from: info.from }),
    to: info.to === undefined ? [] : Array.isArray(info.to) ? [...info.to] : [info.to],
  };
}

function normalizeAddressCollection(
  values: Array<string | SmtpTransportAddress> | undefined,
): string[] {
  if (values === undefined) {
    return [];
  }

  return values.map((value) => {
    return typeof value === "string" ? value : value.address;
  });
}

function normalizeSmtpError(error: unknown): Error {
  if (isIntegrationError(error)) {
    return error;
  }

  if (!(error instanceof Error)) {
    return new TransientIntegrationError({
      code: "SMTP_SEND_FAILED",
      message: "SMTP request failed with an unknown transient condition",
      cause: error,
    });
  }

  const smtpError = error as SmtpTransportError;
  const code = smtpError.code?.toUpperCase();
  const command = smtpError.command?.toUpperCase();
  const message = error.message.toLowerCase();

  if (
    code === "EAUTH" ||
    smtpError.responseCode === 535 ||
    command?.startsWith("AUTH") === true
  ) {
    return new PermanentIntegrationError({
      code: "SMTP_AUTH_FAILED",
      message: "SMTP authentication failed",
      cause: error,
    });
  }

  if (code === "EENVELOPE") {
    return new PermanentIntegrationError({
      code: "SMTP_RECIPIENT_REJECTED",
      message: "SMTP rejected the email envelope or one or more recipients",
      cause: error,
    });
  }

  if (code !== undefined && SMTP_ATTACHMENT_ERROR_CODES.has(code)) {
    return new PermanentIntegrationError({
      code: "SMTP_ATTACHMENT_INVALID",
      message: "SMTP attachment could not be processed",
      cause: error,
    });
  }

  if (code !== undefined && SMTP_TIMEOUT_ERROR_CODES.has(code)) {
    return new TransientIntegrationError({
      code: "SMTP_TIMEOUT",
      message: "SMTP request timed out",
      cause: error,
    });
  }

  if (
    (code !== undefined && SMTP_CONNECTION_ERROR_CODES.has(code)) ||
    message.includes("connection closed") ||
    message.includes("greeting never received")
  ) {
    return new TransientIntegrationError({
      code: "SMTP_CONNECTION_FAILED",
      message: "SMTP connection failed temporarily",
      cause: error,
    });
  }

  if (
    (code !== undefined && (code.startsWith("ERR_TLS") || code.startsWith("CERT_"))) ||
    message.includes("certificate")
  ) {
    return new PermanentIntegrationError({
      code: "SMTP_TLS_CONFIGURATION_ERROR",
      message: "SMTP TLS handshake failed due to configuration or certificate issues",
      cause: error,
    });
  }

  if (message.includes("timed out") || message.includes("timeout")) {
    return new TransientIntegrationError({
      code: "SMTP_TIMEOUT",
      message: "SMTP request timed out",
      cause: error,
    });
  }

  return new TransientIntegrationError({
    code: "SMTP_SEND_FAILED",
    message: "SMTP request failed with an unknown transient condition",
    cause: error,
  });
}
