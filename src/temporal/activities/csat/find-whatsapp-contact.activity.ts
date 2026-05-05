import type {
  FindWhatsappContactActivityInput,
  FindWhatsappContactActivityResult,
  FindWhatsappContactFailureReason,
} from "../../../domain/csat/csat-start-survey.types.js";
import {
  CSAT_NO_CONTACT_FOUND_IN_OPA,
  CSAT_OPA_CONTACT_LOOKUP_FAILURE,
  CSAT_OPA_CONTACT_SERVER_FAILURE,
  CSAT_OPA_CUSTOMER_OWNER_NOT_FOUND,
  CSAT_OPA_CUSTOMER_OWNER_WITHOUT_CONTACT,
  CSAT_OPA_CUSTOMER_WITHOUT_VALID_WHATSAPP,
  CSAT_OPA_CUSTOMER_WITHOUT_WHATSAPP_CONTACT,
} from "../../../domain/csat/csat-start-survey.types.js";
import {
  PermanentIntegrationError,
  TransientIntegrationError,
  isPermanentIntegrationError,
  isTransientIntegrationError,
} from "../../../domain/shared/integration-error.types.js";
import { createOpaClient } from "../../../integrations/opa/opa.client.js";
import type {
  OpaContactPhoneRow,
  OpaContactRow,
  OpaFindCustomerContactsResponse,
  OpaResponseEnvelope,
} from "../../../integrations/opa/opa.types.js";

const TITULAR_CLASSIFICATION = "titular";
const WHATSAPP_PHONE_TYPE = "whatsapp";
const CELLPHONE_PHONE_TYPE = "celular";

export async function findWhatsappContactActivity(
  input: FindWhatsappContactActivityInput,
): Promise<FindWhatsappContactActivityResult> {
  const opaClient = createOpaClient();
  const validatedInput = validateFindWhatsappContactInput(input);

  try {
    const response = await opaClient.findCustomerContactsByCustomerId({
      opaIdCliente: validatedInput.opaIdCliente,
    });

    return mapFindWhatsappContactResponse(response);
  } catch (error) {
    if (isPermanentIntegrationError(error)) {
      return buildFailureResult(CSAT_OPA_CONTACT_SERVER_FAILURE);
    }

    throw normalizeFindWhatsappContactError(error);
  }
}

function validateFindWhatsappContactInput(
  input: FindWhatsappContactActivityInput,
): FindWhatsappContactActivityInput {
  const opaIdCliente = input.opaIdCliente.trim();

  if (opaIdCliente.length === 0) {
    throw new PermanentIntegrationError({
      code: "CSAT_FIND_WHATSAPP_CONTACT_INVALID_OPA_ID",
      message: "CSAT WhatsApp contact lookup requires a non-empty opaIdCliente",
    });
  }

  return {
    opaIdCliente,
  };
}

function mapFindWhatsappContactResponse(
  response: OpaFindCustomerContactsResponse,
): FindWhatsappContactActivityResult {
  if (response.responseType === "html") {
    return buildFailureResult(CSAT_OPA_CONTACT_LOOKUP_FAILURE);
  }

  const contacts = readOpaContactRows(response.body);

  if (contacts.length === 0) {
    return buildFailureResult(CSAT_NO_CONTACT_FOUND_IN_OPA);
  }

  const titularContact = findTitularContact(contacts);

  if (titularContact === null) {
    return buildFailureResult(CSAT_OPA_CUSTOMER_OWNER_NOT_FOUND);
  }

  const titularPhones = readTitularPhones(titularContact);

  if (titularPhones.length === 0) {
    return buildFailureResult(CSAT_OPA_CUSTOMER_OWNER_WITHOUT_CONTACT);
  }

  const whatsappNumber = findValidPhoneNumberByType(titularPhones, WHATSAPP_PHONE_TYPE);

  if (whatsappNumber !== null) {
    return {
      status: "success",
      contatoWhatsapp: whatsappNumber,
    };
  }

  const cellphoneNumber = findValidPhoneNumberByType(titularPhones, CELLPHONE_PHONE_TYPE);

  if (cellphoneNumber !== null) {
    return {
      status: "success",
      contatoWhatsapp: cellphoneNumber,
    };
  }

  if (!hasWhatsappCandidatePhone(titularPhones)) {
    return buildFailureResult(CSAT_OPA_CUSTOMER_WITHOUT_WHATSAPP_CONTACT);
  }

  return buildFailureResult(CSAT_OPA_CUSTOMER_WITHOUT_VALID_WHATSAPP);
}

