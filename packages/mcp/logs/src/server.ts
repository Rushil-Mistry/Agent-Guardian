import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { LogProvider } from "@agent-guardian/shared";
import { FakeLogProvider } from "./fake-provider.js";

// ─── Provider injection ──────────────────────────────────────────────────────
const provider: LogProvider = new FakeLogProvider();

// ─── MCP Server Factory ──────────────────────────────────────────────────────

function createServer(): McpServer {
  const mcp = new McpServer({
    name: "agent-guardian-logs",
    version: "1.0.0",
  });

  // All tools are READ-ONLY — no write operations in the logs MCP.

  mcp.tool(
    "search_logs",
    "Search logs for a service by keyword or log level. Returns matching log entries.",
    {
      service: z.string().describe("Name of the service to search logs for"),
      query: z
        .string()
        .describe(
          'Search query (matches against message text and level, e.g. "error", "payment_method")',
        ),
      limit: z
        .number()
        .default(20)
        .describe("Maximum number of log entries to return (default: 20)"),
    },
    async ({ service, query, limit }) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            await provider.searchLogs(service, query, limit),
            null,
            2,
          ),
        },
      ],
    }),
  );

  mcp.tool(
    "get_error_trace",
    "Get a full error trace/stack trace by trace ID. Useful for debugging specific errors.",
    {
      trace_id: z.string().describe("The trace ID to look up"),
    },
    async ({ trace_id }) => {
      const trace = await provider.getErrorTrace(trace_id);
      return {
        content: [
          {
            type: "text" as const,
            text: trace
              ? JSON.stringify(trace, null, 2)
              : JSON.stringify({
                  error: `No trace found for ID: ${trace_id}`,
                }),
          },
        ],
      };
    },
  );

  mcp.tool(
    "get_recent_errors",
    "Get the most recent error log entries for a service.",
    {
      service: z.string().describe("Name of the service"),
      limit: z
        .number()
        .default(10)
        .describe("Maximum number of errors to return (default: 10)"),
    },
    async ({ service, limit }) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            await provider.getRecentErrors(service, limit),
            null,
            2,
          ),
        },
      ],
    }),
  );

  return mcp;
}

// ─── HTTP Transport (stateless, per-request) ──────────────────────────────────

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal error" },
        id: null,
      });
    }
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "logs-mcp" });
});

const PORT = parseInt(process.env["PORT"] ?? "3002", 10);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Logs MCP running on http://localhost:${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});
