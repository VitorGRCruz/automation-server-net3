import type { FastifyInstance } from "fastify";
import { renderMetrics } from "../../infra/observability/metrics.js";

export async function metricsRoute(server: FastifyInstance): Promise<void> {
  server.get(
    "/metrics",
    {
      preHandler: server.requireMetricsAuth,
    },
    async (_request, reply) => {
      const metrics = await renderMetrics();

      return reply
        .header("content-type", metrics.contentType)
        .status(200)
        .send(metrics.body);
    },
  );
}
