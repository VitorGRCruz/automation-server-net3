import type {
  ErpNfeSaleCandidate,
  FetchCustomerNfeSalesCandidatesFromErpActivityInput,
} from "../../../domain/nfe/nfe-email-dispatch.types.js";
import {
  PermanentIntegrationError,
  TransientIntegrationError,
  isIntegrationError,
} from "../../../domain/shared/integration-error.types.js";
import { getSharedErpDbClient } from "../../../integrations/erp-db/erp-db.client.js";
import { erpDbQueries } from "../../../integrations/erp-db/erp-db.queries.js";

interface ErpDbNfeSaleCandidateRow extends Record<string, unknown> {
  id_venda: number | string;
  nfe_chave: string | null;
  data_emissao_nfe: string | Date;
}

export async function fetchCustomerNfeSalesCandidatesFromErpActivity(
  input: FetchCustomerNfeSalesCandidatesFromErpActivityInput,
): Promise<ErpNfeSaleCandidate[]> {
  const validatedInput = validateFetchCustomerNfeSalesCandidatesFromErpInput(input);
  const erpDbClient = getSharedErpDbClient();

  try {
    const rows = await erpDbClient.select<ErpDbNfeSaleCandidateRow>(
      erpDbQueries.fetchCustomerNfeSalesCandidates,
      [validatedInput.erpCustomerId, validatedInput.effectiveStart],
    );

    return rows.map((row, index) => mapErpNfeSaleCandidateRow(row, index, validatedInput));
  } catch (error) {
    throw normalizeFetchCustomerNfeSalesCandidatesFromErpError(error);
  }
}

function validateFetchCustomerNfeSalesCandidatesFromErpInput(
  input: FetchCustomerNfeSalesCandidatesFromErpActivityInput,
): FetchCustomerNfeSalesCandidatesFromErpActivityInput {
  return {
    automationCustomerId: readPositiveInteger(
      input.automationCustomerId,
      "automationCustomerId",
    ),
    erpCustomerId: readPositiveInteger(input.erpCustomerId, "erpCustomerId"),
    effectiveStart: readRequiredText(input.effectiveStart, "effectiveStart"),
  };
}

function mapErpNfeSaleCandidateRow(
  row: ErpDbNfeSaleCandidateRow,
  index: number,
  input: FetchCustomerNfeSalesCandidatesFromErpActivityInput,
): ErpNfeSaleCandidate {
  return {
    automationCustomerId: input.automationCustomerId,
    erpCustomerId: input.erpCustomerId,
    erpSaleId: readPositiveInteger(row.id_venda, `rows[${index}].id_venda`),
    erpInvoiceKey: readNullableText(row.nfe_chave, `rows[${index}].nfe_chave`),
    erpInvoiceEmittedAt: readDateTimeValue(
      row.data_emissao_nfe,
      `rows[${index}].data_emissao_nfe`,
    ),
  };
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
    message: `NF-e email dispatch ERP activity received an invalid integer for ${fieldName}`,
  });
}

function readRequiredText(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_TEXT_FIELD",
      message: `NF-e email dispatch ERP activity requires a string for ${fieldName}`,
    });
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_EMPTY_TEXT_FIELD",
      message: `NF-e email dispatch ERP activity requires a non-empty value for ${fieldName}`,
    });
  }

  return normalizedValue;
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
    message: `NF-e email dispatch ERP activity received an invalid text value for ${fieldName}`,
  });
}

function readDateTimeValue(value: unknown, fieldName: string): string {
  if (typeof value === "string") {
    return normalizeDateTimeString(value, fieldName);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatLocalDateTime3(value);
  }

  throw new PermanentIntegrationError({
    code: "NFE_EMAIL_DISPATCH_INVALID_DATETIME_FIELD",
    message: `NF-e email dispatch ERP activity received an invalid datetime for ${fieldName}`,
  });
}

function normalizeDateTimeString(value: string, fieldName: string): string {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_DATETIME_FIELD",
      message: `NF-e email dispatch ERP activity requires a non-empty datetime for ${fieldName}`,
    });
  }

  const mysqlDateTimeMatch = trimmedValue.match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?$/,
  );

  if (mysqlDateTimeMatch !== null) {
    const milliseconds = (mysqlDateTimeMatch[3] ?? "").padEnd(3, "0");

    return `${mysqlDateTimeMatch[1]} ${mysqlDateTimeMatch[2]}.${milliseconds}`;
  }

  const parsedDate = new Date(trimmedValue);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_DATETIME_FIELD",
      message: `NF-e email dispatch ERP activity received an invalid datetime for ${fieldName}`,
    });
  }

  return formatLocalDateTime3(parsedDate);
}

function formatLocalDateTime3(value: Date): string {
  const year = value.getFullYear();
  const month = padNumber(value.getMonth() + 1, 2);
  const day = padNumber(value.getDate(), 2);
  const hour = padNumber(value.getHours(), 2);
  const minute = padNumber(value.getMinutes(), 2);
  const second = padNumber(value.getSeconds(), 2);
  const millisecond = padNumber(value.getMilliseconds(), 3);

  return `${year}-${month}-${day} ${hour}:${minute}:${second}.${millisecond}`;
}

function padNumber(value: number, width: number): string {
  return value.toString().padStart(width, "0");
}

function normalizeFetchCustomerNfeSalesCandidatesFromErpError(
  error: unknown,
): Error {
  if (isIntegrationError(error)) {
    return error;
  }

  return new TransientIntegrationError({
    code: "NFE_EMAIL_DISPATCH_FETCH_CANDIDATES_FAILED",
    message:
      "NF-e email dispatch ERP candidate lookup failed with an unknown transient error",
    cause: error,
  });
}
