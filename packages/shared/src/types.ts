// ─── Action ───────────────────────────────────────────────────────────────────
// The unit of work flowing through the system. Every MCP write tool creates an
// Action before calling PolicyEngine.evaluate().

export interface Action {
  id: string;
  operation: "deploy" | "rollback" | "restart" | "scale" | "patch" | "query";
  target?: string; // e.g., "payment-service"
  environment: "production" | "staging" | "development";
  parameters?: Record<string, unknown>;
  requestedBy: string; // agent session ID or human
  timestamp: Date;
}

// ─── PolicyDecision ───────────────────────────────────────────────────────────
// Returned by PolicyEngine.evaluate(). Drives approval gating and audit logging.

export interface PolicyDecision {
  allowed: boolean;
  risk: "low" | "medium" | "high" | "critical";
  requiresApproval: boolean;
  reason: string;
  policyId: string;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class PolicyDeniedError extends Error {
  constructor(
    public readonly reason: string,
    public readonly policyId?: string,
  ) {
    super(`Policy denied: ${reason}`);
    this.name = "PolicyDeniedError";
  }
}

export class WriteGuardError extends Error {
  constructor(public readonly statement: string) {
    super(
      `Write guard rejected statement: only SELECT and EXPLAIN are allowed. Got: "${statement.slice(0, 80)}..."`,
    );
    this.name = "WriteGuardError";
  }
}

// ─── Sandbox Workflow & Secrets Guard ─────────────────────────────────────────

export interface SandboxEnvironment {
  envVars: Record<string, string>;
  workDir?: string;
  timeoutMs?: number;
}

export interface SandboxExecutionResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  artifacts: Array<{ path: string; content: string }>;
  riskLevel: "low" | "medium" | "high";
  requiresHumanReview: boolean;
}

export class SecretLeakError extends Error {
  constructor(public readonly leakedPatterns: string[]) {
    super(
      `Security Violation: Production secrets detected in sandbox environment: ${leakedPatterns.join(", ")}`,
    );
    this.name = "SecretLeakError";
  }
}

const PROD_SECRET_PATTERNS = [
  /(?:sk|pk|api|key|secret|token|pass|pwd|auth|cred)_[a-zA-Z0-9_-]{16,}/i,
  /AIza[0-9A-Za-z-_]{35}/, // Google API Key
  /sk-[a-zA-Z0-9]{20,}/, // OpenAI API Key
  /AKIA[0-9A-Z]{16}/, // AWS Access Key
  /ghp_[a-zA-Z0-9]{36}/, // GitHub PAT
  /postgres:\/\/[^:]+:[^@]+@/i, // Postgres connection string with password
  /redis:\/\/[^:]+:[^@]+@/i, // Redis connection string with password
];

const SENSITIVE_ENV_KEYS = [
  /PROD_/i,
  /PRODUCTION_/i,
  /SECRET/i,
  /PASSWORD/i,
  /PRIVATE_KEY/i,
  /API_KEY/i,
  /DATABASE_URL/i,
];

/**
 * Validates that no production secrets or credentials enter the sandbox environment.
 * Enforces our ground rule: The sandbox must NEVER receive production secrets.
 */
export function assertNoSecretsInSandbox(
  env: Record<string, string>,
  files: Record<string, string> = {},
): void {
  const leaks: string[] = [];

  for (const [key, value] of Object.entries(env)) {
    for (const pattern of SENSITIVE_ENV_KEYS) {
      if (pattern.test(key)) {
        leaks.push(`Env key matching sensitive pattern: '${key}'`);
      }
    }
    for (const pattern of PROD_SECRET_PATTERNS) {
      if (pattern.test(value)) {
        leaks.push(`Env value in '${key}' matching secret token pattern`);
      }
    }
  }

  for (const [filePath, content] of Object.entries(files)) {
    for (const pattern of PROD_SECRET_PATTERNS) {
      if (pattern.test(content)) {
        leaks.push(`File '${filePath}' contains credential pattern: ${pattern.source}`);
      }
    }
  }

  if (leaks.length > 0) {
    throw new SecretLeakError(leaks);
  }
}

