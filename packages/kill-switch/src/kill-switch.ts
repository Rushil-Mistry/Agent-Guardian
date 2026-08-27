// ─── Kill Switch ─────────────────────────────────────────────
// State machine with idempotent stop, approval management, and audit integration.
//
// States: RUNNING → PAUSED → WAITING_APPROVAL → STOPPING → STOPPED
//
// The gate (`checkGate()`) must be called before every sensitive action.
// Once stopped, the agent cannot be resumed.

import type {
  ExecutionState,
  AuditEvent,
  Approval,
} from "@agent-guardian/domain";
import { AgentStoppedError } from "@agent-guardian/domain";
import type { AuditLog } from "@agent-guardian/audit";

/** Options for constructing a KillSwitch */
export interface KillSwitchOptions {
  /** Session ID for audit events */
  sessionId: string;

  /** Audit log to write events to */
  auditLog: AuditLog;

  /** Actor ID to record in audit events */
  actorId?: string;
}

/**
 * Kill switch state machine.
 *
 * - `checkGate()` throws `AgentStoppedError` if stopped
 * - `stop()` is idempotent: calling it twice does NOT throw or double-fire audit events
 * - Once stopped, the switch cannot be resumed
 */
export class KillSwitch {
  private _state: ExecutionState = "RUNNING";
  private readonly sessionId: string;
  private readonly auditLog: AuditLog;
  private readonly actorId: string;
  private readonly pendingApprovals: Map<string, Approval> = new Map();
  private hasFiredStopEvent = false;

  constructor(options: KillSwitchOptions) {
    this.sessionId = options.sessionId;
    this.auditLog = options.auditLog;
    this.actorId = options.actorId ?? "kill-switch";
  }

  /** Current execution state */
  get state(): ExecutionState {
    return this._state;
  }

  /**
   * Gate check — call before every sensitive action.
   * @throws AgentStoppedError if the agent is stopped
   */
  checkGate(): void {
    if (this._state === "STOPPED") {
      throw new AgentStoppedError();
    }
  }

  /**
   * Register a pending approval to be managed by the kill switch.
   * On stop, all pending approvals are automatically denied.
   */
  registerPendingApproval(approval: Approval): void {
    this.checkGate();
    this.pendingApprovals.set(approval.id, approval);
  }

  /**
   * Remove a pending approval (e.g. after it's been granted/denied normally).
   */
  removePendingApproval(approvalId: string): void {
    this.pendingApprovals.delete(approvalId);
  }

  /**
   * Stop the agent.
   *
   * This operation is **idempotent**: calling stop() when already
   * STOPPING or STOPPED is a no-op — no exception, no duplicate audit event.
   *
   * Stop performs:
   * 1. Transitions state to STOPPING → STOPPED
   * 2. Denies all pending approvals
   * 3. Emits AGENT_STOPPED audit event (exactly once)
   */
  stop(): void {
    // Idempotent: already stopping or stopped → no-op
    if (this._state === "STOPPING" || this._state === "STOPPED") {
      return;
    }

    this._state = "STOPPING";

    // Cancel/deny all pending approvals
    for (const [, approval] of this.pendingApprovals) {
      approval.status = "denied";
      approval.respondedAt = new Date().toISOString();
      approval.respondedBy = this.actorId;
      approval.reason = "Agent stopped — all pending approvals denied";
    }
    this.pendingApprovals.clear();

    // Transition to final state
    this._state = "STOPPED";

    // Emit audit event exactly once
    if (!this.hasFiredStopEvent) {
      this.hasFiredStopEvent = true;
      const event: AuditEvent = {
        id: `audit-stop-${this.sessionId}-${Date.now()}`,
        sessionId: this.sessionId,
        type: "AGENT_STOPPED",
        timestamp: new Date().toISOString(),
        payload: {
          reason: "Kill switch activated",
          pendingApprovalsdenied: 0,
        },
        actorId: this.actorId,
      };
      this.auditLog.emit(event);
    }
  }

  /**
   * Pause the agent. Only valid from RUNNING state.
   */
  pause(): void {
    this.checkGate();
    if (this._state !== "RUNNING") {
      throw new Error(
        `Cannot pause from state ${this._state} — must be RUNNING`,
      );
    }
    this._state = "PAUSED";
  }

  /**
   * Resume the agent. Only valid from PAUSED or WAITING_APPROVAL state.
   */
  resume(): void {
    if (this._state === "STOPPED") {
      throw new Error("Cannot resume — agent has been stopped permanently");
    }
    if (this._state === "STOPPING") {
      throw new Error("Cannot resume — agent is in the process of stopping");
    }
    if (this._state !== "PAUSED" && this._state !== "WAITING_APPROVAL") {
      throw new Error(
        `Cannot resume from state ${this._state} — must be PAUSED or WAITING_APPROVAL`,
      );
    }
    this._state = "RUNNING";
  }

  /**
   * Set state to WAITING_APPROVAL. Only valid from RUNNING state.
   */
  waitForApproval(): void {
    this.checkGate();
    if (this._state !== "RUNNING") {
      throw new Error(
        `Cannot wait for approval from state ${this._state} — must be RUNNING`,
      );
    }
    this._state = "WAITING_APPROVAL";
  }
}
