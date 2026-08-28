// ─── Monitoring Provider ──────────────────────────────────────────────────────

export interface ServiceHealth {
  service: string;
  status: "healthy" | "degraded" | "down";
  errorRate: number;
  latencyMs: number;
  healthyInstances: number;
  totalInstances: number;
}

export interface MetricPoint {
  timestamp: Date;
  value: number;
}

export interface Alert {
  id: string;
  service: string;
  severity: "info" | "warning" | "critical";
  message: string;
  timestamp: Date;
  resolved: boolean;
}

export interface MonitoringProvider {
  getServiceHealth(service: string): Promise<ServiceHealth>;
  getMetrics(
    service: string,
    metric: string,
    windowMinutes: number,
  ): Promise<MetricPoint[]>;
  getErrorRate(service: string, windowMinutes: number): Promise<number>;
  getLatency(service: string, windowMinutes: number): Promise<number>;
  getRecentAlerts(service: string, limit: number): Promise<Alert[]>;
}

// ─── Log Provider ─────────────────────────────────────────────────────────────

export interface LogEntry {
  timestamp: Date;
  level: "debug" | "info" | "warn" | "error";
  service: string;
  message: string;
  traceId?: string;
  metadata?: Record<string, unknown>;
}

export interface ErrorTrace {
  traceId: string;
  service: string;
  error: string;
  stackTrace: string;
  timestamp: Date;
}

export interface LogProvider {
  searchLogs(
    service: string,
    query: string,
    limit: number,
  ): Promise<LogEntry[]>;
  getErrorTrace(traceId: string): Promise<ErrorTrace | null>;
  getRecentErrors(service: string, limit: number): Promise<LogEntry[]>;
}

// ─── Git Provider ─────────────────────────────────────────────────────────────

export interface Commit {
  sha: string;
  message: string;
  author: string;
  timestamp: Date;
  files: string[];
}

export interface FileDiff {
  path: string;
  additions: number;
  deletions: number;
  patch: string;
}

export interface GitProvider {
  getRecentCommits(repo: string, limit: number): Promise<Commit[]>;
  getCommitDiff(repo: string, sha: string): Promise<FileDiff[]>;
  getFile(repo: string, path: string, ref?: string): Promise<string>;
  createBranch(
    repo: string,
    branchName: string,
    fromRef: string,
  ): Promise<string>;
  createPatch(
    repo: string,
    branch: string,
    files: Record<string, string>,
    message: string,
  ): Promise<string>;
}

// ─── Database Provider ────────────────────────────────────────────────────────

export interface TableSchema {
  table: string;
  columns: { name: string; type: string; nullable: boolean }[];
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

export interface DatabaseProvider {
  getSchema(database: string): Promise<TableSchema[]>;
  readQuery(database: string, query: string): Promise<QueryResult>;
  explainQuery(database: string, query: string): Promise<string>;
}

// ─── Deployment Provider ──────────────────────────────────────────────────────

export interface DeploymentStatus {
  service: string;
  version: string;
  status: "running" | "deploying" | "failed" | "rolled_back";
  replicas: { ready: number; total: number };
  lastDeployed: Date;
}

export interface DeploymentResult {
  success: boolean;
  version: string;
  message: string;
}

export interface DeploymentProvider {
  getDeploymentStatus(service: string): Promise<DeploymentStatus>;
  deploy(service: string, version: string): Promise<DeploymentResult>;
  rollback(service: string, toVersion: string): Promise<DeploymentResult>;
  restartService(service: string): Promise<DeploymentResult>;
}
