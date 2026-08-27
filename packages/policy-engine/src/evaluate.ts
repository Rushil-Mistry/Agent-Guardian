// ─── Policy Evaluate ─────────────────────────────────────────
// Main entry point: evaluate(action) → PolicyDecision
// Fail-closed: any error or no-match → { allowed: false }

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Action, PolicyDecision } from "@agent-guardian/domain";
import { assessRisk } from "./risk-engine.js";
import { loadRules } from "./rule-loader.js";
import { matchRule } from "./rule-matcher.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Default policy file path */
const DEFAULT_POLICY_PATH = resolve(__dirname, "../policies/default.yaml");

/**
 * Build a fail-closed PolicyDecision.
 * Used whenever evaluation encounters an error or no matching rule.
 */
function failClosed(action: Action, reason: string): PolicyDecision {
  return {
    allowed: false,
    requiresApproval: false,
    riskAssessment: {
      level: "critical",
      factors: [],
      score: 100,
    },
    matchedRule: null,
    reason,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Evaluate an action against policy rules and risk assessment.
 *
 * **Fail-closed**: if anything goes wrong (rule load failure, no match,
 * any exception), the result is `{ allowed: false }`.
 *
 * @param action - The action to evaluate
 * @param policyPath - Path to the YAML policy file (defaults to policies/default.yaml)
 */
export function evaluate(
  action: Action,
  policyPath: string = DEFAULT_POLICY_PATH,
): PolicyDecision {
  try {
    const rules = loadRules(policyPath);

    if (rules.length === 0) {
      return failClosed(action, "No policy rules loaded — fail closed");
    }

    const matchedRule = matchRule(action, rules);

    if (!matchedRule) {
      return failClosed(
        action,
        `No policy rule matched action: tool=${action.tool}, operation=${action.operation}, environment=${action.environment} — fail closed`,
      );
    }

    // Compute risk assessment
    const riskAssessment = assessRisk(action);

    return {
      allowed: matchedRule.decision.allowed,
      requiresApproval: matchedRule.decision.requiresApproval,
      riskAssessment,
      matchedRule: matchedRule.id,
      reason: `Matched rule "${matchedRule.name}": ${matchedRule.description}`,
      evaluatedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    return failClosed(
      action,
      `Policy evaluation failed: ${message} — fail closed`,
    );
  }
}
