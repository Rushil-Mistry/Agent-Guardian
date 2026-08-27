import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { MonitoringProvider } from "@agent-guardian/shared";
import { FakeMonitoringProvider } from "./fake-provider.js";

// ─── Provider injection ──────────────────────────────────────────────────────
// Swap FakeMonitoringProvider for a real one (e.g., PrometheusProvider) when ready.
const provider: MonitoringProvider = new FakeMonitoringProvider();

// ─── MCP Server Factory ──────────────────────────────────────────────────────
// Per the MCP SDK's stateless HTTP pattern, we create fresh McpServer +
// transport instances for every request. Tool registrations use the shared
// provider singleton — no state leakage between requests.

function createServer(): McpServer {
  const mcp = new McpServer({
    name: "agent-guardian-monitoring",
    version: "1.0.0",
  });

  // All tools are READ-ONLY — no write operations in the monitoring MCP.

  mcp.tool(
    "get_service_health",
    "Get the current health status of a service including error rate, latency, and instance counts.",
    {
      service: z.string().describe("Name of the service to check"),
    },
    async ({ service }) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            await provider.getServiceHealth(service),
            null,
            2,
          ),
        },
      ],
    }),
  );

  mcp.tool(
    "get_metrics",
    "Get time-series metrics for a service over a specified time window.",
    {
      service: z.string().describe("Name of the service"),
      metric: z
        .string()
        .describe(
          'Metric name (e.g., "error_rate", "latency", "request_count")',
        ),
      window_minutes: z
        .number()
        .default(60)
        .describe("Time window in minutes (default: 60)"),
    },
    async ({ service, metric, window_minutes }) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            await provider.getMetrics(service, metric, window_minutes),
            null,
            2,
          ),
        },
      ],
    }),
  );

  mcp.tool(
    "get_error_rate",
    "Get the current error rate percentage for a service.",
    {
      service: z.string().describe("Name of the service"),
      window_minutes: z
        .number()
        .default(30)
        .describe("Time window in minutes (default: 30)"),
    },
    async ({ service, window_minutes }) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              service,
              errorRate: await provider.getErrorRate(service, window_minutes),
              windowMinutes: window_minutes,
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  mcp.tool(
    "get_latency",
    "Get the current average latency in milliseconds for a service.",
    {
      service: z.string().describe("Name of the service"),
      window_minutes: z
        .number()
        .default(30)
        .describe("Time window in minutes (default: 30)"),
    },
    async ({ service, window_minutes }) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              service,
              latencyMs: await provider.getLatency(service, window_minutes),
              windowMinutes: window_minutes,
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  mcp.tool(
    "get_recent_alerts",
    "Get recent alerts for a service, ordered by most recent first.",
    {
      service: z.string().describe("Name of the service"),
      limit: z
        .number()
        .default(10)
        .describe("Maximum number of alerts to return (default: 10)"),
    },
    async ({ service, limit }) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            await provider.getRecentAlerts(service, limit),
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
  res.json({ status: "ok", server: "monitoring-mcp" });
});

const PORT = parseInt(process.env["PORT"] ?? "3001", 10);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Monitoring MCP running on http://localhost:${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});
