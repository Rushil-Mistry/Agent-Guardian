// ─── Audit Log ───────────────────────────────────────────────
// Append-only event log with secret detection.
// No database dependency — events stored in-memory.

import type { AuditEvent, AuditEventType } from "@agent-guardian/domain";
import { containsSecret, sanitizePayload } from "./secret-guard.js";

/** Callback type for audit event subscribers */
export type AuditSubscriber = (event: AuditEvent) => void;

/**
 * Error thrown when an audit event contains secret-shaped values.
 */
export class AuditSecretError extends Error {
  public readonly code = "AUDIT_SECRET_DETECTED" as const;

  constructor(eventType: AuditEventType) {
    super(
      `Audit event "${eventType}" contains secret-shaped values and was rejected. ` +
      `Use sanitizePayload() to redact secrets before emitting.`,
    );
    this.name = "AuditSecretError";
  }
}

/**
 * Append-only audit log.
 *
 * - Events can only be appended, never modified or deleted.
 * - Payloads are checked for secrets — events with secrets are rejected.
 * - Subscribers are notified synchronously on each emit.
 */
export class AuditLog {
  private readonly events: AuditEvent[] = [];
  private readonly subscribers: Set<AuditSubscriber> = new Set();

  /**
   * Emit an audit event.
   *
   * @throws AuditSecretError if the event payload contains secret-shaped values
   */
  emit(event: AuditEvent): void {
    // Guard: reject payloads with secrets
    if (containsSecret(event.payload)) {
      throw new AuditSecretError(event.type);
    }

    this._append(event);
  }

  /**
   * Emit an audit event, auto-sanitizing any secrets in the payload.
   * Unlike `emit()`, this will not throw on secrets — it redacts them instead.
   */
  emitSanitized(event: AuditEvent): void {
    const sanitized: AuditEvent = {
      ...event,
      payload: sanitizePayload(event.payload),
    };
    // Bypass secret check — payload has already been sanitized
    this._append(sanitized);
  }

  /** Internal append — stores the event and notifies subscribers */
  private _append(event: AuditEvent): void {
    this.events.push(Object.freeze({ ...event }));

    for (const subscriber of this.subscribers) {
      subscriber(event);
    }
  }

  /**
   * Get all events, optionally filtered.
   * Returns a shallow copy — the internal array cannot be mutated.
   */
  getEvents(filter?: {
    type?: AuditEventType;
    sessionId?: string;
  }): readonly AuditEvent[] {
    let result: readonly AuditEvent[] = [...this.events];

    if (filter?.type) {
      result = result.filter((e) => e.type === filter.type);
    }
    if (filter?.sessionId) {
      result = result.filter((e) => e.sessionId === filter.sessionId);
    }

    return result;
  }

  /** Get the total number of events in the log */
  get size(): number {
    return this.events.length;
  }

  /** Subscribe to new audit events */
  subscribe(subscriber: AuditSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }
}
