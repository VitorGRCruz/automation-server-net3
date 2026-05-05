import { createServer } from "./create-server.js";
import { appConfig } from "../infra/config/app.config.js";
import { closeSharedErpDbClient } from "../integrations/erp-db/erp-db.client.js";
import { closeSharedHttpClients } from "../infra/http/shared-http-client.js";
import {
  registerGracefulShutdown,
  runShutdownSteps,
} from "../infra/runtime/graceful-shutdown.js";
import { closeSharedSystemDbClient } from "../infra/system-db/system-db.client.js";
import { runSystemDbMigrations } from "../infra/system-db/run-system-db-migrations.js";

async function runServer(): Promise<void> {
  await runSystemDbMigrations();
  const server = createServer();
  const shutdown = registerGracefulShutdown({
    component: "api",
    logger: {
      info(message, context) {
        server.log.info(context ?? {}, message);
      },
      warn(message, context) {
        server.log.warn(context ?? {}, message);
      },
      error(message, error, context) {
        server.log.error(
          {
            ...context,
            error,
          },
          message,
        );
      },
    },
    onSignal: async (signal) => {
      await runShutdownSteps(
        {
          info(message, context) {
            server.log.info(context ?? {}, message);
          },
          warn(message, context) {
            server.log.warn(context ?? {}, message);
          },
          error(message, error, context) {
            server.log.error(
              {
                ...context,
                error,
              },
              message,
            );
          },
        },
        {
          component: "api",
          signal,
        },
        [
          {
            name: "stop HTTP server",
            run: async () => {
              await server.close();
            },
          },
          {
            name: "close shared system DB pool",
            run: async () => {
              await closeSharedSystemDbClient();
            },
          },
          {
            name: "close shared ERP DB pool",
            run: async () => {
              await closeSharedErpDbClient();
            },
          },
          {
            name: "close shared HTTP agents",
            run: async () => {
              await closeSharedHttpClients();
            },
          },
        ],
      );
    },
  });

  try {
    await server.listen({
      host: appConfig.host,
      port: appConfig.port,
    });

    server.log.info(
      {
        environment: appConfig.environment,
        host: appConfig.host,
        port: appConfig.port,
      },
      "HTTP server running",
    );
  } catch (error) {
    shutdown.remove();
    server.log.error(error, "Failed to start HTTP server");
    await runShutdownSteps(
      {
        info(message, context) {
          server.log.info(context ?? {}, message);
        },
        warn(message, context) {
          server.log.warn(context ?? {}, message);
        },
        error(message, shutdownError, context) {
          server.log.error(
            {
              ...context,
              error: shutdownError,
            },
            message,
          );
        },
      },
      {
        component: "api",
        signal: null,
      },
      [
        {
          name: "stop HTTP server",
          run: async () => {
            await server.close();
          },
        },
        {
          name: "close shared system DB pool",
          run: async () => {
            await closeSharedSystemDbClient();
          },
        },
        {
          name: "close shared ERP DB pool",
          run: async () => {
            await closeSharedErpDbClient();
          },
        },
        {
          name: "close shared HTTP agents",
          run: async () => {
            await closeSharedHttpClients();
          },
        },
      ],
    );
    process.exitCode = 1;
  }
}

runServer().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
