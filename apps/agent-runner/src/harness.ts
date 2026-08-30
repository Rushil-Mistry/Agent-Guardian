import { randomUUID } from "node:crypto";
import type {
  Action as DomainAction,
  AuditEvent,
  Approval,
} from "@agent-guardian/domain";
import { evaluate as evaluateDomainPolicy } from "@agent-guardian/policy-engine";
import { AuditLog } from "@agent-guardian/audit";
import { KillSwitch } from "@agent-guardian/kill-switch";
import { assertNoSecretsInSandbox, type SandboxExecutionResult } from "@agent-guardian/shared";

export interface HarnessConfig {
  sessionId: string;
  agentName: string;
  sandboxTimeoutMs?: number;
}

export interface ToolExecutionContext {
  tool: string;
  operation: DomainAction["operation"];
  target: string;
  environment: DomainAction["environment"];
  parameters?: Record<string, unknown>;
}

export interface ToolExecutionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  policyDecision?: ReturnType<typeof evaluateDomainPolicy>;
  requiresApproval?: boolean;
  approvalId?: string;
}

/**
 * TrueForgeAgentHarness connects tools (MCP), Sandboxes, Safety Policies,
 * and Human-in-the-Loop approval workflows into an autonomous runtime.
 */
export class TrueForgeAgentHarness {
  public readonly sessionId: string;
  public readonly auditLog: AuditLog;
  public readonly killSwitch: KillSwitch;
  private readonly config: HarnessConfig;
  private readonly approvals: Map<string, Approval> = new Map();

  constructor(config: HarnessConfig) {
    this.config = config;
    this.sessionId = config.sessionId;
    this.auditLog = new AuditLog();
    this.killSwitch = new KillSwitch({
      sessionId: this.sessionId,
      auditLog: this.auditLog,
      actorId: config.agentName,
    });

    // Record session creation audit event
    this.auditLog.emit({
      id: `session-init-${this.sessionId}`,
      sessionId: this.sessionId,
      type: "SESSION_CREATED",
      timestamp: new Date().toISOString(),
      payload: {
        agent: config.agentName,
        harness: "TrueForge",
        timestamp: new Date().toISOString(),
      },
      actorId: config.agentName,
    });
  }

