import { readFile } from "node:fs/promises";
import type {
  NfeSaleEmailContext,
  RenderNfeEmailTemplateActivityInput,
  RenderNfeEmailTemplateActivityResult,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import {
  PermanentIntegrationError,
  TransientIntegrationError,
  isIntegrationError,
} from "../../../domain/shared/integration-error.types.js";

const NFE_EMAIL_TEMPLATE_URL = new URL(
  "../../../domain/nfe/templates/nfe-email-template.html",
  import.meta.url,
);
const BRL_NUMBER_FORMATTER = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

interface NodeErrorWithCode {
  code?: string;
}

let templateCachePromise: Promise<string> | null = null;

export async function renderNfeEmailTemplateActivity(
  input: RenderNfeEmailTemplateActivityInput,
): Promise<RenderNfeEmailTemplateActivityResult> {
  const validatedInput = validateRenderNfeEmailTemplateActivityInput(input);

  try {
    const template = await loadNfeEmailTemplate();

    return {
      html: renderTemplate(template, validatedInput.emailContext),
      text: renderText(validatedInput.emailContext),
    };
  } catch (error) {
    throw normalizeRenderNfeEmailTemplateError(error);
  }
}

function validateRenderNfeEmailTemplateActivityInput(
  input: RenderNfeEmailTemplateActivityInput,
): RenderNfeEmailTemplateActivityInput {
  if (typeof input !== "object" || input === null) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_TEMPLATE_INPUT",
      message: "NF-e template activity requires an input object",
    });
  }

  return {
    emailContext: validateNfeSaleEmailContext(input.emailContext),
  };
}

function validateNfeSaleEmailContext(value: unknown): NfeSaleEmailContext {
  if (typeof value !== "object" || value === null) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_TEMPLATE_CONTEXT",
      message: "NF-e template activity requires a valid emailContext object",
    });
  }

  const candidate = value as Partial<NfeSaleEmailContext>;

  return {
    recipients: normalizeRecipients(candidate.recipients),
    nomeCliente: readRequiredText(candidate.nomeCliente, "nomeCliente"),
    idVenda: readPositiveInteger(candidate.idVenda, "idVenda"),
    valorTotal: readNonNegativeNumber(candidate.valorTotal, "valorTotal"),
    numeroNf: readRequiredText(candidate.numeroNf, "numeroNf"),
    nfeChave: readOptionalText(candidate.nfeChave),
  };
}

function normalizeRecipients(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_TEMPLATE_RECIPIENTS",
      message: "NF-e template activity requires emailContext.recipients as an array",
    });
  }

  return value.map((recipient) => readRequiredText(recipient, "recipients[]"));
}

function readRequiredText(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_TEMPLATE_TEXT",
      message: `NF-e template activity requires a string value for ${fieldName}`,
    });
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_EMPTY_TEMPLATE_TEXT",
      message: `NF-e template activity requires a non-empty value for ${fieldName}`,
    });
  }

  return normalizedValue;
}

function readOptionalText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_TEMPLATE_TEXT",
      message: "NF-e template activity requires nfeChave to be text or null",
    });
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }

  throw new PermanentIntegrationError({
    code: "NFE_EMAIL_DISPATCH_INVALID_TEMPLATE_INTEGER",
    message: `NF-e template activity requires a positive integer for ${fieldName}`,
  });
}

function readNonNegativeNumber(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }

  throw new PermanentIntegrationError({
    code: "NFE_EMAIL_DISPATCH_INVALID_TEMPLATE_NUMBER",
    message: `NF-e template activity requires a non-negative number for ${fieldName}`,
  });
}

async function loadNfeEmailTemplate(): Promise<string> {
  if (templateCachePromise === null) {
    templateCachePromise = readFile(NFE_EMAIL_TEMPLATE_URL, "utf8");
  }

  return templateCachePromise;
}

function renderTemplate(template: string, emailContext: NfeSaleEmailContext): string {
  const replacements = new Map<string, string>([
    ["{{nome_cliente}}", escapeHtml(emailContext.nomeCliente)],
    ["{{numero_nf}}", escapeHtml(emailContext.numeroNf)],
    ["{{valor_total}}", escapeHtml(formatBrlNumber(emailContext.valorTotal))],
    ["{{nfe_chave}}", escapeHtml(emailContext.nfeChave ?? "")],
  ]);

  let html = template;

  for (const [placeholder, value] of replacements.entries()) {
    html = html.split(placeholder).join(value);
  }

  return html;
}

function renderText(emailContext: NfeSaleEmailContext): string {
  const nfeChave = emailContext.nfeChave ?? "Nao informada";

  return [
    `Ola, ${emailContext.nomeCliente}.`,
    "",
    `Sua nota fiscal ${emailContext.numeroNf} referente aos servicos da NET3 WIFI foi emitida.`,
    `Valor total: R$ ${formatBrlNumber(emailContext.valorTotal)}.`,
    `Chave de acesso: ${nfeChave}.`,
    "",
    "O arquivo PDF da nota fiscal segue em anexo.",
    "",
    "Este e um e-mail automatico da NET3 WIFI. Por favor, nao responda.",
  ].join("\n");
}

function formatBrlNumber(value: number): string {
  return BRL_NUMBER_FORMATTER.format(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeRenderNfeEmailTemplateError(error: unknown): Error {
  if (isIntegrationError(error)) {
    return error;
  }

  const code = readNodeErrorCode(error);

  if (code === "ENOENT" || code === "EACCES" || code === "EPERM") {
    return new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_TEMPLATE_UNAVAILABLE",
      message: "NF-e template activity could not load the HTML template file",
      cause: error,
    });
  }

  return new TransientIntegrationError({
    code: "NFE_EMAIL_DISPATCH_TEMPLATE_RENDER_FAILED",
    message: "NF-e template activity failed with an unknown transient error",
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
