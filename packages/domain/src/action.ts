// ─── Action ──────────────────────────────────────────────────
// Represents a tool invocation the agent wants to perform.
// This is a frozen interface shared with Collaborator B.

export type OperationType =
  | "read"
  | "write"
  | "execute"
  | "delete"
  | "deploy"
  | "rollback"
  | "restart";

export type Environment = "sandbox" | "staging" | "production";

export interface Action {
  /** Unique action identifier */
  readonly id: string;

  /** The incident this action relates to */
  readonly incidentId: string;

  /** Name of the tool to invoke (e.g. "kubectl", "deploy-service") */
  readonly tool: string;

  /** Classification of the operation */
  readonly operation: OperationType;

  /** Target environment */
  readonly environment: Environment;

  /** Tool-specific parameters */
  readonly parameters: Record<string, unknown>;

  /** Human-readable description of what this action will do */
  readonly description: string;

  /** ISO-8601 timestamp of when the action was requested */
  readonly requestedAt: string;

  /** Identifier of the entity that requested this action (agent ID, user ID) */
  readonly requestedBy: string;
}
