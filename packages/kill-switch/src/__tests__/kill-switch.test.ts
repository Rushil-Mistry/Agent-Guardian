// ─── Kill Switch Tests ───────────────────────────────────────
// Required test cases from the spec:
// 1. Gate throws AgentStoppedError when stopped
// 2. Gate does NOT throw when running
// 3. Stop transitions through STOPPING → STOPPED
// 4. Stop cancels pending actions
// 5. Stop emits audit event
// 6. Idempotent: calling stop twice does NOT throw or double-fire audit events
// 7. Cannot resume from STOPPED

import { describe, it, expect, beforeEach } from "vitest";
import { KillSwitch } from "../kill-switch.js";
import { AgentStoppedError } from "@agent-guardian/domain";
import { AuditLog } from "@agent-guardian/audit";
import type { Approval } from "@agent-guardian/domain";

function makeKillSwitch(): { ks: KillSwitch; auditLog: AuditLog } {
  const auditLog = new AuditLog();
  const ks = new KillSwitch({
    sessionId: "test-session",
    auditLog,
    actorId: "test-operator",
  });
  return { ks, auditLog };
}

function makePendingApproval(id: string): Approval {
  return {
    id,
    actionId: `action-${id}`,
    status: "pending",
    requestedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  };
}

describe("KillSwitch", () => {
  let ks: KillSwitch;
  let auditLog: AuditLog;

  beforeEach(() => {
    ({ ks, auditLog } = makeKillSwitch());
  });

  // ── Required test 1: gate throws when stopped ─────────────
  it("should throw AgentStoppedError when gate is checked after stop", () => {
    ks.stop();
    expect(() => ks.checkGate()).toThrow(AgentStoppedError);
  });

  // ── Required test 2: gate does NOT throw when running ─────
  it("should NOT throw when gate is checked while running", () => {
    expect(() => ks.checkGate()).not.toThrow();
  });

  // ── Required test 3: stop transitions to STOPPED ──────────
  it("should transition to STOPPED after stop()", () => {
    expect(ks.state).toBe("RUNNING");
    ks.stop();
    expect(ks.state).toBe("STOPPED");
  });

  // ── Required test 4: stop cancels pending approvals ───────
  it("should deny all pending approvals on stop", () => {
    const approval1 = makePendingApproval("a1");
    const approval2 = makePendingApproval("a2");

    ks.registerPendingApproval(approval1);
    ks.registerPendingApproval(approval2);

    ks.stop();

    expect(approval1.status).toBe("denied");
    expect(approval1.respondedBy).toBe("test-operator");
    expect(approval2.status).toBe("denied");
    expect(approval2.respondedBy).toBe("test-operator");
  });

  // ── Required test 5: stop emits audit event ───────────────
  it("should emit AGENT_STOPPED audit event on stop", () => {
    ks.stop();

    const events = auditLog.getEvents({ type: "AGENT_STOPPED" });
    expect(events).toHaveLength(1);
    expect(events[0].sessionId).toBe("test-session");
    expect(events[0].actorId).toBe("test-operator");
  });

  // ── Required test 6: idempotent stop ──────────────────────
  it("should be idempotent — calling stop twice does NOT throw", () => {
    expect(() => {
      ks.stop();
      ks.stop();
    }).not.toThrow();
  });

  it("should be idempotent — calling stop twice does NOT double-fire audit events", () => {
    ks.stop();
    ks.stop();

    const events = auditLog.getEvents({ type: "AGENT_STOPPED" });
    expect(events).toHaveLength(1);
  });

  // ── Required test 7: cannot resume from STOPPED ───────────
  it("should throw when trying to resume from STOPPED", () => {
    ks.stop();
    expect(() => ks.resume()).toThrow("Cannot resume");
  });

  // ── Additional coverage ───────────────────────────────────

  it("should support pause and resume", () => {
    expect(ks.state).toBe("RUNNING");

    ks.pause();
    expect(ks.state).toBe("PAUSED");

    ks.resume();
    expect(ks.state).toBe("RUNNING");
  });

  it("should support waiting for approval state", () => {
    ks.waitForApproval();
    expect(ks.state).toBe("WAITING_APPROVAL");

    // Can resume from waiting
    ks.resume();
    expect(ks.state).toBe("RUNNING");
  });

  it("should not allow pause when not running", () => {
    ks.pause();
    expect(() => ks.pause()).toThrow("must be RUNNING");
  });

  it("should not allow waitForApproval when not running", () => {
    ks.pause();
    expect(() => ks.waitForApproval()).toThrow("must be RUNNING");
  });

  it("should not allow registering pending approvals when stopped", () => {
    ks.stop();
    expect(() => ks.registerPendingApproval(makePendingApproval("a3"))).toThrow(
      AgentStoppedError,
    );
  });

  it("should start in RUNNING state", () => {
    expect(ks.state).toBe("RUNNING");
  });

  it("should not throw when gate is checked while paused", () => {
    ks.pause();
    // PAUSED is not STOPPED, so gate should pass
    expect(() => ks.checkGate()).not.toThrow();
  });
});