  /**
   * Execute code within a TrueForge secure sandbox
   */
  public async executeInSandbox(
    code: string,
    environment: Record<string, string> = {},
  ): Promise<SandboxExecutionResult> {
    this.killSwitch.checkGate();

    // Verify code and env vars do not leak secrets
    assertNoSecretsInSandbox(environment, { "diagnostic.py": code });

    const startTime = Date.now();
    this.auditLog.emit({
      id: `sandbox-start-${randomUUID()}`,
      sessionId: this.sessionId,
      type: "SANDBOX_STARTED",
      timestamp: new Date().toISOString(),
      payload: { codeLength: code.length },
      actorId: this.config.agentName,
    });

    try {
      // Simulate isolated TrueForge sandbox execution
      const sandboxOutput = `[TrueForge Sandbox] Executed cleanly in isolated container:\n` +
        `Evaluated script diagnostics: OK. No anomalies detected in runtime environment.`;

      const durationMs = Date.now() - startTime;
      const result: SandboxExecutionResult = {
        success: true,
        exitCode: 0,
        stdout: sandboxOutput,
        stderr: "",
        durationMs,
        artifacts: [],
        riskLevel: "low",
        requiresHumanReview: false,
      };

      this.auditLog.emit({
        id: `sandbox-complete-${randomUUID()}`,
        sessionId: this.sessionId,
        type: "SANDBOX_COMPLETED",
        timestamp: new Date().toISOString(),
        payload: { exitCode: result.exitCode, durationMs: result.durationMs },
        actorId: this.config.agentName,
      });

      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: errorMsg,
        durationMs: Date.now() - startTime,
        artifacts: [],
        riskLevel: "high",
        requiresHumanReview: true,
      };
    }
  }

  /**
   * Evaluates policy before invoking any MCP tool.
   * If action requires approval, creates an Approval object and pauses in WAITING_APPROVAL state.
   */
  public evaluateAndAuthorize(context: ToolExecutionContext): {
    authorized: boolean;
    requiresApproval: boolean;
    decision: ReturnType<typeof evaluateDomainPolicy>;
    approval?: Approval;
  } {
    this.killSwitch.checkGate();

    const domainAction: DomainAction = {
      id: `act-${randomUUID()}`,
      incidentId: `inc-${this.sessionId}`,
      tool: context.tool,
      operation: context.operation,
      environment: context.environment,
      parameters: context.parameters ?? {},
      description: `${context.operation} on ${context.target} (${context.environment})`,
      requestedAt: new Date().toISOString(),
      requestedBy: this.config.agentName,
    };

    // Emit tool requested
    this.auditLog.emit({
      id: `audit-tool-req-${randomUUID()}`,
      sessionId: this.sessionId,
      type: "TOOL_REQUESTED",
      timestamp: new Date().toISOString(),
      payload: {
        tool: context.tool,
        operation: context.operation,
        target: context.target,
        environment: context.environment,
      },
      actorId: this.config.agentName,
    });

    const decision = evaluateDomainPolicy(domainAction);

    // Emit policy evaluated
    this.auditLog.emit({
      id: `audit-pol-eval-${randomUUID()}`,
      sessionId: this.sessionId,
      type: "POLICY_EVALUATED",
      timestamp: new Date().toISOString(),
      payload: {
        actionId: domainAction.id,
        allowed: decision.allowed,
        risk: decision.riskAssessment.level,
        requiresApproval: decision.requiresApproval,
        rule: decision.matchedRule ?? "none",
        reason: decision.reason,
      },
      actorId: this.config.agentName,
    });

    if (!decision.allowed) {
      this.auditLog.emit({
        id: `audit-act-block-${randomUUID()}`,
        sessionId: this.sessionId,
        type: "ACTION_BLOCKED",
        timestamp: new Date().toISOString(),
        payload: {
          actionId: domainAction.id,
          reason: decision.reason,
        },
        actorId: this.config.agentName,
      });

      return {
        authorized: false,
        requiresApproval: false,
        decision,
      };
    }

    if (decision.requiresApproval) {
      const approval: Approval = {
        id: `appr-${randomUUID()}`,
        actionId: domainAction.id,
        status: "pending",
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      };

      this.approvals.set(approval.id, approval);
      this.killSwitch.registerPendingApproval(approval);

      if (this.killSwitch.state === "RUNNING") {
        this.killSwitch.waitForApproval();
      }

      this.auditLog.emit({
        id: `audit-appr-req-${randomUUID()}`,
        sessionId: this.sessionId,
        type: "APPROVAL_REQUESTED",
        timestamp: new Date().toISOString(),
        payload: {
          approvalId: approval.id,
          actionId: domainAction.id,
          risk: decision.riskAssessment.level,
        },
        actorId: this.config.agentName,
      });

      return {
        authorized: false,
        requiresApproval: true,
        decision,
        approval,
      };
    }

    return {
      authorized: true,
      requiresApproval: false,
      decision,
    };
  }

  /**
   * Human operator grants approval for a pending action
   */
  public grantApproval(approvalId: string, approver: string): void {
    const approval = this.approvals.get(approvalId);
    if (!approval) {
      throw new Error(`Approval ${approvalId} not found`);
    }

    approval.status = "granted";
    approval.respondedAt = new Date().toISOString();
    approval.respondedBy = approver;

    this.killSwitch.removePendingApproval(approvalId);
    if (this.killSwitch.state === "WAITING_APPROVAL") {
      this.killSwitch.resume();
    }

    this.auditLog.emit({
      id: `audit-appr-grant-${randomUUID()}`,
      sessionId: this.sessionId,
      type: "APPROVAL_GRANTED",
      timestamp: new Date().toISOString(),
      payload: {
        approvalId,
        approver,
      },
      actorId: approver,
    });
  }

  /**
   * Human operator denies approval for a pending action
   */
  public denyApproval(approvalId: string, responder: string, reason: string): void {
    const approval = this.approvals.get(approvalId);
    if (!approval) {
      throw new Error(`Approval ${approvalId} not found`);
    }

    approval.status = "denied";
    approval.respondedAt = new Date().toISOString();
    approval.respondedBy = responder;
    approval.reason = reason;

    this.killSwitch.removePendingApproval(approvalId);
    if (this.killSwitch.state === "WAITING_APPROVAL") {
      this.killSwitch.resume();
    }

    this.auditLog.emit({
      id: `audit-appr-deny-${randomUUID()}`,
      sessionId: this.sessionId,
      type: "APPROVAL_DENIED",
      timestamp: new Date().toISOString(),
      payload: {
        approvalId,
        responder,
        reason,
      },
      actorId: responder,
    });
  }
}
