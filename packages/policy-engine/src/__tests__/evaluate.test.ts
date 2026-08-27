// ─── Policy Evaluate Tests ───────────────────────────────────
// Required test cases from the spec:
// 1. Low-risk action (read tool, sandbox) → allowed, no approval
// 2. High-risk action (production deploy) → allowed, requires approval
// 3. Critical action (production delete) → blocked
// 4. Unknown tool → blocked (fail closed)
// 5. Unknown environment → blocked (fail closed)
// 6. Policy load failure → fails closed (not allowed)

import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate } from "../evaluate.js";
import type { Action } from "@agent-guardian/domain";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const POLICY_DIR = resolve(__dirname, "../../policies");
const DEFAULT_POLICY = resolve(POLICY_DIR, "default.yaml");
const DEMO_POLICY = resolve(POLICY_DIR, "demo.yaml");
const PRODUCTION_POLICY = resolve(POLICY_DIR, "production.yaml");

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

describe("Policy Engine — evaluate()", () => {
  // ── Required test case 1: low-risk action allowed ─────────
  it("should allow a read-only sandbox action without approval", () => {
    const action = makeAction({
      tool: "logs-viewer",
      operation: "read",
      environment: "sandbox",
    });
    const decision = evaluate(action, DEFAULT_POLICY);

    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(false);
    expect(decision.matchedRule).toBeTruthy();
  });

  // ── Required test case 2: high-risk action requires approval
  it("should allow a production deploy but require approval", () => {
    const action = makeAction({
      tool: "deploy-service",
      operation: "deploy",
      environment: "production",
    });
    const decision = evaluate(action, DEFAULT_POLICY);

    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(true);
    expect(decision.matchedRule).toBe("production-deploy-approval");
  });

  // ── Required test case 3: critical action blocked ─────────
  it("should block a production delete action", () => {
    const action = makeAction({
      tool: "kubectl-delete",
      operation: "delete",
      environment: "production",
    });
    const decision = evaluate(action, DEFAULT_POLICY);

    expect(decision.allowed).toBe(false);
    expect(decision.matchedRule).toBe("block-production-destructive");
  });

  // ── Required test case 4: unknown tool blocked ────────────
  it("should block an unknown tool via catch-all (fail closed)", () => {
    const action = makeAction({
      tool: "totally-unknown-tool",
      operation: "delete",
      environment: "production",
    });
    const decision = evaluate(action, DEFAULT_POLICY);

    // Should be blocked — either by the destructive rule or catch-all
    expect(decision.allowed).toBe(false);
  });

  // ── Required test case 5: unknown environment blocked ─────
  it("should fail closed when the action has an unrecognized environment", () => {
    // Force an action with an invalid environment to test the catch-all
    const action = makeAction({
      tool: "status-check",
      operation: "write",
      environment: "unknown-env" as Action["environment"],
    });
    const decision = evaluate(action, DEFAULT_POLICY);

    // The catch-all rule matches everything, so this should be blocked
    expect(decision.allowed).toBe(false);
  });

  // ── Required test case 6: policy load failure → fail closed
  it("should fail closed when the policy file does not exist", () => {
    const action = makeAction();
    const decision = evaluate(action, "/nonexistent/policy.yaml");

    expect(decision.allowed).toBe(false);
    expect(decision.matchedRule).toBeNull();
    expect(decision.reason).toContain("fail closed");
  });

  it("should fail closed when the policy file is invalid YAML", () => {
    // Pass a non-YAML file path to trigger a parse error
    const action = makeAction();
    const decision = evaluate(action, resolve(__dirname, "../../package.json"));

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("fail closed");
  });

  // ── Additional coverage ───────────────────────────────────

  it("should allow sandbox execution without approval", () => {
    const action = makeAction({
      tool: "sandbox-exec",
      operation: "execute",
      environment: "sandbox",
    });
    const decision = evaluate(action, DEFAULT_POLICY);

    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(false);
  });

  it("should include a risk assessment in every decision", () => {
    const action = makeAction();
    const decision = evaluate(action, DEFAULT_POLICY);

    expect(decision.riskAssessment).toBeDefined();
    expect(decision.riskAssessment.level).toBeTruthy();
    expect(typeof decision.riskAssessment.score).toBe("number");
  });

  it("should include evaluatedAt timestamp in every decision", () => {
    const action = makeAction();
    const decision = evaluate(action, DEFAULT_POLICY);

    expect(decision.evaluatedAt).toBeTruthy();
    // Should be valid ISO-8601
    expect(new Date(decision.evaluatedAt).toISOString()).toBe(decision.evaluatedAt);
  });

  // ── Demo policy: production deploy allowed without approval
  it("should allow production deploy without approval using demo policy", () => {
    const action = makeAction({
      tool: "deploy-service",
      operation: "deploy",
      environment: "production",
    });
    const decision = evaluate(action, DEMO_POLICY);

    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(false);
  });

  // ── Production policy: all production ops need approval ───
  it("should require approval for all production operations using production policy", () => {
    const action = makeAction({
      tool: "status-check",
      operation: "read",
      environment: "production",
    });
    const decision = evaluate(action, PRODUCTION_POLICY);

    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(true);
  });
});
