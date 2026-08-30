import { TrueForgeAgentHarness } from "./harness.js";
import {
  FakeMonitoringProvider,
  FakeLogProvider,
  FakeGitProvider,
  FakeDatabaseProvider,
  FakeDeploymentProvider,
} from "./mock-providers.js";

export interface SREIncidentPlan {
  service: string;
  detectedAnomaly: string;
  rootCause: string;
  sandboxTestResult: string;
  proposedAction: "rollback" | "deploy" | "restart";
  targetVersion: string;
}

export class AgentGuardianOrchestrator {
  private harness: TrueForgeAgentHarness;
  private monitoring = new FakeMonitoringProvider();
  private logs = new FakeLogProvider();
  private git = new FakeGitProvider();
  private database = new FakeDatabaseProvider();
  private deployment = new FakeDeploymentProvider();

  constructor(harness: TrueForgeAgentHarness) {
    this.harness = harness;
  }

  /**
   * Phase 1: Evidence Gathering & Autonomous Investigation
   */
  public async investigate(service: string): Promise<SREIncidentPlan> {
    console.log(`\n🔍 [TrueForge Agent] Investigating service: ${service}...`);

    // 1. Check Monitoring
    this.harness.evaluateAndAuthorize({
      tool: "monitoring-mcp",
      operation: "read",
      target: service,
      environment: "production",
    });
    const health = await this.monitoring.getServiceHealth(service);
    const alerts = await this.monitoring.getRecentAlerts(service, 5);
    console.log(`  📊 Monitoring Status: ${health.status.toUpperCase()} (Error Rate: ${health.errorRate}%, Latency: ${health.latencyMs}ms)`);
    console.log(`  🚨 Active Alert: ${alerts[0]?.message}`);

    // 2. Search Logs & Trace
    this.harness.evaluateAndAuthorize({
      tool: "logs-mcp",
      operation: "read",
      target: service,
      environment: "production",
    });
    const recentErrors = await this.logs.getRecentErrors(service, 3);
    console.log(`  📜 Recent Error: ${recentErrors[0]?.message}`);

    // 3. Inspect Git history and diff
    this.harness.evaluateAndAuthorize({
      tool: "github-mcp",
      operation: "read",
      target: service,
      environment: "production",
    });
    const commits = await this.git.getRecentCommits(`org/${service}`, 2);
    const latestCommit = commits[0];
    const diffs = await this.git.getCommitDiff(`org/${service}`, latestCommit.sha);
    console.log(`  🌿 Git Commit: [${latestCommit.sha}] "${latestCommit.message}"`);
    console.log(`  🔍 Diff Analysis: ${diffs[0]?.path} modified (${diffs[0]?.deletions} deletions)`);

    // 4. Inspect Database
    this.harness.evaluateAndAuthorize({
      tool: "database-mcp",
      operation: "read",
      target: "payments_db",
      environment: "production",
    });
    const schema = await this.database.getSchema("payments_db");
    console.log(`  🗄️ Database: Schema inspected (${schema.length} tables found)`);

    // Phase 2: TrueForge Sandbox Verification
    console.log(`\n🧪 [TrueForge Sandbox] Running repro test in isolated sandbox container...`);
    const sandboxCode = `
# TrueForge Sandbox Diagnostic Execution
import sys
def test_payment_handler():
    payload = {"amount": 100, "currency": "USD", "payment_method": None}
    try:
        # Repro v1.41 crash
        payload["payment_method"].lower()
        return False
    except AttributeError:
        return True # Repro confirmed

assert test_payment_handler() == True
print("CONFIRMED_REGRESSION: payment_method null dereference in v1.41")
`;
    const sandboxResult = await this.harness.executeInSandbox(sandboxCode);
    console.log(`  ✅ Sandbox Verification Complete (Exit: ${sandboxResult.exitCode}, Duration: ${sandboxResult.durationMs}ms)`);

    return {
      service,
      detectedAnomaly: alerts[0]?.message ?? "Error rate spike",
      rootCause: `Null pointer exception in v1.41 when payment_method is None (commit ${latestCommit.sha})`,
      sandboxTestResult: sandboxResult.stdout,
      proposedAction: "rollback",
      targetVersion: "v1.40",
    };
  }

