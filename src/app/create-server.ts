import Fastify from "fastify";
import { appConfig } from "../infra/config/app.config.js";
import { authPlugin } from "./plugins/auth.plugin.js";
import { errorHandlerPlugin } from "./plugins/error-handler.plugin.js";
import { healthRoute } from "./routes/health.route.js";
import { manualRoute } from "./routes/manual.route.js";
import { metricsRoute } from "./routes/metrics.route.js";
import { nfeEmailDispatchRoute } from "./routes/nfe-email-dispatch.route.js";

export function createServer() {
  const server = Fastify({
    logger: {
      level: appConfig.logLevel,
    },
  });

  void errorHandlerPlugin(server);
  void authPlugin(server);
  server.register(healthRoute);
  if (appConfig.metrics.enabled) {
    server.register(metricsRoute);
  }
  server.register(manualRoute);
  server.register(nfeEmailDispatchRoute);

  return server;
}
