// ─── Incident ────────────────────────────────────────────────
// Represents an SRE incident that the agent is investigating.
// This is a frozen interface shared with Collaborator B.

export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export type IncidentStatus =
  | "open"
  | "investigating"
  | "mitigated"
  | "resolved";

export interface Incident {
  /** Unique incident identifier */
  readonly id: string;

  /** Short human-readable title */
  readonly title: string;

  /** Detailed description of the incident */
  readonly description: string;

  /** Severity classification */
  readonly severity: IncidentSeverity;

  /** Current lifecycle status */
  status: IncidentStatus;

  /** Source system that reported the incident (e.g. PagerDuty, Datadog) */
  readonly source: string;

  /** ISO-8601 timestamp of incident creation */
  readonly createdAt: string;

  /** ISO-8601 timestamp of last update */
  updatedAt: string;

  /** Arbitrary key-value metadata from the source system */
  readonly metadata: Record<string, unknown>;
}
