import { createHash } from "node:crypto";

export function buildCsatDurableIdempotencyKey(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join(":")).digest("hex");
}

export function buildCsatDurablePayloadHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