  /**
   * Phase 3: Policy-Gated Remediation & Human-in-the-Loop Execution
   */
  public async executeRemediation(
    plan: SREIncidentPlan,
    autoApproveHuman = true,
  ): Promise<{ success: boolean; message: string }> {
    console.log(`\n🛡️ [Policy Gate] Evaluating proposed remediation: ${plan.proposedAction} to ${plan.targetVersion}...`);

    // Evaluate remediation action against policy engine
    const authResult = this.harness.evaluateAndAuthorize({
      tool: "deployment-mcp",
      operation: plan.proposedAction,
      target: plan.service,
      environment: "production",
      parameters: { toVersion: plan.targetVersion },
    });

    console.log(`  ⚖️ Policy Decision: allowed=${authResult.decision.allowed}, risk=${authResult.decision.riskAssessment.level.toUpperCase()}, requiresApproval=${authResult.requiresApproval}`);
    console.log(`  📋 Matched Rule: "${authResult.decision.matchedRule}" (${authResult.decision.reason})`);

    if (!authResult.decision.allowed) {
      console.log(`  ❌ BLOCKED: Policy denied the action.`);
      return { success: false, message: "Action blocked by safety policy" };
    }

    if (authResult.requiresApproval && authResult.approval) {
      console.log(`\n⏸️ [Human-in-the-Loop] Execution paused. State: ${this.harness.killSwitch.state}`);
      console.log(`  ✋ Approval requested: ${authResult.approval.id} (Risk: ${authResult.decision.riskAssessment.level})`);

      if (autoApproveHuman) {
        console.log(`  👤 Human Operator (on-call SRE): Reviewing rollback plan... APPROVED.`);
        this.harness.grantApproval(authResult.approval.id, "sre-oncall@company.internal");
      } else {
        console.log(`  👤 Human Operator: Action DENIED.`);
        this.harness.denyApproval(authResult.approval.id, "sre-oncall@company.internal", "Manual intervention chosen");
        return { success: false, message: "Approval denied by operator" };
      }
    }

    console.log(`\n🚀 [Deployment] Executing authorized ${plan.proposedAction} to ${plan.targetVersion}...`);
    this.harness.auditLog.emit({
      id: `deploy-start-${Date.now()}`,
      sessionId: this.harness.sessionId,
      type: "DEPLOYMENT_STARTED",
      timestamp: new Date().toISOString(),
      payload: { service: plan.service, targetVersion: plan.targetVersion },
      actorId: "agent-guardian",
    });

    const deployResult = await this.deployment.rollback(plan.service, plan.targetVersion);

    this.harness.auditLog.emit({
      id: `deploy-complete-${Date.now()}`,
      sessionId: this.harness.sessionId,
      type: "DEPLOYMENT_COMPLETED",
      timestamp: new Date().toISOString(),
      payload: {
        success: deployResult.success,
        version: deployResult.version,
        message: deployResult.message,
      },
      actorId: "agent-guardian",
    });

    this.harness.auditLog.emit({
      id: `inc-resolved-${Date.now()}`,
      sessionId: this.harness.sessionId,
      type: "INCIDENT_RESOLVED",
      timestamp: new Date().toISOString(),
      payload: { service: plan.service, version: plan.targetVersion, resolution: "Rolled back successfully" },
      actorId: "agent-guardian",
    });

    console.log(`  🎉 Deployment Successful: ${deployResult.message}`);
    console.log(`  🟢 Incident Resolved! Error rate returning to baseline (0.0%).`);

    return { success: true, message: deployResult.message };
  }
}
