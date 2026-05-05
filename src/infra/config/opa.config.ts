import { env } from "./env.js";

export const opaConfig = Object.freeze({
  baseUrl: normalizeOpaBaseUrl(env.opaBaseUrl),
  apiToken: env.opaApiToken,
  timeoutMs: env.opaApiTimeoutMs,
});

function normalizeOpaBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  const pathname = url.pathname.replace(/\/+$/, "");
  const opaAttendantPathSuffix = "/atendente";

  if (pathname === "" || pathname === "/") {
    url.pathname = "/api/v1";
    return url.toString();
  }

  if (pathname.endsWith(opaAttendantPathSuffix)) {
    url.pathname = `${pathname.slice(0, -opaAttendantPathSuffix.length)}/api/v1`.replace(
      /\/{2,}/g,
      "/",
    );
    return url.toString();
  }

  return url.toString();
}
