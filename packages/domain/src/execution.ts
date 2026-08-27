// ─── Execution state & errors ────────────────────────────────
// Kill switch state machine types.

export type ExecutionState =
  | "RUNNING"
  | "PAUSED"
  | "WAITING_APPROVAL"
  | "STOPPING"
  | "STOPPED";

/**
 * Thrown when a sensitive action is attempted while the agent is stopped.
 * The kill switch gate checks for this before every sensitive operation.
 */
export class AgentStoppedError extends Error {
  public readonly code = "AGENT_STOPPED" as const;

  constructor(message = "Agent has been stopped — no further actions are permitted") {
    super(message);
    this.name = "AgentStoppedError";
  }
}
