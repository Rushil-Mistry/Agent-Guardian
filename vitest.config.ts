import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@agent-guardian/domain": resolve(__dirname, "packages/domain/src/index.ts"),
      "@agent-guardian/audit": resolve(__dirname, "packages/audit/src/index.ts"),
      "@agent-guardian/policy-engine": resolve(__dirname, "packages/policy-engine/src/index.ts"),
      "@agent-guardian/kill-switch": resolve(__dirname, "packages/kill-switch/src/index.ts"),
      "@agent-guardian/shared": resolve(__dirname, "packages/shared/src/index.ts"),
      "@agent-guardian/mcp-monitoring": resolve(__dirname, "packages/mcp/monitoring/src/server.ts"),
      "@agent-guardian/mcp-logs": resolve(__dirname, "packages/mcp/logs/src/server.ts"),
      "@agent-guardian/mcp-github": resolve(__dirname, "packages/mcp/github/src/server.ts"),
      "@agent-guardian/mcp-database": resolve(__dirname, "packages/mcp/database/src/server.ts"),
      "@agent-guardian/mcp-deployment": resolve(__dirname, "packages/mcp/deployment/src/server.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["packages/*/src/**/*.test.ts"],
  },
});
