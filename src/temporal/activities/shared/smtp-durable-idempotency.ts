import { createHash } from "node:crypto";

export function buildSmtpDurableIdempotencyKey(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join(":")).digest("hex");
}

export function buildSmtpDurablePayloadHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
