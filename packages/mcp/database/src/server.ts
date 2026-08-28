import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { WriteGuardError, type DatabaseProvider } from "@agent-guardian/shared";
import { FakeDatabaseProvider } from "./fake-provider.js";

// ─── Provider injection ──────────────────────────────────────────────────────
const provider: DatabaseProvider = new FakeDatabaseProvider();

// ─── SQL Write Guard ──────────────────────────────────────────────────────────
// Reject any non-SELECT/EXPLAIN statement BEFORE it reaches the provider or
// policy engine. This is a hard safety boundary.

function assertReadOnly(query: string): void {
  const trimmed = query
    .trim()
    .replace(/^\/\*.*?\*\//gs, "")
    .trim();
  const firstWord = trimmed.split(/\s+/)[0]?.toUpperCase();

  const ALLOWED_STATEMENTS = new Set([
    "SELECT",
    "EXPLAIN",
    "WITH",
    "SHOW",
    "DESCRIBE",
  ]);

  if (!firstWord || !ALLOWED_STATEMENTS.has(firstWord)) {
    throw new WriteGuardError(trimmed);
  }

  // Additional guard: reject CTEs that contain write operations
  if (firstWord === "WITH") {
    const WRITE_KEYWORDS = [
      "INSERT",
      "UPDATE",
      "DELETE",
      "DROP",
      "ALTER",
      "CREATE",
      "TRUNCATE",
      "GRANT",
      "REVOKE",
    ];
    for (const keyword of WRITE_KEYWORDS) {
      const regex = new RegExp(`\\b${keyword}\\b`, "i");
      if (regex.test(trimmed)) {
        throw new WriteGuardError(trimmed);
      }
    }
  }
}

// ─── MCP Server Factory ──────────────────────────────────────────────────────

function createServer(): McpServer {
  const mcp = new McpServer({
    name: "agent-guardian-database",
    version: "1.0.0",
  });

  mcp.tool(
    "get_schema",
    "Get the database schema including all tables and their column definitions.",
    {
      database: z.string().describe("Database name"),
    },
    async ({ database }) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(await provider.getSchema(database), null, 2),
        },
      ],
    }),
  );

  mcp.tool(
    "read_query",
    "Execute a read-only SQL query. Only SELECT, EXPLAIN, WITH (read-only CTEs), SHOW, and DESCRIBE statements are allowed. Any write operations will be rejected.",
    {
      database: z.string().describe("Database name"),
      query: z
        .string()
        .describe("SQL query — must be read-only (SELECT, EXPLAIN, etc.)"),
    },
    async ({ database, query }) => {
      try {
        assertReadOnly(query);
        const result = await provider.readQuery(database, query);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof WriteGuardError) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error: "WRITE_GUARD_VIOLATION",
                    message: error.message,
                    hint: "Only SELECT, EXPLAIN, WITH (read-only), SHOW, and DESCRIBE statements are allowed.",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
        throw error;
      }
    },
  );

  mcp.tool(
    "explain_query",
    "Get the execution plan for a SQL query without executing it.",
    {
      database: z.string().describe("Database name"),
      query: z.string().describe("SQL query to explain"),
    },
    async ({ database, query }) => ({
      content: [
        {
          type: "text" as const,
          text: await provider.explainQuery(database, query),
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
  res.json({ status: "ok", server: "database-mcp" });
});

const PORT = parseInt(process.env["PORT"] ?? "3004", 10);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Database MCP running on http://localhost:${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});
