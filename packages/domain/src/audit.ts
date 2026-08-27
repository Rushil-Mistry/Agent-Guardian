// ─── Audit event types ───────────────────────────────────────
// Type definitions only — the audit trail implementation lives in @agent-guardian/audit.

export type AuditEventType =
  | "SESSION_CREATED"
  | "PLAN_CREATED"
  | "TOOL_REQUESTED"
  | "POLICY_EVALUATED"
  | "ACTION_BLOCKED"
  | "SANDBOX_STARTED"
  | "SANDBOX_COMPLETED"
  | "APPROVAL_REQUESTED"
  | "APPROVAL_GRANTED"
  | "APPROVAL_DENIED"
  | "DEPLOYMENT_STARTED"
  | "DEPLOYMENT_COMPLETED"
  | "DEPLOYMENT_FAILED"
  | "AGENT_STOPPED"
  | "INCIDENT_RESOLVED";

export interface AuditEvent {
  /** Unique event identifier */
  readonly id: string;

  /** Session this event belongs to */
  readonly sessionId: string;

  /** Type of audit event */
  readonly type: AuditEventType;

  /** ISO-8601 timestamp */
  readonly timestamp: string;

  /** Event-specific payload (must never contain secrets) */
  readonly payload: Record<string, unknown>;

  /** Identifier of the actor that triggered this event */
  readonly actorId: string;
}
