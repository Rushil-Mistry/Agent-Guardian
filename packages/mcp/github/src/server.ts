import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { GitProvider } from "@agent-guardian/shared";
import { FakeGitProvider } from "./fake-provider.js";

// ─── Provider injection ──────────────────────────────────────────────────────
const provider: GitProvider = new FakeGitProvider();

// ─── MCP Server Factory ──────────────────────────────────────────────────────

function createServer(): McpServer {
  const mcp = new McpServer({
    name: "agent-guardian-github",
    version: "1.0.0",
  });

  // Read operations — no restrictions
  mcp.tool(
    "get_recent_commits",
    "Get the most recent commits for a repository.",
    {
      repo: z
        .string()
        .describe("Repository name (e.g., 'org/payment-service')"),
      limit: z
        .number()
        .default(10)
        .describe("Maximum number of commits to return (default: 10)"),
    },
    async ({ repo, limit }) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            await provider.getRecentCommits(repo, limit),
            null,
            2,
          ),
        },
      ],
    }),
  );

  mcp.tool(
    "get_commit_diff",
    "Get the file diffs for a specific commit by SHA.",
    {
      repo: z.string().describe("Repository name"),
      sha: z.string().describe("Commit SHA to get the diff for"),
    },
    async ({ repo, sha }) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            await provider.getCommitDiff(repo, sha),
            null,
            2,
          ),
        },
      ],
    }),
  );

  mcp.tool(
    "get_file",
    "Get the contents of a file at a specific ref (branch, tag, or SHA).",
    {
      repo: z.string().describe("Repository name"),
      path: z.string().describe("File path within the repository"),
      ref: z
        .string()
        .optional()
        .describe("Git ref (branch, tag, or SHA). Defaults to main."),
    },
    async ({ repo, path, ref }) => ({
      content: [
        {
          type: "text" as const,
          text: await provider.getFile(repo, path, ref),
        },
      ],
    }),
  );

  // Write operations — scoped to branches/patches, NOT production merges.
  mcp.tool(
    "create_branch",
    "Create a new branch from an existing ref. Does NOT merge to production — that requires a separate deployment action through the deployment MCP.",
    {
      repo: z.string().describe("Repository name"),
      branch_name: z.string().describe("Name for the new branch"),
      from_ref: z
        .string()
        .default("main")
        .describe("Base ref to branch from (default: main)"),
    },
    async ({ repo, branch_name, from_ref }) => ({
      content: [
        {
          type: "text" as const,
          text: await provider.createBranch(repo, branch_name, from_ref),
        },
      ],
    }),
  );

  mcp.tool(
    "create_patch",
    "Create a patch (commit) on a branch with the given file changes. Does NOT merge to production.",
    {
      repo: z.string().describe("Repository name"),
      branch: z.string().describe("Target branch for the patch"),
      files: z
        .record(z.string())
        .describe(
          "Map of file paths to their new contents (e.g., {'src/fix.py': 'content...'})",
        ),
      message: z.string().describe("Commit message for the patch"),
    },
    async ({ repo, branch, files, message }) => ({
      content: [
        {
          type: "text" as const,
          text: await provider.createPatch(repo, branch, files, message),
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
  res.json({ status: "ok", server: "github-mcp" });
});

const PORT = parseInt(process.env["PORT"] ?? "3003", 10);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`GitHub MCP running on http://localhost:${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});
