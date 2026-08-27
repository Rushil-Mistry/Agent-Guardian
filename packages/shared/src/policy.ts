import type { Action, PolicyDecision } from "./types.js";

// ─── PolicyEngine Interface ───────────────────────────────────────────────────
// Frozen interface — Collaborator A owns the real implementation.
// We code against this interface; swap happens at M2 integration pairing session.

export interface PolicyEngine {
  evaluate(action: Action): PolicyDecision;
}

// ─── Stub for local development ───────────────────────────────────────────────
// Replace ONLY at the M2 integration pairing session with A's real engine.
// DO NOT delete the `engine: PolicyEngine` parameter from any function signature
// to hardcode a shortcut — the whole point is a one-line swap at integration time.

export const fakePolicyEngine: PolicyEngine = {
  evaluate: (action: Action): PolicyDecision => ({
    allowed: true,
    risk: action.operation === "deploy" ? "high" : "low",
    requiresApproval: action.operation === "deploy",
    reason: "stub-policy: auto-allow",
    policyId: "stub-1",
  }),
};
