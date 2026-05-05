import { createHash } from "node:crypto";

export function buildCobrancasDurableIdempotencyKey(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join(":")).digest("hex");
}

export function buildCobrancasDurablePayloadHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
