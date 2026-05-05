import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";
import { appConfig } from "../../infra/config/app.config.js";
import {
  buildBasicAuthChallengeHeader,
  hasValidBasicAuth,
} from "../auth/basic-auth.js";

declare module "fastify" {
  interface FastifyInstance {
    requireBasicAuth: preHandlerHookHandler;
    requireMetricsAuth: preHandlerHookHandler;
  }
}

function buildUnauthorizedError(message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 401;
  return error;
}

function enforceConfiguredBasicAuth(
  authorizationHeader: string | undefined,
  reply: FastifyReply,
): void {
  if (
    hasValidBasicAuth(
      authorizationHeader,
      appConfig.basicAuth.username,
      appConfig.basicAuth.password,
    )
  ) {
    return;
  }

  reply.header("www-authenticate", buildBasicAuthChallengeHeader());

  if (!authorizationHeader) {
    throw buildUnauthorizedError("Missing Authorization header");
  }

  throw buildUnauthorizedError("Invalid basic authentication credentials");
}

async function requireBasicAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!appConfig.basicAuth.enabled) {
    return;
  }

  enforceConfiguredBasicAuth(request.headers.authorization, reply);
}

async function requireMetricsAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!appConfig.metrics.enabled || appConfig.metrics.exposure === "public") {
    return;
  }

  enforceConfiguredBasicAuth(request.headers.authorization, reply);
}

export async function authPlugin(server: FastifyInstance): Promise<void> {
  server.decorate("requireBasicAuth", requireBasicAuth);
  server.decorate("requireMetricsAuth", requireMetricsAuth);
}
