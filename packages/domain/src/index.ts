// ─── @agent-guardian/domain ───────────────────────────────────
// Barrel export — all domain types and guards re-exported from here.

export type {
  Incident,
  IncidentSeverity,
  IncidentStatus,
} from "./incident.js";

export type {
  Action,
  OperationType,
  Environment,
} from "./action.js";

export type {
  RiskLevel,
  RiskFactor,
  RiskFactorCategory,
  RiskAssessment,
} from "./risk.js";

export type {
  PolicyDecision,
  PolicyRule,
  PolicyRuleConditions,
  PolicyRuleDecision,
} from "./policy.js";

export type {
  Approval,
  ApprovalStatus,
} from "./approval.js";

export type {
  ExecutionState,
} from "./execution.js";

export {
  AgentStoppedError,
} from "./execution.js";

export type {
  AuditEventType,
  AuditEvent,
} from "./audit.js";

export {
  isAction,
  isIncident,
  isPolicyDecision,
} from "./guards.js";
