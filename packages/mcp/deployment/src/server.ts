import { randomUUID } from "node:crypto";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { evaluate as evaluatePolicy } from "@agent-guardian/policy-engine";
import type { Action as DomainAction } from "@agent-guardian/domain";
import {
  type Action,
  type DeploymentProvider,
  type PolicyEngine,
} from "@agent-guardian/shared";
import { FakeDeploymentProvider } from "./fake-provider.js";

// ─── Real PolicyEngine integration (Milestone M2) ─────────────────────────────
// Integrated with Collaborator A's deterministic policy-engine & YAML rule matcher.

export const realPolicyEngine: PolicyEngine = {
  evaluate: (action: Action) => {
    const domainAction: DomainAction = {
      id: action.id,
      incidentId: "inc-live-incident",
      tool: "deployment-mcp",
      operation: action.operation as DomainAction["operation"],
      environment: action.environment as DomainAction["environment"],
      parameters: action.parameters ?? {},
      description: `Deployment action '${action.operation}' on target '${action.target}'`,
      requestedAt: action.timestamp ? action.timestamp.toISOString() : new Date().toISOString(),
      requestedBy: action.requestedBy ?? "agent-guardian",
    };

    const decision = evaluatePolicy(domainAction);

    return {
      allowed: decision.allowed,
      risk: decision.riskAssessment.level as "low" | "medium" | "high" | "critical",
      requiresApproval: decision.requiresApproval,
      reason: decision.reason,
      policyId: decision.matchedRule ?? "rule-unmatched",
    };
  },
};

const provider: DeploymentProvider = new FakeDeploymentProvider();
const engine: PolicyEngine = realPolicyEngine;


// ─── Policy-gated deployment helpers ──────────────────────────────────────────

interface ApprovalRequest {
  action: Action;
  decision: {
    risk: string;
    requiresApproval: boolean;
    reason: string;
    policyId: string;
  };
  status: "pending_approval";
  message: string;
}

function createAction(
  operation: Action["operation"],
  target: string,
  parameters?: Record<string, unknown>,
): Action {
  return {
    id: randomUUID(),
    operation,
    target,
    environment: "production",
    parameters,
    requestedBy: "agent",
    timestamp: new Date(),
  };
}

function requestApproval(
  action: Action,
  decision: {
    risk: string;
    requiresApproval: boolean;
    reason: string;
    policyId: string;
  },
): ApprovalRequest {
  return {
    action,
    decision,
    status: "pending_approval",
    message: `Action '${action.operation}' on '${action.target}' requires human approval (risk: ${decision.risk})`,
  };
}

// ─── MCP Server Factory ──────────────────────────────────────────────────────

function createServer(): McpServer {
  const mcp = new McpServer({
    name: "agent-guardian-deployment",
    version: "1.0.0",
  });

  // READ operation — no policy check needed
  mcp.tool(
    "get_deployment_status",
    "Get the current deployment status of a service including version, replicas, and health.",
    {
      service: z.string().describe("Name of the service"),
    },
    async ({ service }) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            await provider.getDeploymentStatus(service),
            null,
            2,
          ),
        },
      ],
    }),
  );

  // WRITE operations — ALL go through PolicyEngine.evaluate() first

  mcp.tool(
    "deploy",
    "Deploy a specific version of a service. This is a write operation that requires policy evaluation and may require human approval for high-risk deployments.",
    {
      service: z.string().describe("Name of the service to deploy"),
      version: z.string().describe("Version to deploy (e.g., 'v1.42')"),
    },
    async ({ service, version }) => {
      const action = createAction("deploy", service, { version });
      const decision = engine.evaluate(action);

      if (!decision.allowed) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: "POLICY_DENIED",
                  reason: decision.reason,
                  policyId: decision.policyId,
                  action: action.id,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }

      if (decision.requiresApproval) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                requestApproval(action, decision),
                null,
                2,
              ),
            },
          ],
        };
      }

      const result = await provider.deploy(service, version);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  mcp.tool(
    "rollback",
    "Rollback a service to a previous version. This is a write operation that requires policy evaluation.",
    {
      service: z.string().describe("Name of the service to rollback"),
      to_version: z
        .string()
        .describe("Version to rollback to (e.g., 'v1.40')"),
    },
    async ({ service, to_version }) => {
      const action = createAction("rollback", service, {
        toVersion: to_version,
      });
      const decision = engine.evaluate(action);

      if (!decision.allowed) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: "POLICY_DENIED",
                  reason: decision.reason,
                  policyId: decision.policyId,
                  action: action.id,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }

      if (decision.requiresApproval) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                requestApproval(action, decision),
                null,
                2,
              ),
            },
          ],
        };
      }

      const result = await provider.rollback(service, to_version);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  mcp.tool(
    "restart_service",
    "Restart a service without changing its version. This is a write operation that requires policy evaluation.",
    {
      service: z.string().describe("Name of the service to restart"),
    },
    async ({ service }) => {
      const action = createAction("restart", service);
      const decision = engine.evaluate(action);

      if (!decision.allowed) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: "POLICY_DENIED",
                  reason: decision.reason,
                  policyId: decision.policyId,
                  action: action.id,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }

      if (decision.requiresApproval) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                requestApproval(action, decision),
                null,
                2,
              ),
            },
          ],
        };
      }

      const result = await provider.restartService(service);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
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
  res.json({ status: "ok", server: "deployment-mcp" });
});

const PORT = parseInt(process.env["PORT"] ?? "3005", 10);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Deployment MCP running on http://localhost:${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});
