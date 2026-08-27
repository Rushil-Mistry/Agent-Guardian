// ─── Rule Matcher ────────────────────────────────────────────
// Matches an Action against PolicyRule conditions.
// Returns the first (highest-priority) matching rule or null.

import type { Action, PolicyRule } from "@agent-guardian/domain";

/**
 * Check if a value matches a glob-like pattern.
 * Supports `*` as a wildcard for "match anything".
 */
function matchesPattern(value: string, pattern: string): boolean {
  if (pattern === "*") return true;
  // Simple prefix wildcard: "kubectl-*" matches "kubectl-get"
  if (pattern.endsWith("*")) {
    return value.startsWith(pattern.slice(0, -1));
  }
  return value === pattern;
}

/**
 * Check if an action matches a single rule's conditions.
 * A condition field that is undefined/empty means "match all".
 */
function matchesConditions(action: Action, rule: PolicyRule): boolean {
  const { conditions } = rule;

  // Check tool match
  if (conditions.tools && conditions.tools.length > 0) {
    const toolMatched = conditions.tools.some((pattern) =>
      matchesPattern(action.tool, pattern)
    );
    if (!toolMatched) return false;
  }

  // Check operation match
  if (conditions.operations && conditions.operations.length > 0) {
    if (!conditions.operations.includes(action.operation)) return false;
  }

  // Check environment match
  if (conditions.environments && conditions.environments.length > 0) {
    if (!conditions.environments.includes(action.environment)) return false;
  }

  return true;
}

/**
 * Find the first matching rule for the given action.
 * Rules must be pre-sorted by priority (highest first).
 *
 * @returns The matching PolicyRule, or null if no rule matches.
 */
export function matchRule(
  action: Action,
  rules: PolicyRule[],
): PolicyRule | null {
  for (const rule of rules) {
    if (matchesConditions(action, rule)) {
      return rule;
    }
  }
  return null;
}
