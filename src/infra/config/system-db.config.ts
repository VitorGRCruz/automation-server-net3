import { env } from "./env.js";

export const systemDbConfig = Object.freeze({
  host: env.systemDbHost,
  port: env.systemDbPort,
  database: env.systemDbDatabase,
  username: env.systemDbUsername,
  password: env.systemDbPassword,
  connectTimeoutMs: env.systemDbConnectTimeoutMs,
  connectionLimit: env.systemDbConnectionLimit,
});
