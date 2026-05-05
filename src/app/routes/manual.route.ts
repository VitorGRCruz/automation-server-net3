import type { FastifyInstance } from "fastify";
import { startDiagnosticsWorkflow } from "../../temporal/client/diagnostics.client.js";

function buildBadRequestError(message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 400;
  return error;
}

function normalizeDiagnosticsMessage(body: unknown): string {
  if (body === undefined) {
    return "ping";
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw buildBadRequestError("Request body must be a JSON object");
  }

  const { message } = body as { message?: unknown };

  if (message === undefined) {
    return "ping";
  }

  if (typeof message !== "string") {
    throw buildBadRequestError("Field message must be a string");
  }

  const normalizedMessage = message.trim();

  if (normalizedMessage.length === 0) {
    throw buildBadRequestError("Field message must not be empty");
  }

  return normalizedMessage;
}

export async function manualRoute(server: FastifyInstance): Promise<void> {
  server.post<{ Body: unknown }>(
    "/manual/actions/diagnostics/ping",
    {
      preHandler: server.requireBasicAuth,
    },
    async (request, reply) => {
      const message = normalizeDiagnosticsMessage(request.body);

      return reply.status(200).send({
        ok: true,
        data: {
          action: "diagnostics-ping",
          echoedMessage: message,
          checkedAt: new Date().toISOString(),
        },
      });
    },
  );

  server.post<{ Body: unknown }>(
    "/manual/workflows/diagnostics/echo",
    {
      preHandler: server.requireBasicAuth,
    },
    async (request, reply) => {
      const message = normalizeDiagnosticsMessage(request.body);
      const execution = await startDiagnosticsWorkflow({
        requestId: request.id,
        source: "manual",
        message,
      });

      request.log.info(
        {
          workflowId: execution.workflowId,
          runId: execution.runId,
        },
        "Started diagnostics workflow",
      );

      return reply.status(202).send({
        ok: true,
        workflowId: execution.workflowId,
        runId: execution.runId,
      });
    },
  );
}
