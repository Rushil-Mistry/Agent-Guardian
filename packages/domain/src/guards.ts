// ─── Type guards ─────────────────────────────────────────────
// Minimal runtime type guards for core domain types.

import type { Action, OperationType, Environment } from "./action.js";
import type { Incident, IncidentSeverity, IncidentStatus } from "./incident.js";
import type { PolicyDecision } from "./policy.js";

const VALID_OPERATIONS: readonly OperationType[] = [
  "read", "write", "execute", "delete", "deploy", "rollback", "restart",
];

const VALID_ENVIRONMENTS: readonly Environment[] = [
  "sandbox", "staging", "production",
];

const VALID_SEVERITIES: readonly IncidentSeverity[] = [
  "low", "medium", "high", "critical",
];

const VALID_STATUSES: readonly IncidentStatus[] = [
  "open", "investigating", "mitigated", "resolved",
];

/** Check whether a value is a valid Action */
export function isAction(value: unknown): value is Action {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.incidentId === "string" &&
    typeof v.tool === "string" &&
    typeof v.operation === "string" &&
    VALID_OPERATIONS.includes(v.operation as OperationType) &&
    typeof v.environment === "string" &&
    VALID_ENVIRONMENTS.includes(v.environment as Environment) &&
    typeof v.parameters === "object" &&
    v.parameters !== null &&
    typeof v.description === "string" &&
    typeof v.requestedAt === "string" &&
    typeof v.requestedBy === "string"
  );
}

/** Check whether a value is a valid Incident */
export function isIncident(value: unknown): value is Incident {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    typeof v.description === "string" &&
    typeof v.severity === "string" &&
    VALID_SEVERITIES.includes(v.severity as IncidentSeverity) &&
    typeof v.status === "string" &&
    VALID_STATUSES.includes(v.status as IncidentStatus) &&
    typeof v.source === "string" &&
    typeof v.createdAt === "string" &&
    typeof v.updatedAt === "string" &&
    typeof v.metadata === "object" &&
    v.metadata !== null
  );
}

/** Check whether a value is a valid PolicyDecision */
export function isPolicyDecision(value: unknown): value is PolicyDecision {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.allowed === "boolean" &&
    typeof v.requiresApproval === "boolean" &&
    typeof v.riskAssessment === "object" &&
    v.riskAssessment !== null &&
    (typeof v.matchedRule === "string" || v.matchedRule === null) &&
    typeof v.reason === "string" &&
    typeof v.evaluatedAt === "string"
  );
}
