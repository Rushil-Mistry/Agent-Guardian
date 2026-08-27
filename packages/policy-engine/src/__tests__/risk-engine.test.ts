// ─── Risk Engine Tests ───────────────────────────────────────

import { describe, it, expect } from "vitest";
import { assessRisk } from "../risk-engine.js";
import type { Action } from "@agent-guardian/domain";

/** Helper to create a minimal Action for testing */
function makeAction(overrides: Partial<Action> = {}): Action {
  return {
    id: "test-action-1",
    incidentId: "inc-1",
    tool: "status-check",
    operation: "read",
    environment: "sandbox",
    parameters: {},
    description: "Test action",
    requestedAt: new Date().toISOString(),
    requestedBy: "test-agent",
    ...overrides,
  };
}

describe("Risk Engine — assessRisk()", () => {
  it("should classify a read-only sandbox action as low risk", () => {
    const action = makeAction({
      tool: "logs-viewer",
      operation: "read",
      environment: "sandbox",
    });
    const result = assessRisk(action);

    expect(result.level).toBe("low");
    expect(result.score).toBeLessThan(25);
    expect(result.factors).toHaveLength(7);
  });

  it("should classify a sandbox execute action as low or medium risk", () => {
    const action = makeAction({
      tool: "sandbox-exec",
      operation: "execute",
      environment: "sandbox",
    });
    const result = assessRisk(action);

    expect(["low", "medium"]).toContain(result.level);
    expect(result.score).toBeLessThan(50);
  });

  it("should classify a production deploy action as high risk", () => {
    const action = makeAction({
      tool: "deploy-service",
      operation: "deploy",
      environment: "production",
    });
    const result = assessRisk(action);

    expect(["high", "critical"]).toContain(result.level);
    expect(result.score).toBeGreaterThanOrEqual(50);
  });

  it("should classify a production delete action as critical risk", () => {
    const action = makeAction({
      tool: "kubectl-delete",
      operation: "delete",
      environment: "production",
    });
    const result = assessRisk(action);

    expect(result.level).toBe("critical");
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("should assign high tool_sensitivity to unknown tools", () => {
    const action = makeAction({
      tool: "unknown-tool-xyz",
      operation: "write",
      environment: "staging",
    });
    const result = assessRisk(action);
    const toolFactor = result.factors.find((f) => f.category === "tool_sensitivity");

    expect(toolFactor).toBeDefined();
    // Unknown tools default to sensitivity 80, weight 0.10 → contribution 8
    expect(toolFactor!.contribution).toBe(8);
  });

  it("should include all 7 risk factor categories", () => {
    const action = makeAction();
    const result = assessRisk(action);
    const categories = result.factors.map((f) => f.category);

    expect(categories).toContain("tool_sensitivity");
    expect(categories).toContain("operation_type");
    expect(categories).toContain("environment");
    expect(categories).toContain("data_sensitivity");
    expect(categories).toContain("destructive_potential");
    expect(categories).toContain("blast_radius");
    expect(categories).toContain("reversibility");
  });

  it("should increase risk score with PII data sensitivity", () => {
    const baseAction = makeAction();
    const piiAction = makeAction({
      parameters: { dataSensitivity: "pii" },
    });

    const baseResult = assessRisk(baseAction);
    const piiResult = assessRisk(piiAction);

    expect(piiResult.score).toBeGreaterThan(baseResult.score);
  });

  it("should score delete operations as irreversible", () => {
    const action = makeAction({
      operation: "delete",
      environment: "production",
    });
    const result = assessRisk(action);
    const reversibility = result.factors.find((f) => f.category === "reversibility");

    expect(reversibility).toBeDefined();
    expect(reversibility!.value).toBe("irreversible");
  });
});
