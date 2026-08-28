import type { LogProvider, LogEntry, ErrorTrace } from "@agent-guardian/shared";

// ─── Fake Log Provider ───────────────────────────────────────────────────────
// Deterministic fake data simulating the payment-service v1.41 null payment_method bug.

export class FakeLogProvider implements LogProvider {
  private readonly errorLogs: LogEntry[] = [
    {
      timestamp: new Date("2024-01-15T10:32:15Z"),
      level: "error",
      service: "payment-service",
      message:
        'TypeError: Cannot read properties of null (reading \'payment_method\')\n  at processPayment (/app/src/payments.py:47)\n  at handleRequest (/app/src/main.py:23)',
      traceId: "trace-abc-001",
      metadata: {
        version: "v1.41",
        endpoint: "POST /payments",
        statusCode: 500,
      },
    },
    {
      timestamp: new Date("2024-01-15T10:32:18Z"),
      level: "error",
      service: "payment-service",
      message:
        'TypeError: Cannot read properties of null (reading \'payment_method\')\n  at processPayment (/app/src/payments.py:47)\n  at handleRequest (/app/src/main.py:23)',
      traceId: "trace-abc-002",
      metadata: {
        version: "v1.41",
        endpoint: "POST /payments",
        statusCode: 500,
      },
    },
    {
      timestamp: new Date("2024-01-15T10:31:45Z"),
      level: "error",
      service: "payment-service",
      message:
        'NullPointerError: payment_method is null for payment request id=pay_8472',
      traceId: "trace-abc-003",
      metadata: {
        version: "v1.41",
        paymentId: "pay_8472",
      },
    },
  ];

  private readonly allLogs: LogEntry[] = [
    {
      timestamp: new Date("2024-01-15T10:30:00Z"),
      level: "info",
      service: "payment-service",
      message: "Deployment v1.41 started",
      metadata: { version: "v1.41" },
    },
    {
      timestamp: new Date("2024-01-15T10:30:05Z"),
      level: "info",
      service: "payment-service",
      message: "Deployment v1.41 completed successfully",
      metadata: { version: "v1.41" },
    },
    {
      timestamp: new Date("2024-01-15T10:31:00Z"),
      level: "info",
      service: "payment-service",
      message: "Health check passed",
    },
    ...this.errorLogs,
    {
      timestamp: new Date("2024-01-15T10:33:00Z"),
      level: "warn",
      service: "payment-service",
      message: "Error rate threshold exceeded: 13.4% > 5%",
      metadata: { alertId: "alert-001" },
    },
  ];

  async searchLogs(
    service: string,
    query: string,
    limit: number,
  ): Promise<LogEntry[]> {
    const queryLower = query.toLowerCase();
    return this.allLogs
      .filter(
        (log) =>
          log.service === service &&
          (log.message.toLowerCase().includes(queryLower) ||
            log.level.includes(queryLower)),
      )
      .slice(0, limit);
  }

  async getErrorTrace(traceId: string): Promise<ErrorTrace | null> {
    const traces: Record<string, ErrorTrace> = {
      "trace-abc-001": {
        traceId: "trace-abc-001",
        service: "payment-service",
        error:
          "TypeError: Cannot read properties of null (reading 'payment_method')",
        stackTrace: [
          "Traceback (most recent call last):",
          '  File "/app/src/main.py", line 23, in handleRequest',
          "    result = process_payment(request)",
          '  File "/app/src/payments.py", line 47, in process_payment',
          "    method = payment.payment_method.lower()",
          "AttributeError: 'NoneType' object has no attribute 'lower'",
          "",
          "Request payload: {amount: 100, currency: 'USD', payment_method: null}",
          "Version: v1.41",
        ].join("\n"),
        timestamp: new Date("2024-01-15T10:32:15Z"),
      },
      "trace-abc-002": {
        traceId: "trace-abc-002",
        service: "payment-service",
        error:
          "TypeError: Cannot read properties of null (reading 'payment_method')",
        stackTrace: [
          "Traceback (most recent call last):",
          '  File "/app/src/main.py", line 23, in handleRequest',
          "    result = process_payment(request)",
          '  File "/app/src/payments.py", line 47, in process_payment',
          "    method = payment.payment_method.lower()",
          "AttributeError: 'NoneType' object has no attribute 'lower'",
          "",
          "Request payload: {amount: 250, currency: 'EUR', payment_method: null}",
          "Version: v1.41",
        ].join("\n"),
        timestamp: new Date("2024-01-15T10:32:18Z"),
      },
    };

    return traces[traceId] ?? null;
  }

  async getRecentErrors(service: string, limit: number): Promise<LogEntry[]> {
    return this.errorLogs
      .filter((log) => log.service === service)
      .slice(0, limit);
  }
}
