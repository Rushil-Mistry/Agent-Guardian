// ─── Approval ────────────────────────────────────────────────
// Human approval workflow types.
// This is a frozen interface shared with Collaborator B.

export type ApprovalStatus = "pending" | "granted" | "denied" | "expired";

export interface Approval {
  /** Unique approval identifier */
  readonly id: string;

  /** The action this approval is for */
  readonly actionId: string;

  /** Current approval status */
  status: ApprovalStatus;

  /** ISO-8601 timestamp of when approval was requested */
  readonly requestedAt: string;

  /** ISO-8601 timestamp of when a response was given */
  respondedAt?: string;

  /** Identifier of the human who responded */
  respondedBy?: string;

  /** Reason for the approval/denial decision */
  reason?: string;

  /** ISO-8601 timestamp after which this approval request expires */
  readonly expiresAt: string;
}
