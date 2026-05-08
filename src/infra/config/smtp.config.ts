import { isIP } from "node:net";
import { env } from "./env.js";

const normalizedSmtpTlsServername = normalizeOptionalString(env.smtpTlsServername);
const normalizedSmtpDefaultReplyTo = normalizeOptionalAddressInput(
  env.smtpDefaultReplyTo,
);

export const smtpTransportConfig = Object.freeze({
  host: normalizeRequiredString("SMTP_HOST", env.smtpHost),
  port: env.smtpPort,
  secure: env.smtpSecure,
  connectionTimeoutMs: env.smtpConnectionTimeoutMs,
  greetingTimeoutMs: env.smtpGreetingTimeoutMs,
  socketTimeoutMs: env.smtpSocketTimeoutMs,
  dnsTimeoutMs: env.smtpDnsTimeoutMs,
  requireTls: env.smtpRequireTls,
  ...(normalizedSmtpTlsServername === undefined
    ? {}
    : {
        tlsServername: normalizedSmtpTlsServername,
      }),
  pool: Object.freeze({
    maxConnections: 1,
    maxMessages: 100,
    rateDeltaMs: 60_000,
    rateLimit: Math.max(1, Math.floor(env.smtpMaxEmailsPerMinute)),
  }),
});

if (
  isIP(smtpTransportConfig.host) !== 0 &&
  smtpTransportConfig.tlsServername === undefined
) {
  throw new Error(
    "SMTP_TLS_SERVERNAME is required when SMTP_HOST is configured as an IP address",
  );
}

export const smtpScopeConfig = Object.freeze({
  auth: Object.freeze({
    username: normalizeRequiredString("SMTP_USERNAME", env.smtpUsername),
    password: normalizeRequiredString("SMTP_PASSWORD", env.smtpPassword),
  }),
  defaultFrom: normalizeRequiredString("SMTP_DEFAULT_FROM", env.smtpDefaultFrom),
  ...(normalizedSmtpDefaultReplyTo === undefined
    ? {}
    : {
        defaultReplyTo: normalizedSmtpDefaultReplyTo,
      }),
});

function normalizeRequiredString(name: string, value: string): string {
  const normalizedValue = value.trim().replace(/^['"]+|['"]+$/g, "");

  if (normalizedValue.length === 0) {
    throw new Error(`${name} must not be empty`);
  }

  return normalizedValue;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = value.trim().replace(/^['"]+|['"]+$/g, "");

  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function normalizeOptionalAddressInput(
  value: string | undefined,
): string | string[] | undefined {
  const normalizedValue = normalizeOptionalString(value);

  if (normalizedValue === undefined) {
    return undefined;
  }

  const addresses = normalizedValue
    .split(/[;,]/)
    .map((address) => address.trim())
    .filter((address, index, collection) => {
      return address.length > 0 && collection.indexOf(address) === index;
    });

  if (addresses.length === 0) {
    return undefined;
  }

  return addresses.length === 1 ? addresses[0] : addresses;
}
