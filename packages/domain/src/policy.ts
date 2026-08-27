// ─── Policy ──────────────────────────────────────────────────
// Policy decision and rule types.
// PolicyDecision is a frozen interface shared with Collaborator B.

import type { RiskAssessment, RiskLevel } from "./risk.js";
import type { Environment, OperationType } from "./action.js";

export interface PolicyDecision {
  /** Whether the action is allowed to proceed */
  readonly allowed: boolean;

  /** Whether human approval is required before execution */
  readonly requiresApproval: boolean;

  /** The risk assessment that informed this decision */
  readonly riskAssessment: RiskAssessment;

  /** ID of the policy rule that matched, or null if no rule matched */
  readonly matchedRule: string | null;

  /** Human-readable explanation of the decision */
  readonly reason: string;

  /** ISO-8601 timestamp of when the evaluation occurred */
  readonly evaluatedAt: string;
}

/** Conditions a policy rule matches against */
export interface PolicyRuleConditions {
  /** Tool names this rule applies to (glob patterns supported) */
  readonly tools?: readonly string[];

  /** Operation types this rule applies to */
  readonly operations?: readonly OperationType[];

  /** Environments this rule applies to */
  readonly environments?: readonly Environment[];
}

/** Template for the decision a matched rule produces */
export interface PolicyRuleDecision {
  readonly riskLevel: RiskLevel;
  readonly allowed: boolean;
  readonly requiresApproval: boolean;
}

export interface PolicyRule {
  /** Unique rule identifier */
  readonly id: string;

  /** Human-readable rule name */
  readonly name: string;

  /** Description of what this rule does */
  readonly description: string;

  /** Conditions that must match for this rule to apply */
  readonly conditions: PolicyRuleConditions;

  /** The decision template to apply when this rule matches */
  readonly decision: PolicyRuleDecision;

  /** Higher priority rules are evaluated first (higher number = higher priority) */
  readonly priority: number;
}
