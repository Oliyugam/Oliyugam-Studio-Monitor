import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Server } from "node:http";
import type { SoftwareWorkState } from "../../../shared/contracts.js";

const MAX_BODY_BYTES = 8_192;
const ALLOWED_APPLICATIONS = new Set([
  "adobe-premiere-pro",
  "adobe-photoshop",
  "adobe-indesign",
]);
const ALLOWED_STATES = new Set<SoftwareWorkState["state"]>([
  "idle", "working", "rendering", "exporting", "unavailable",
]);

export class AdobeConnectorBridge {
  #server: Server | null = null;

  constructor(
    private readonly token: string,
    private readonly onState: (state: SoftwareWorkState) => boolean,
  ) {}

  async start(port = 17_464): Promise<void> {
    if (this.#server) return;
    const server = createServer((request, response) => this.#handle(request, response));
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
    this.#server = server;
  }

  async stop(): Promise<void> {
    const server = this.#server;
    this.#server = null;
    if (!server) return;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  #handle(request: IncomingMessage, response: ServerResponse): void {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "content-type, x-oliyugam-connector-token");
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }
    if (request.method !== "POST" || request.url !== "/v1/adobe-work-state") {
      response.writeHead(404).end();
      return;
    }
    if (request.headers["x-oliyugam-connector-token"] !== this.token) {
      response.writeHead(401).end();
      return;
    }
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) request.destroy();
    });
    request.on("end", () => {
      const state = parseState(body);
      if (!state || !this.onState(state)) {
        response.writeHead(400).end();
        return;
      }
      response.writeHead(204).end();
    });
    request.on("error", () => response.writeHead(400).end());
  }
}

function parseState(body: string): SoftwareWorkState | null {
  try {
    const value = JSON.parse(body) as Partial<SoftwareWorkState>;
    if (!value || typeof value.applicationId !== "string" || typeof value.state !== "string") return null;
    if (!ALLOWED_APPLICATIONS.has(value.applicationId) || !ALLOWED_STATES.has(value.state as SoftwareWorkState["state"])) return null;
    return {
      applicationId: value.applicationId,
      state: value.state as SoftwareWorkState["state"],
      observedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
