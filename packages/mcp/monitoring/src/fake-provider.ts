import type {
  MonitoringProvider,
  ServiceHealth,
  MetricPoint,
  Alert,
} from "@agent-guardian/shared";

// ─── Fake Monitoring Provider ─────────────────────────────────────────────────
// Deterministic fake data simulating the payment-service v1.41 incident.
// Swap for a real Prometheus/Datadog provider when ready.

export class FakeMonitoringProvider implements MonitoringProvider {
  async getServiceHealth(service: string): Promise<ServiceHealth> {
    return {
      service,
      status: "degraded",
      errorRate: 13.4,
      latencyMs: 820,
      healthyInstances: 2,
      totalInstances: 3,
    };
  }

  async getMetrics(
    service: string,
    metric: string,
    windowMinutes: number,
  ): Promise<MetricPoint[]> {
    const now = new Date();
    const points: MetricPoint[] = [];
    const intervalMs = (windowMinutes * 60 * 1000) / 10;

    for (let i = 0; i < 10; i++) {
      const timestamp = new Date(now.getTime() - (9 - i) * intervalMs);
      let value: number;

      switch (metric) {
        case "error_rate":
          // Simulate spike: first 5 points normal, last 5 elevated
          value = i < 5 ? 0.5 + Math.sin(i) * 0.2 : 12.0 + i * 0.5;
          break;
        case "latency":
          value = i < 5 ? 120 + i * 5 : 650 + i * 30;
          break;
        case "request_count":
          value = 1000 + i * 50;
          break;
        default:
          value = i * 10;
      }

      points.push({ timestamp, value: Math.round(value * 100) / 100 });
    }

    return points;
  }

  async getErrorRate(service: string, _windowMinutes: number): Promise<number> {
    return 13.4;
  }

  async getLatency(service: string, _windowMinutes: number): Promise<number> {
    return 820;
  }

  async getRecentAlerts(service: string, limit: number): Promise<Alert[]> {
    const now = new Date();
    const alerts: Alert[] = [
      {
        id: "alert-001",
        service,
        severity: "critical",
        message: `High error rate detected on ${service}: 13.4% (threshold: 5%)`,
        timestamp: new Date(now.getTime() - 5 * 60 * 1000),
        resolved: false,
      },
      {
        id: "alert-002",
        service,
        severity: "warning",
        message: `Elevated latency on ${service}: 820ms (threshold: 500ms)`,
        timestamp: new Date(now.getTime() - 4 * 60 * 1000),
        resolved: false,
      },
      {
        id: "alert-003",
        service,
        severity: "info",
        message: `Deployment v1.41 completed for ${service}`,
        timestamp: new Date(now.getTime() - 15 * 60 * 1000),
        resolved: true,
      },
    ];

    return alerts.slice(0, limit);
  }
}
