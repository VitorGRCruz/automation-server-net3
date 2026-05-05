import { env } from "./env.js";

export const ixcConfig = Object.freeze({
  baseUrl: normalizeIxcBaseUrl(env.ixcBaseUrl),
  basicAuthCredential: normalizeIxcBasicAuthCredential(env.ixcBasicAuthCredential),
  timeoutMs: env.ixcApiTimeoutMs,
});

function normalizeIxcBaseUrl(baseUrl: string): string {
  return new URL(baseUrl.trim().replace(/^['"]+|['"]+$/g, "")).toString();
}

function normalizeIxcBasicAuthCredential(credential: string): string {
  const normalizedCredential = credential.trim();

  if (normalizedCredential.length === 0) {
    throw new Error("IXC basic auth credential must not be empty");
  }

  const separatorIndex = normalizedCredential.indexOf(":");

  if (separatorIndex <= 0 || separatorIndex === normalizedCredential.length - 1) {
    throw new Error("IXC basic auth credential must use the format 'id:senha'");
  }

  return normalizedCredential;
}
