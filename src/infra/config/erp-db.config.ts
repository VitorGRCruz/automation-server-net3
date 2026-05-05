import { env } from "./env.js";

export const erpDbConfig = Object.freeze({
  host: env.erpDbHost,
  port: env.erpDbPort,
  database: env.erpDbDatabase,
  username: env.erpDbUsername,
  password: env.erpDbPassword,
  connectTimeoutMs: env.erpDbConnectTimeoutMs,
  connectionLimit: env.erpDbConnectionLimit,
});
