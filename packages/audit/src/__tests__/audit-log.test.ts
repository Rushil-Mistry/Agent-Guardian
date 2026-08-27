// ─── Audit Log Tests ─────────────────────────────────────────

import { describe, it, expect, beforeEach } from "vitest";
import { AuditLog, AuditSecretError } from "../audit-log.js";
import type { AuditEvent, AuditEventType } from "@agent-guardian/domain";

/** Helper to create a minimal AuditEvent */
function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "session-1",
    type: "TOOL_REQUESTED",
    timestamp: new Date().toISOString(),
    payload: {},
    actorId: "test-agent",
    ...overrides,
  };
}

/** All 15 event types from the spec */
const ALL_EVENT_TYPES: AuditEventType[] = [
  "SESSION_CREATED",
  "PLAN_CREATED",
  "TOOL_REQUESTED",
  "POLICY_EVALUATED",
  "ACTION_BLOCKED",
  "SANDBOX_STARTED",
  "SANDBOX_COMPLETED",
  "APPROVAL_REQUESTED",
  "APPROVAL_GRANTED",
  "APPROVAL_DENIED",
  "DEPLOYMENT_STARTED",
  "DEPLOYMENT_COMPLETED",
  "DEPLOYMENT_FAILED",
  "AGENT_STOPPED",
  "INCIDENT_RESOLVED",
];

describe("AuditLog", () => {
  let log: AuditLog;

  beforeEach(() => {
    log = new AuditLog();
  });

  // ── All 15 event types can be emitted ─────────────────────
  it("should emit and retrieve all 15 audit event types", () => {
    for (const type of ALL_EVENT_TYPES) {
      log.emit(makeEvent({ type }));
    }

    const events = log.getEvents();
    expect(events).toHaveLength(15);

    const types = events.map((e) => e.type);
    for (const type of ALL_EVENT_TYPES) {
      expect(types).toContain(type);
    }
  });

  // ── Append-only: no delete/update ─────────────────────────
  it("should be append-only — events cannot be removed", () => {
    log.emit(makeEvent({ id: "evt-1" }));
    log.emit(makeEvent({ id: "evt-2" }));

    const events = log.getEvents();
    expect(events).toHaveLength(2);

    // Returned array is a copy — modifying it doesn't affect the log
    (events as AuditEvent[]).pop();
    expect(log.getEvents()).toHaveLength(2);
  });

  // ── Event ordering preserved ──────────────────────────────
  it("should preserve event ordering", () => {
    log.emit(makeEvent({ id: "first" }));
    log.emit(makeEvent({ id: "second" }));
    log.emit(makeEvent({ id: "third" }));

    const events = log.getEvents();
    expect(events[0].id).toBe("first");
    expect(events[1].id).toBe("second");
    expect(events[2].id).toBe("third");
  });

  // ── Secret detection rejects events ───────────────────────
  it("should reject events with secrets in payload", () => {
    const event = makeEvent({
      payload: { password: "my-secret-password" },
    });

    expect(() => log.emit(event)).toThrow(AuditSecretError);
    expect(log.size).toBe(0);
  });

  it("should reject events with API keys in payload", () => {
    const event = makeEvent({
      payload: { key: "Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig" },
    });

    expect(() => log.emit(event)).toThrow(AuditSecretError);
    expect(log.size).toBe(0);
  });

  it("should reject events with nested secrets", () => {
    const event = makeEvent({
      payload: {
        config: {
          credentials: "my-creds",
        },
      },
    });

    expect(() => log.emit(event)).toThrow(AuditSecretError);
    expect(log.size).toBe(0);
  });

  it("should allow events with clean payloads", () => {
    const event = makeEvent({
      payload: { action: "deploy", environment: "production" },
    });

    log.emit(event);
    expect(log.size).toBe(1);
  });

  // ── emitSanitized auto-redacts ────────────────────────────
  it("should auto-sanitize secrets when using emitSanitized", () => {
    const event = makeEvent({
      payload: { token: "my-secret-token", action: "deploy" },
    });

    log.emitSanitized(event);
    expect(log.size).toBe(1);

    const stored = log.getEvents()[0];
    expect(stored.payload.token).toBe("[REDACTED]");
    expect(stored.payload.action).toBe("deploy");
  });

  // ── Filtering ─────────────────────────────────────────────
  it("should filter events by type", () => {
    log.emit(makeEvent({ type: "SESSION_CREATED" }));
    log.emit(makeEvent({ type: "TOOL_REQUESTED" }));
    log.emit(makeEvent({ type: "SESSION_CREATED" }));

    const sessionEvents = log.getEvents({ type: "SESSION_CREATED" });
    expect(sessionEvents).toHaveLength(2);
  });

  it("should filter events by sessionId", () => {
    log.emit(makeEvent({ sessionId: "s1" }));
    log.emit(makeEvent({ sessionId: "s2" }));
    log.emit(makeEvent({ sessionId: "s1" }));

    const s1Events = log.getEvents({ sessionId: "s1" });
    expect(s1Events).toHaveLength(2);
  });

  // ── Subscribers ───────────────────────────────────────────
  it("should notify subscribers on emit", () => {
    const received: AuditEvent[] = [];
    log.subscribe((event) => received.push(event));

    log.emit(makeEvent({ id: "sub-test" }));
    expect(received).toHaveLength(1);
    expect(received[0].id).toBe("sub-test");
  });

  it("should allow unsubscribing", () => {
    const received: AuditEvent[] = [];
    const unsub = log.subscribe((event) => received.push(event));

    log.emit(makeEvent());
    expect(received).toHaveLength(1);

    unsub();
    log.emit(makeEvent());
    expect(received).toHaveLength(1); // no new events after unsub
  });

  // ── size property ─────────────────────────────────────────
  it("should track size correctly", () => {
    expect(log.size).toBe(0);
    log.emit(makeEvent());
    expect(log.size).toBe(1);
    log.emit(makeEvent());
    expect(log.size).toBe(2);
  });
});
