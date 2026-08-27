// ─── Risk ────────────────────────────────────────────────────
// Risk assessment types used by the risk engine and policy engine.

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type RiskFactorCategory =
  | "tool_sensitivity"
  | "operation_type"
  | "environment"
  | "data_sensitivity"
  | "destructive_potential"
  | "blast_radius"
  | "reversibility";

export interface RiskFactor {
  /** Which risk dimension this factor represents */
  readonly category: RiskFactorCategory;

  /** Human-readable value (e.g. "production", "delete", "irreversible") */
  readonly value: string;

  /** Weight of this factor in the overall score (0–1) */
  readonly weight: number;

  /** Numeric contribution to the overall risk score */
  readonly contribution: number;
}

export interface RiskAssessment {
  /** Overall risk classification */
  readonly level: RiskLevel;

  /** Individual risk factors that contributed to the assessment */
  readonly factors: readonly RiskFactor[];

  /** Numeric risk score (0–100) */
  readonly score: number;
}
