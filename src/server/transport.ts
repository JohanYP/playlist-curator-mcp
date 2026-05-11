// Transport setup. stdio is the default — Claude Desktop / OpenClaw /
// Cline all expect the MCP server to be invoked as a stdio subprocess.
// HTTP is opt-in for clients like OpenCode that consume an HTTP MCP.
//
// We don't expose SSE separately: the StreamableHTTPServerTransport from
// the SDK does both streaming and direct HTTP under one endpoint, so a
// single HTTP server is enough.

import http from "node:http";
import { randomUUID } from "node:crypto";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "../utils/logger.js";

export interface StdioRunResult {
  /** Resolves when the transport closes (client disconnected). */
  done: Promise<void>;
}

export async function runStdio(server: McpServer): Promise<StdioRunResult> {
  const transport = new StdioServerTransport();
  const done = new Promise<void>((resolve) => {
    transport.onclose = () => resolve();
  });
  await server.connect(transport);
  return { done };
}

export interface HttpRunOptions {
  port: number;
  host?: string;
}

export interface HttpRunResult {
  url: string;
  close: () => Promise<void>;
}

/**
 * Boots a Node HTTP server on the given port and routes POST /mcp to
 * the SDK's StreamableHTTP transport. We use stateful mode (with a
 * sessionIdGenerator) so the transport tracks per-session SSE streams
 * correctly; for our single-user case statelessness would also work,
 * but stateful is what `npx -y playlist-curator-mcp serve --transport http`
 * users likely expect.
 */
export async function runHttp(server: McpServer, options: HttpRunOptions): Promise<HttpRunResult> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  await server.connect(transport);

  const httpServer = http.createServer(async (req, res) => {
    // Only /mcp is a real endpoint; everything else gets a 404.
    if (!req.url || !req.url.startsWith("/mcp")) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }

    try {
      await transport.handleRequest(req, res);
    } catch (err) {
      logger.error("HTTP transport handleRequest threw", err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "internal error" }));
      } else {
        try {
          res.end();
        } catch {
          /* ignore */
        }
      }
    }
  });

  const host = options.host ?? "127.0.0.1";
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(options.port, host, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  const url = `http://${host}:${options.port}/mcp`;
  return {
    url,
    close: async () => {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
