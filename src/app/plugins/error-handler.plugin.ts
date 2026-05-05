import type { FastifyInstance } from "fastify";
import { getErrorLogDetails } from "../../infra/observability/error-details.js";

function resolveStatusCode(error: unknown): number {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number" &&
    error.statusCode >= 400
  ) {
    return error.statusCode;
  }

  return 500;
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Internal server error";
}

export async function errorHandlerPlugin(server: FastifyInstance): Promise<void> {
  server.setErrorHandler((error, request, reply) => {
    const statusCode = resolveStatusCode(error);
    const message = resolveErrorMessage(error);
    const errorDetails = getErrorLogDetails(error);

    request.log.error(
      {
        err: error,
        ...errorDetails,
        statusCode,
        route: request.routeOptions.url,
        method: request.method,
        requestId: request.id,
      },
      message,
    );

    void reply.status(statusCode).send({
      ok: false,
      error: message,
    });
  });
}
