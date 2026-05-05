import type {
  FetchNfeSaleEmailContextFromErpActivityInput,
  FetchNfeSaleEmailContextFromErpResult,
  NfeSaleEmailContext,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import {
  NFE_EMAIL_CONTEXT_INVALID_RECIPIENTS_MESSAGE,
  NFE_EMAIL_CONTEXT_NOT_FOUND_MESSAGE,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import {
  PermanentIntegrationError,
  TransientIntegrationError,
  isIntegrationError,
} from "../../../domain/shared/integration-error.types.js";
import { getSharedErpDbClient } from "../../../integrations/erp-db/erp-db.client.js";
import { erpDbQueries } from "../../../integrations/erp-db/erp-db.queries.js";

interface ErpDbNfeSaleEmailContextRow extends Record<string, unknown> {
  email: string | null;
  nome_cliente: string;
  id_venda: number | string;
  valor_total: number | string;
  numero_nf: number | string;
  nfe_chave: string | null;
}

export async function fetchNfeSaleEmailContextFromErpActivity(
  input: FetchNfeSaleEmailContextFromErpActivityInput,
): Promise<FetchNfeSaleEmailContextFromErpResult> {
  const validatedInput = validateFetchNfeSaleEmailContextFromErpActivityInput(input);
  const erpDbClient = getSharedErpDbClient();

  try {
    const rows = await erpDbClient.select<ErpDbNfeSaleEmailContextRow>(
      erpDbQueries.fetchNfeSaleEmailContext,
      [validatedInput.erpSaleId],
    );
    const [row] = rows;

    if (row === undefined) {
      return {
        status: "FAILED_FINAL",
        errorMessage: NFE_EMAIL_CONTEXT_NOT_FOUND_MESSAGE,
      };
    }

    const recipients = normalizeRecipients(row.email);

    if (recipients.length === 0) {
      return {
        status: "FAILED_FINAL",
        errorMessage: NFE_EMAIL_CONTEXT_INVALID_RECIPIENTS_MESSAGE,
      };
    }

    return {
      status: "SUCCESS",
      data: mapNfeSaleEmailContextRow(row, recipients),
    };
  } catch (error) {
    throw normalizeFetchNfeSaleEmailContextFromErpError(error);
  }
}

function validateFetchNfeSaleEmailContextFromErpActivityInput(
  input: FetchNfeSaleEmailContextFromErpActivityInput,
): FetchNfeSaleEmailContextFromErpActivityInput {
  if (!Number.isInteger(input.erpSaleId) || input.erpSaleId <= 0) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_ERP_SALE_ID",
      message: "NF-e email-context activity requires a positive erpSaleId",
    });
  }

  return {
    erpSaleId: input.erpSaleId,
  };
}

function mapNfeSaleEmailContextRow(
  row: ErpDbNfeSaleEmailContextRow,
  recipients: string[],
): NfeSaleEmailContext {
  return {
    recipients,
    nomeCliente: readRequiredText(row.nome_cliente, "nome_cliente"),
    idVenda: readPositiveInteger(row.id_venda, "id_venda"),
    valorTotal: readNonNegativeNumber(row.valor_total, "valor_total"),
    numeroNf: readScalarAsString(row.numero_nf, "numero_nf"),
    nfeChave: readNullableText(row.nfe_chave, "nfe_chave"),
  };
}

function normalizeRecipients(value: string | null): string[] {
  if (value === null) {
    return [];
  }

  return [...new Set(
    value
      .split(";")
      .map((recipient) => recipient.trim())
      .filter((recipient) => recipient.length > 0),
  )];
}

function readRequiredText(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_TEXT_FIELD",
      message: `NF-e email-context activity received an invalid text value for ${fieldName}`,
    });
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_EMPTY_TEXT_FIELD",
      message: `NF-e email-context activity requires a non-empty text value for ${fieldName}`,
    });
  }

  return normalizedValue;
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsedValue = Number.parseInt(value, 10);

    if (Number.isSafeInteger(parsedValue) && parsedValue > 0) {
      return parsedValue;
    }
  }

  throw new PermanentIntegrationError({
    code: "NFE_EMAIL_DISPATCH_INVALID_INTEGER_FIELD",
    message: `NF-e email-context activity received an invalid integer for ${fieldName}`,
  });
}

function readNonNegativeNumber(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsedValue = Number(value);

    if (Number.isFinite(parsedValue) && parsedValue >= 0) {
      return parsedValue;
    }
  }

  throw new PermanentIntegrationError({
    code: "NFE_EMAIL_DISPATCH_INVALID_NUMBER_FIELD",
    message: `NF-e email-context activity received an invalid number for ${fieldName}`,
  });
}

function readScalarAsString(value: unknown, fieldName: string): string {
  if (typeof value === "string") {
    const normalizedValue = value.trim();

    if (normalizedValue.length > 0) {
      return normalizedValue;
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }

  throw new PermanentIntegrationError({
    code: "NFE_EMAIL_DISPATCH_INVALID_SCALAR_FIELD",
    message: `NF-e email-context activity received an invalid scalar for ${fieldName}`,
  });
}

function readNullableText(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim();

    return normalizedValue.length === 0 ? null : normalizedValue;
  }

  throw new PermanentIntegrationError({
    code: "NFE_EMAIL_DISPATCH_INVALID_TEXT_FIELD",
    message: `NF-e email-context activity received an invalid text value for ${fieldName}`,
  });
}

function normalizeFetchNfeSaleEmailContextFromErpError(error: unknown): Error {
  if (isIntegrationError(error)) {
    return error;
  }

  return new TransientIntegrationError({
    code: "NFE_EMAIL_DISPATCH_FETCH_EMAIL_CONTEXT_FAILED",
    message:
      "NF-e email-context lookup failed with an unknown transient error",
    cause: error,
  });
}
