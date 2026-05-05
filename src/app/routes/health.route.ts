import type { FastifyInstance } from "fastify";
import { healthService } from "../health/health.service.js";

export async function healthRoute(server: FastifyInstance): Promise<void> {
  server.get("/livez", async (_request, reply) => {
    return reply.status(200).send(healthService.getLiveness());
  });

  server.get("/health", async (_request, reply) => {
    return reply.status(200).send(healthService.getLiveness());
  });

  server.get("/readyz", async (_request, reply) => {
    const readiness = await healthService.getReadiness();
    const statusCode = readiness.ok ? 200 : 503;

    return reply.status(statusCode).send(readiness);
  });

  server.get("/healthz", async (_request, reply) => {
    const details = await healthService.getDetails();
    const statusCode = details.ok ? 200 : 503;

    return reply.status(statusCode).send(details);
  });
}
