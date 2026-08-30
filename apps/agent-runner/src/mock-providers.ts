import type {
  MonitoringProvider,
  ServiceHealth,
  MetricPoint,
  Alert,
  LogProvider,
  LogEntry,
  ErrorTrace,
  GitProvider,
  Commit,
  FileDiff,
  DatabaseProvider,
  TableSchema,
  QueryResult,
  DeploymentProvider,
  DeploymentStatus,
  DeploymentResult,
} from "@agent-guardian/shared";

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

  async getMetrics(service: string, metric: string, windowMinutes: number): Promise<MetricPoint[]> {
    return [
      { timestamp: new Date(Date.now() - 60000), value: 0.5 },
      { timestamp: new Date(), value: 13.4 },
    ];
  }

  async getErrorRate(): Promise<number> {
    return 13.4;
  }

  async getLatency(): Promise<number> {
    return 820;
  }

  async getRecentAlerts(service: string, limit: number): Promise<Alert[]> {
    const alerts: Alert[] = [
      {
        id: "alert-001",
        service,
        severity: "critical" as const,
        message: `High error rate detected on ${service}: 13.4% (threshold: 5%)`,
        timestamp: new Date(),
        resolved: false,
      },
    ];
    return alerts.slice(0, limit);
  }
}

export class FakeLogProvider implements LogProvider {
  async searchLogs(service: string, query: string, limit: number): Promise<LogEntry[]> {
    const logs: LogEntry[] = [
      {
        timestamp: new Date(),
        level: "error" as const,
        service,
        message: "AttributeError: 'NoneType' object has no attribute 'lower'",
        traceId: "trace-a1b2c3d4",
      },
    ];
    return logs.slice(0, limit);
  }

  async getErrorTrace(traceId: string): Promise<ErrorTrace | null> {
    return {
      traceId,
      service: "payment-service",
      error: "AttributeError: 'NoneType' object has no attribute 'lower'",
      stackTrace: "File main.py, line 81 in process_payment_v141: method = payment.payment_method.lower()",
      timestamp: new Date(),
    };
  }

  async getRecentErrors(service: string, limit: number): Promise<LogEntry[]> {
    const logs: LogEntry[] = [
      {
        timestamp: new Date(),
        level: "error" as const,
        service,
        message: "500 Internal Server Error: AttributeError in process_payment_v141",
        traceId: "trace-a1b2c3d4",
      },
    ];
    return logs.slice(0, limit);
  }
}

export class FakeGitProvider implements GitProvider {
  async getRecentCommits(repo: string, limit: number): Promise<Commit[]> {
    return [
      {
        sha: "a7f39b1",
        message: "perf(payments): refactor payment processor pipeline to v1.41",
        author: "dev@company.internal",
        timestamp: new Date(),
        files: ["apps/demo-service/main.py"],
      },
      {
        sha: "e4d28c9",
        message: "feat(payments): stable v1.40 release",
        author: "dev@company.internal",
        timestamp: new Date(Date.now() - 86400000),
        files: ["apps/demo-service/main.py"],
      },
    ].slice(0, limit);
  }

  async getCommitDiff(repo: string, sha: string): Promise<FileDiff[]> {
    return [
      {
        path: "apps/demo-service/main.py",
        additions: 2,
        deletions: 4,
        patch: "- if not payment.payment_method: raise ValueError()\n+ method = payment.payment_method.lower()",
      },
    ];
  }

  async getFile(): Promise<string> {
    return "payment processing source code";
  }

  async createBranch(): Promise<string> {
    return "branch created";
  }

  async createPatch(): Promise<string> {
    return "patch committed";
  }
}

export class FakeDatabaseProvider implements DatabaseProvider {
  async getSchema(database: string): Promise<TableSchema[]> {
    return [
      {
        table: "payments",
        columns: [
          { name: "payment_id", type: "varchar", nullable: false },
          { name: "amount", type: "numeric", nullable: false },
          { name: "payment_method", type: "varchar", nullable: true },
        ],
      },
    ];
  }

  async readQuery(database: string, query: string): Promise<QueryResult> {
    return {
      columns: ["payment_id", "status"],
      rows: [{ payment_id: "pay_123", status: "completed" }],
      rowCount: 1,
    };
  }

  async explainQuery(database: string, query: string): Promise<string> {
    return "Seq Scan on payments";
  }
}

export class FakeDeploymentProvider implements DeploymentProvider {
  async getDeploymentStatus(service: string): Promise<DeploymentStatus> {
    return {
      service,
      version: "v1.41",
      status: "running",
      replicas: { ready: 2, total: 3 },
      lastDeployed: new Date(),
    };
  }

  async deploy(service: string, version: string): Promise<DeploymentResult> {
    return {
      success: true,
      version,
      message: `Successfully deployed ${service} to version ${version}`,
    };
  }

  async rollback(service: string, toVersion: string): Promise<DeploymentResult> {
    return {
      success: true,
      version: toVersion,
      message: `Successfully rolled back ${service} to stable version ${toVersion}`,
    };
  }

  async restartService(service: string): Promise<DeploymentResult> {
    return {
      success: true,
      version: "current",
      message: `Restarted all instances of ${service}`,
    };
  }
}
