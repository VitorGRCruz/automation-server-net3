import { Client, Connection } from "@temporalio/client";
import { temporalConfig } from "../../infra/config/temporal.config.js";

export async function createTemporalConnection(): Promise<Connection> {
  return Connection.connect({
    address: temporalConfig.address,
  });
}

export function createTemporalClient(connection: Connection): Client {
  return new Client({
    connection,
    namespace: temporalConfig.namespace,
  });
}
