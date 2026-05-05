import http from "node:http";
import https from "node:https";

export interface SharedHttpResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  bodyText: string;
}

interface SharedHttpRequestInput {
  url: URL;
  method: string;
  headers?: Record<string, string>;
  body?: string | undefined;
  timeoutMs: number;
}

const sharedHttpAgent = new http.Agent({
  keepAlive: true,
});

const sharedHttpsAgent = new https.Agent({
  keepAlive: true,
});

export async function executeSharedHttpRequest(
  input: SharedHttpRequestInput,
): Promise<SharedHttpResponse> {
  const transport = input.url.protocol === "https:" ? https : http;
  const agent = input.url.protocol === "https:" ? sharedHttpsAgent : sharedHttpAgent;

  return new Promise<SharedHttpResponse>((resolve, reject) => {
    const request = transport.request(
      input.url,
      {
        method: input.method,
        headers: input.headers,
        agent,
      },
      (response) => {
        const bodyChunks: Buffer[] = [];

        response.on("data", (chunk) => {
          bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            headers: response.headers,
            bodyText: Buffer.concat(bodyChunks).toString("utf8"),
          });
        });

        response.on("error", (error) => {
          reject(error);
        });
      },
    );

    request.setTimeout(input.timeoutMs, () => {
      const timeoutError = Object.assign(new Error("HTTP request timed out"), {
        code: "ETIMEDOUT",
      });

      request.destroy(timeoutError);
    });

    request.on("error", (error) => {
      reject(error);
    });

    if (input.body !== undefined) {
      request.write(input.body);
    }

    request.end();
  });
}

export async function closeSharedHttpClients(): Promise<void> {
  sharedHttpAgent.destroy();
  sharedHttpsAgent.destroy();
}
