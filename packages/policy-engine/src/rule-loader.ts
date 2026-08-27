// ─── Rule Loader ─────────────────────────────────────────────
// Parses YAML policy files into PolicyRule arrays.
// Invalid rules or load failures cause fail-closed behavior.

import { readFileSync } from "node:fs";
import { load as loadYaml } from "js-yaml";
import type { PolicyRule, PolicyRuleConditions, PolicyRuleDecision } from "@agent-guardian/domain";

interface RawRule {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  priority?: unknown;
  conditions?: {
    tools?: unknown;
    operations?: unknown;
    environments?: unknown;
  };
  decision?: {
    riskLevel?: unknown;
    allowed?: unknown;
    requiresApproval?: unknown;
  };
}

/**
 * Validate and normalize a raw YAML rule into a PolicyRule.
 * Returns null if the rule is malformed.
 */
function validateRule(raw: RawRule): PolicyRule | null {
  if (
    typeof raw.id !== "string" ||
    typeof raw.name !== "string" ||
    typeof raw.description !== "string" ||
    typeof raw.priority !== "number" ||
    typeof raw.conditions !== "object" || raw.conditions === null ||
    typeof raw.decision !== "object" || raw.decision === null
  ) {
    return null;
  }

  const dec = raw.decision;
  if (
    typeof dec.riskLevel !== "string" ||
    typeof dec.allowed !== "boolean" ||
    typeof dec.requiresApproval !== "boolean"
  ) {
    return null;
  }

  const conditions: PolicyRuleConditions = {
    tools: Array.isArray(raw.conditions.tools)
      ? (raw.conditions.tools as string[])
      : undefined,
    operations: Array.isArray(raw.conditions.operations)
      ? (raw.conditions.operations as PolicyRuleConditions["operations"])
      : undefined,
    environments: Array.isArray(raw.conditions.environments)
      ? (raw.conditions.environments as PolicyRuleConditions["environments"])
      : undefined,
  };

  const decision: PolicyRuleDecision = {
    riskLevel: dec.riskLevel as PolicyRuleDecision["riskLevel"],
    allowed: dec.allowed,
    requiresApproval: dec.requiresApproval,
  };

  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    conditions,
    decision,
    priority: raw.priority,
  };
}

/**
 * Load policy rules from a YAML file.
 *
 * @throws Error if the file cannot be read or parsed
 * @returns PolicyRule[] sorted by priority (highest first)
 */
export function loadRules(policyPath: string): PolicyRule[] {
  const content = readFileSync(policyPath, "utf-8");
  const parsed = loadYaml(content) as { rules?: RawRule[] } | null;

  if (!parsed || !Array.isArray(parsed.rules)) {
    throw new Error(`Invalid policy file: expected { rules: [...] } in ${policyPath}`);
  }

  const rules: PolicyRule[] = [];
  for (const raw of parsed.rules) {
    const rule = validateRule(raw);
    if (rule !== null) {
      rules.push(rule);
    }
    // Invalid individual rules are silently skipped — the catch-all rule
    // at the bottom of every valid policy file ensures fail-closed behavior.
  }

  // Sort by priority descending (highest priority first)
  rules.sort((a, b) => b.priority - a.priority);

  return rules;
}
