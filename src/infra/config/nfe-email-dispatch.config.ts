import { env } from "./env.js";

export const nfeEmailDispatchConfig = Object.freeze({
  discoveryWindowDays: env.nfeEmailDispatchDiscoveryWindowDays,
  maxConcurrentChildren: env.nfeEmailDispatchMaxConcurrentChildren,
  maxSendAttempts: env.nfeEmailDispatchMaxSendAttempts,
  pdfTmpDir: env.nfeEmailDispatchPdfTmpDir,
});
