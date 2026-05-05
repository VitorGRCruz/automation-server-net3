import { PermanentIntegrationError } from "../../../domain/shared/integration-error.types.js";

const NFE_EMAIL_DISPATCH_TIME_ZONE = "America/Cuiaba";

export function normalizeDateTime3(value: Date | string): string {
  if (value instanceof Date) {
    return formatDateTime3(value);
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_DATETIME",
      message: "NF-e email dispatch datetime values must not be empty",
    });
  }

  const simpleDateTimeMatch = trimmedValue.match(
    /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?$/,
  );

  if (simpleDateTimeMatch !== null) {
    const milliseconds = (simpleDateTimeMatch[2] ?? "").padEnd(3, "0");

    return `${simpleDateTimeMatch[1]}.${milliseconds}`;
  }

  const parsedDate = new Date(trimmedValue);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_DATETIME",
      message: `Invalid NF-e email dispatch datetime value: ${trimmedValue}`,
    });
  }

  return formatDateTime3(parsedDate);
}

export function buildRegionalCurrentDateTime3(): string {
  return formatDateTime3InTimeZone(new Date(), NFE_EMAIL_DISPATCH_TIME_ZONE);
}

function formatDateTime3InTimeZone(value: Date, timeZone: string): string {
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dateFormatter.formatToParts(value);
  const year = readDateTimePart(parts, "year");
  const month = readDateTimePart(parts, "month");
  const day = readDateTimePart(parts, "day");
  const hour = readDateTimePart(parts, "hour");
  const minute = readDateTimePart(parts, "minute");
  const second = readDateTimePart(parts, "second");
  const millisecond = padNumber(value.getMilliseconds(), 3);

  return `${year}-${month}-${day} ${hour}:${minute}:${second}.${millisecond}`;
}

function readDateTimePart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  const value = parts.find((part) => part.type === type)?.value;

  if (!value) {
    throw new PermanentIntegrationError({
      code: "NFE_EMAIL_DISPATCH_INVALID_TIMEZONE_FORMAT",
      message: `NF-e email dispatch could not format datetime part: ${type}`,
    });
  }

  return value;
}

function formatDateTime3(value: Date): string {
  const year = value.getUTCFullYear();
  const month = padNumber(value.getUTCMonth() + 1, 2);
  const day = padNumber(value.getUTCDate(), 2);
  const hour = padNumber(value.getUTCHours(), 2);
  const minute = padNumber(value.getUTCMinutes(), 2);
  const second = padNumber(value.getUTCSeconds(), 2);
  const millisecond = padNumber(value.getUTCMilliseconds(), 3);

  return `${year}-${month}-${day} ${hour}:${minute}:${second}.${millisecond}`;
}

function padNumber(value: number, width: number): string {
  return value.toString().padStart(width, "0");
}