function readOpaContactRows(body: unknown): OpaContactRow[] {
  if (!isRecord(body)) {
    throw new PermanentIntegrationError({
      code: "CSAT_FIND_WHATSAPP_CONTACT_INVALID_BODY",
      message: "OPA contact lookup returned an invalid JSON body",
    });
  }

  const envelope = body as OpaResponseEnvelope;

  if (!Array.isArray(envelope.data)) {
    throw new PermanentIntegrationError({
      code: "CSAT_FIND_WHATSAPP_CONTACT_INVALID_DATA",
      message: "OPA contact lookup returned an invalid data payload",
    });
  }

  if (!envelope.data.every(isRecord)) {
    throw new PermanentIntegrationError({
      code: "CSAT_FIND_WHATSAPP_CONTACT_INVALID_CONTACT_ROWS",
      message: "OPA contact lookup returned invalid contact rows",
    });
  }

  return envelope.data as OpaContactRow[];
}

function findTitularContact(contacts: OpaContactRow[]): OpaContactRow | null {
  for (const contact of contacts) {
    if (readNormalizedString(contact.classificacao) === TITULAR_CLASSIFICATION) {
      return contact;
    }
  }

  return null;
}

function readTitularPhones(contact: OpaContactRow): OpaContactPhoneRow[] {
  if (contact.fones === undefined || contact.fones === null) {
    return [];
  }

  if (!Array.isArray(contact.fones)) {
    throw new PermanentIntegrationError({
      code: "CSAT_FIND_WHATSAPP_CONTACT_INVALID_FONES",
      message: "OPA titular contact returned an invalid fones field",
    });
  }

  if (!contact.fones.every(isRecord)) {
    throw new PermanentIntegrationError({
      code: "CSAT_FIND_WHATSAPP_CONTACT_INVALID_PHONE_ROWS",
      message: "OPA titular contact returned invalid phone rows",
    });
  }

  return contact.fones as OpaContactPhoneRow[];
}

function findValidPhoneNumberByType(
  phones: OpaContactPhoneRow[],
  phoneType: typeof WHATSAPP_PHONE_TYPE | typeof CELLPHONE_PHONE_TYPE,
): string | null {
  for (const phone of phones) {
    if (readNormalizedString(phone.tipo) !== phoneType) {
      continue;
    }

    const normalizedNumber = normalizeWhatsappPhoneNumber(phone.numero);

    if (normalizedNumber !== null) {
      return normalizedNumber;
    }
  }

  return null;
}

function hasWhatsappCandidatePhone(phones: OpaContactPhoneRow[]): boolean {
  return phones.some((phone) => {
    const phoneType = readNormalizedString(phone.tipo);

    return phoneType === WHATSAPP_PHONE_TYPE || phoneType === CELLPHONE_PHONE_TYPE;
  });
}

function normalizeWhatsappPhoneNumber(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const digits = String(value).replace(/\D/g, "");
  const nationalMobileNumber = normalizeBrazilNationalMobileNumber(digits);

  if (nationalMobileNumber === null) {
    return null;
  }

  // Keep the next step on a single normalized format for outbound WhatsApp delivery.
  return `55${nationalMobileNumber}`;
}

function normalizeBrazilNationalMobileNumber(digits: string): string | null {
  const withoutPrefix = stripBrazilDialingPrefix(digits);

  if (!/^[1-9]{2}9\d{8}$/.test(withoutPrefix)) {
    return null;
  }

  return withoutPrefix;
}

function stripBrazilDialingPrefix(digits: string): string {
  if (digits.startsWith("55") && digits.length === 13) {
    return digits.slice(2);
  }

  if (digits.startsWith("0") && digits.length === 12) {
    return digits.slice(1);
  }

  return digits;
}

function buildFailureResult(
  motivoFalha: FindWhatsappContactFailureReason,
): FindWhatsappContactActivityResult {
  return {
    status: "failure",
    motivoFalha,
  };
}

function normalizeFindWhatsappContactError(error: unknown): Error {
  if (isTransientIntegrationError(error)) {
    return error;
  }

  return new TransientIntegrationError({
    code: "CSAT_FIND_WHATSAPP_CONTACT_UNKNOWN_FAILURE",
    message: "OPA WhatsApp contact lookup failed with an unknown transient condition",
    cause: error,
  });
}

function readNormalizedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return normalized.length > 0 ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
