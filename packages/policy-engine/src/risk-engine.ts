// ─── Risk Engine ─────────────────────────────────────────────
// Deterministic risk classification — no LLM calls.
// Assesses risk based on 7 factors from the spec:
//   tool sensitivity, operation type, environment, data sensitivity,
//   destructive potential, blast radius, reversibility.

import type {
  Action,
  RiskAssessment,
  RiskFactor,
  RiskLevel,
  OperationType,
  Environment,
} from "@agent-guardian/domain";

// ── Factor weight configuration ──────────────────────────────

const FACTOR_WEIGHTS = {
  tool_sensitivity: 0.10,
  operation_type: 0.25,
  environment: 0.25,
  data_sensitivity: 0.05,
  destructive_potential: 0.15,
  blast_radius: 0.10,
  reversibility: 0.10,
} as const;

// ── Lookup tables ────────────────────────────────────────────

/** Known tool sensitivity scores (0–100). Unknown tools default to 80 (high). */
const TOOL_SENSITIVITY: Record<string, number> = {
  // Read-only / observability tools
  "kubectl-get": 10,
  "logs-viewer": 10,
  "metrics-query": 10,
  "status-check": 10,
  // Write / moderate tools
  "kubectl-apply": 50,
  "config-update": 50,
  "feature-toggle": 40,
  // Execution tools
  "sandbox-exec": 30,
  "script-runner": 40,
  // Deployment tools
  "deploy-service": 70,
  "rollback-service": 65,
  "restart-service": 60,
  // Destructive tools
  "kubectl-delete": 95,
  "drop-database": 100,
  "terminate-instance": 90,
};

const OPERATION_SCORES: Record<OperationType, number> = {
  read: 10,
  write: 40,
  execute: 50,
  deploy: 75,
  rollback: 70,
  restart: 65,
  delete: 95,
};

const ENVIRONMENT_SCORES: Record<Environment, number> = {
  sandbox: 10,
  staging: 40,
  production: 90,
};

// ── Factor assessors ─────────────────────────────────────────

function assessToolSensitivity(action: Action): RiskFactor {
  const score = TOOL_SENSITIVITY[action.tool] ?? 80; // unknown tools → high
  return {
    category: "tool_sensitivity",
    value: action.tool,
    weight: FACTOR_WEIGHTS.tool_sensitivity,
    contribution: score * FACTOR_WEIGHTS.tool_sensitivity,
  };
}

function assessOperationType(action: Action): RiskFactor {
  const score = OPERATION_SCORES[action.operation];
  return {
    category: "operation_type",
    value: action.operation,
    weight: FACTOR_WEIGHTS.operation_type,
    contribution: score * FACTOR_WEIGHTS.operation_type,
  };
}

function assessEnvironment(action: Action): RiskFactor {
  const score = ENVIRONMENT_SCORES[action.environment];
  return {
    category: "environment",
    value: action.environment,
    weight: FACTOR_WEIGHTS.environment,
    contribution: score * FACTOR_WEIGHTS.environment,
  };
}

function assessDataSensitivity(action: Action): RiskFactor {
  // Data sensitivity derived from action metadata if present
  const sensitivity = action.parameters["dataSensitivity"];
  let score: number;
  let value: string;
  if (sensitivity === "pii" || sensitivity === "credentials") {
    score = 90;
    value = String(sensitivity);
  } else if (sensitivity === "internal") {
    score = 50;
    value = "internal";
  } else {
    score = 20;
    value = "standard";
  }
  return {
    category: "data_sensitivity",
    value,
    weight: FACTOR_WEIGHTS.data_sensitivity,
    contribution: score * FACTOR_WEIGHTS.data_sensitivity,
  };
}

function assessDestructivePotential(action: Action): RiskFactor {
  const destructiveOps: OperationType[] = ["delete"];
  const moderateOps: OperationType[] = ["deploy", "rollback", "restart", "write"];
  let score: number;
  let value: string;
  if (destructiveOps.includes(action.operation)) {
    score = 100;
    value = "destructive";
  } else if (moderateOps.includes(action.operation)) {
    score = 50;
    value = "moderate";
  } else {
    score = 10;
    value = "safe";
  }
  return {
    category: "destructive_potential",
    value,
    weight: FACTOR_WEIGHTS.destructive_potential,
    contribution: score * FACTOR_WEIGHTS.destructive_potential,
  };
}

function assessBlastRadius(action: Action): RiskFactor {
  // Blast radius is a function of environment + operation severity
  const envScore = ENVIRONMENT_SCORES[action.environment];
  const opScore = OPERATION_SCORES[action.operation];
  const score = Math.round((envScore + opScore) / 2);
  let value: string;
  if (score >= 70) value = "wide";
  else if (score >= 40) value = "moderate";
  else value = "narrow";
  return {
    category: "blast_radius",
    value,
    weight: FACTOR_WEIGHTS.blast_radius,
    contribution: score * FACTOR_WEIGHTS.blast_radius,
  };
}

function assessReversibility(action: Action): RiskFactor {
  let score: number;
  let value: string;
  if (action.operation === "read") {
    score = 0;
    value = "fully_reversible";
  } else if (action.operation === "delete") {
    score = 100;
    value = "irreversible";
  } else if (action.operation === "deploy" || action.operation === "write") {
    score = 40;
    value = "partially_reversible";
  } else {
    score = 20;
    value = "reversible";
  }
  return {
    category: "reversibility",
    value,
    weight: FACTOR_WEIGHTS.reversibility,
    contribution: score * FACTOR_WEIGHTS.reversibility,
  };
}

// ── Score → RiskLevel mapping ────────────────────────────────

function scoreToLevel(score: number): RiskLevel {
  if (score >= 70) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

// ── Public API ───────────────────────────────────────────────

/**
 * Assess the risk of an action based on 7 deterministic factors.
 * No LLM calls — purely rule-based.
 */
export function assessRisk(action: Action): RiskAssessment {
  const factors: RiskFactor[] = [
    assessToolSensitivity(action),
    assessOperationType(action),
    assessEnvironment(action),
    assessDataSensitivity(action),
    assessDestructivePotential(action),
    assessBlastRadius(action),
    assessReversibility(action),
  ];

  const score = Math.round(
    factors.reduce((sum, f) => sum + f.contribution, 0)
  );

  return {
    level: scoreToLevel(score),
    factors,
    score,
  };
}
