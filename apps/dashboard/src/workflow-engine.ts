import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { evaluate as evaluatePolicy } from "@agent-guardian/policy-engine";
import { AuditLog } from "@agent-guardian/audit";
import { KillSwitch } from "@agent-guardian/kill-switch";
import type { Action as DomainAction } from "@agent-guardian/domain";
import { assertNoSecretsInSandbox } from "@agent-guardian/shared";

const MOCK_HEALTH_DEGRADED = { service: "payment-service", status: "degraded", errorRate: 13.4, latencyMs: 820, healthyInstances: 2, totalInstances: 3 };
const MOCK_HEALTH_HEALTHY = { service: "payment-service", status: "healthy", errorRate: 0.1, latencyMs: 145, healthyInstances: 3, totalInstances: 3 };

const MOCK_ALERTS_ACTIVE = [
  { id: "alert-001", service: "payment-service", severity: "critical", message: "High error rate detected on payment-service: 13.4% (threshold: 5%)", timestamp: new Date().toISOString(), resolved: false },
  { id: "alert-002", service: "payment-service", severity: "warning", message: "Elevated latency on payment-service: 820ms (threshold: 500ms)", timestamp: new Date().toISOString(), resolved: false },
  { id: "alert-003", service: "payment-service", severity: "info", message: "Deployment v1.41 completed for payment-service", timestamp: new Date(Date.now() - 300000).toISOString(), resolved: true },
];

const MOCK_ERRORS = [
  { timestamp: new Date().toISOString(), level: "error", service: "payment-service", message: "TypeError: Cannot read properties of null (reading 'payment_method')", traceId: "trace-a1b2c3d4" },
  { timestamp: new Date(Date.now() - 5000).toISOString(), level: "error", service: "payment-service", message: "500 Internal Server Error: AttributeError in process_payment_v141", traceId: "trace-e5f6g7h8" },
];
const MOCK_TRACE = { traceId: "trace-a1b2c3d4", service: "payment-service", error: "AttributeError: 'NoneType' object has no attribute 'lower'", stackTrace: "File main.py, line 81 in process_payment_v141\n  method = payment.payment_method.lower()\nAttributeError: 'NoneType' object has no attribute 'lower'", timestamp: new Date().toISOString() };
const MOCK_DB_RESULT = { columns: ["payment_id", "amount", "payment_method", "status", "error"], rows: [{ payment_id: "pay_f01a", amount: 100, payment_method: null, status: "failed", error: "NoneType" }, { payment_id: "pay_f01b", amount: 250, payment_method: null, status: "failed", error: "NoneType" }, { payment_id: "pay_f01c", amount: 75, payment_method: null, status: "failed", error: "NoneType" }], rowCount: 3 };
const MOCK_COMMITS = [
  { sha: "a7f39b1e", message: "perf(payments): refactor payment processor pipeline to v1.41", author: "dev@company.internal", timestamp: new Date().toISOString(), files: ["apps/demo-service/main.py"] },
  { sha: "e4d28c9a", message: "feat(payments): stable v1.40 release", author: "dev@company.internal", timestamp: new Date(Date.now() - 86400000).toISOString(), files: ["apps/demo-service/main.py"] },
];
const MOCK_DIFF = { path: "apps/demo-service/main.py", additions: 2, deletions: 4, patch: "@@ -78,8 +78,4 @@ def process_payment(payment):\n-    if not payment.payment_method:\n-        raise ValueError(\"payment_method is required\")\n-    method = payment.payment_method.lower()\n-    # validate against known methods\n+    method = payment.payment_method.lower()  # v1.41: removed null check\n+    # BUG: payment_method can be None from mobile clients" };
const MOCK_SANDBOX_FIX = "def process_payment(payment_request: dict) -> dict:\n    method = payment_request.get(\"payment_method\")\n    if method is None:\n        raise ValueError(\"payment_method is required\")\n    return {\n        \"payment_id\": \"pay_verified_123\",\n        \"status\": \"completed\",\n        \"amount\": payment_request.get(\"amount\", 0),\n        \"method\": method.lower(),\n    }";
const MOCK_SANDBOX_TEST = "import unittest\nfrom payments import process_payment\n\nclass TestRemediation(unittest.TestCase):\n    def test_valid_payment(self):\n        res = process_payment({\"amount\": 100, \"payment_method\": \"credit_card\"})\n        self.assertEqual(res[\"status\"], \"completed\")\n\n    def test_null_payment_method(self):\n        with self.assertRaises(ValueError):\n            process_payment({\"amount\": 100, \"payment_method\": None})";

export type StepId = "observe" | "investigate" | "root-cause" | "sandbox" | "policy" | "approval" | "deploy" | "verified";
export type StepStatus = "pending" | "active" | "done" | "error" | "waiting";

export interface WorkflowStep { id: StepId; name: string; icon: string; status: StepStatus; description: string; data?: Record<string, unknown>; startedAt?: string; completedAt?: string; }

export interface ApprovalRequest { id: string; action: string; target: string; version: string; riskLevel: string; patchDiff: string; sandboxResults: string; testOutput: string; policyRule: string; policyReason: string; }

interface AuditEvent { id: string; type: string; timestamp: string; payload: Record<string, unknown>; }

export interface WorkflowState {
  sessionId: string;
  status: "idle" | "running" | "waiting_approval" | "completed" | "failed" | "killed";
  steps: WorkflowStep[];
  killSwitchState: string;
  auditEvents: AuditEvent[];
  health: typeof MOCK_HEALTH_DEGRADED | null;
  alerts: typeof MOCK_ALERTS_ACTIVE;
  currentStepIndex: number;
  approvalPending: ApprovalRequest | null;
}

export class WorkflowEngine extends EventEmitter {
  public state: WorkflowState;
  private auditLog: AuditLog;
  private killSwitch: KillSwitch;
  private approvalResolver: ((approved: boolean) => void) | null = null;

  constructor() {
    super();
    this.auditLog = new AuditLog();
    const sessionId = `sess-${Date.now()}`;
    this.killSwitch = new KillSwitch({ sessionId, auditLog: this.auditLog, actorId: "agent-guardian-sre" });
    this.state = {
      sessionId,
      status: "idle",
      steps: this.createSteps(),
      killSwitchState: this.killSwitch.state,
      auditEvents: [],
      health: MOCK_HEALTH_HEALTHY,
      alerts: [],
      currentStepIndex: -1,
      approvalPending: null,
    };
  }

  private createSteps(): WorkflowStep[] {
    return [
      { id: "observe", name: "Observe", icon: "\uD83D\uDD0D", status: "pending", description: "Detecting service anomalies via monitoring" },
      { id: "investigate", name: "Investigate", icon: "\uD83D\uDD0E", status: "pending", description: "Correlating logs, database, and git changes" },
      { id: "root-cause", name: "Root Cause", icon: "\uD83D\uDCA1", status: "pending", description: "Identifying root cause from collected evidence" },
      { id: "sandbox", name: "Sandbox Test", icon: "\uD83E\uDDEA", status: "pending", description: "Testing patch in isolated sandbox" },
      { id: "policy", name: "Policy Gate", icon: "\u2696\uFE0F", status: "pending", description: "Evaluating action against safety policies" },
      { id: "approval", name: "Human Approval", icon: "\uD83D\uDC64", status: "pending", description: "Awaiting human operator decision" },
      { id: "deploy", name: "Deploy", icon: "\uD83D\uDE80", status: "pending", description: "Executing authorized remediation" },
      { id: "verified", name: "Verified", icon: "\u2705", status: "pending", description: "Post-deployment health verification" },
    ];
  }

  public getState(): WorkflowState {
    return { ...this.state, killSwitchState: this.killSwitch.state };
  }

  public getInitialStatus() {
    return { health: this.state.health || MOCK_HEALTH_HEALTHY, alerts: this.state.alerts, killSwitchState: this.killSwitch.state };
  }

  public async resolveApproval(approved: boolean): Promise<void> {
    if (this.approvalResolver) {
      this.approvalResolver(approved);
      this.approvalResolver = null;
    }
  }

  public activateKillSwitch(): void {
    try { this.killSwitch.stop(); } catch {}
    this.state.status = "killed";
    this.state.approvalPending = null;
    this.state.killSwitchState = this.killSwitch.state;
    this.addAudit("KILL_SWITCH_ACTIVATED", { activatedBy: "operator" });
    this.emit("update", this.getState());
  }

  public resetOrResumeKillSwitch(): void {
    // Re-instantiate a fresh kill switch session so the system is fully re-armed
    const newSessionId = `sess-${Date.now()}`;
    this.state.sessionId = newSessionId;
    this.killSwitch = new KillSwitch({ sessionId: newSessionId, auditLog: this.auditLog, actorId: "agent-guardian-sre" });
    this.state.killSwitchState = this.killSwitch.state;
    this.state.status = "idle";
    this.state.approvalPending = null;
    this.addAudit("KILL_SWITCH_RESET", { resetBy: "operator", newSessionId });
    this.emit("update", this.getState());
  }

  private addAudit(type: string, payload: Record<string, unknown>): void {
    this.state.auditEvents.push({ id: `audit-${randomUUID().slice(0, 8)}`, type, timestamp: new Date().toISOString(), payload });
  }

  private async advanceStep(stepId: StepId, data?: Record<string, unknown>): Promise<void> {
    const idx = this.state.steps.findIndex((s) => s.id === stepId);
    if (idx === -1) return;
    if (this.killSwitch.state === "STOPPED") {
      this.state.status = "killed";
    this.state.approvalPending = null;
      this.emit("update", this.getState());
      throw new Error("Emergency Stop active — workflow halted.");
    }
    this.state.currentStepIndex = idx;
    this.state.steps[idx].status = "active";
    this.state.steps[idx].startedAt = new Date().toISOString();
    this.emit("update", this.getState());
    await this.delay(1100);
    if (data) {
      this.state.steps[idx].data = data;
      this.emit("update", this.getState());
    }
  }

  private completeStep(stepId: StepId): void {
    const idx = this.state.steps.findIndex((s) => s.id === stepId);
    if (idx === -1) return;
    this.state.steps[idx].status = "done";
    this.state.steps[idx].completedAt = new Date().toISOString();
    this.emit("update", this.getState());
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  public async runIncident(): Promise<void> {
    // If previous run was stopped or completed, start fresh with re-armed session
    const newSessionId = `sess-${Date.now()}`;
    this.state.sessionId = newSessionId;
    this.killSwitch = new KillSwitch({ sessionId: newSessionId, auditLog: this.auditLog, actorId: "agent-guardian-sre" });
    this.state.killSwitchState = this.killSwitch.state;
    this.approvalResolver = null;
    this.state.approvalPending = null;

    this.state.steps = this.createSteps();
    this.state.auditEvents = [];
    this.state.status = "running";
    this.state.currentStepIndex = -1;
    this.state.health = { ...MOCK_HEALTH_DEGRADED };
    this.state.alerts = [...MOCK_ALERTS_ACTIVE];

    this.addAudit("SESSION_CREATED", { sessionId: this.state.sessionId, agent: "agent-guardian-sre" });
    this.emit("update", this.getState());

    try {
      // STEP 1: OBSERVE
      await this.advanceStep("observe");
      this.addAudit("TOOL_REQUESTED", { tool: "monitoring-mcp", operation: "read", target: "payment-service" });
      await this.delay(700);
      this.state.health = { ...MOCK_HEALTH_DEGRADED };
      this.state.alerts = [...MOCK_ALERTS_ACTIVE];
      this.state.steps[0].data = {
        service: MOCK_HEALTH_DEGRADED.service,
        status: MOCK_HEALTH_DEGRADED.status,
        errorRate: MOCK_HEALTH_DEGRADED.errorRate,
        latencyMs: MOCK_HEALTH_DEGRADED.latencyMs,
        replicas: `${MOCK_HEALTH_DEGRADED.healthyInstances}/${MOCK_HEALTH_DEGRADED.totalInstances}`,
        alerts: MOCK_ALERTS_ACTIVE.map((a) => ({ severity: a.severity, message: a.message })),
      };
      this.addAudit("ANOMALY_DETECTED", { errorRate: 13.4, threshold: 5, status: "degraded" });
      this.completeStep("observe");

      // STEP 2: INVESTIGATE
      await this.advanceStep("investigate");
      this.addAudit("TOOL_REQUESTED", { tool: "logs-mcp", operation: "read", target: "payment-service" });
      await this.delay(500);
      this.state.steps[1].data = { recentErrors: MOCK_ERRORS };
      this.emit("update", this.getState());
      await this.delay(400);
      this.state.steps[1].data = { ...this.state.steps[1].data as object, errorTrace: MOCK_TRACE };
      this.emit("update", this.getState());
      this.addAudit("TOOL_REQUESTED", { tool: "database-mcp", operation: "read", target: "payments_db" });
      await this.delay(400);
      this.state.steps[1].data = { ...this.state.steps[1].data as object, dbQuery: "SELECT * FROM payments WHERE payment_method IS NULL", dbResult: MOCK_DB_RESULT };
      this.emit("update", this.getState());
      this.addAudit("TOOL_REQUESTED", { tool: "github-mcp", operation: "read", target: "org/payment-service" });
      await this.delay(500);
      this.state.steps[1].data = { ...this.state.steps[1].data as object, commits: MOCK_COMMITS, diff: MOCK_DIFF };
      this.addAudit("EVIDENCE_COLLECTED", { sources: ["logs-mcp", "database-mcp", "github-mcp"] });
      this.completeStep("investigate");

      // STEP 3: ROOT CAUSE
      await this.advanceStep("root-cause", {
        hypothesis: "Release v1.41 removed the null validation for payment_method",
        bugCommit: "a7f39b1e",
        bugAuthor: "dev@company.internal",
        affectedFile: "apps/demo-service/main.py",
        description: "Commit a7f39b1e removed the null check on payment_method in process_payment(). When mobile clients send requests with payment_method=null, the .lower() call raises AttributeError, causing 500 errors and a 13.4% error rate spike.",
      });
      this.addAudit("ROOT_CAUSE_IDENTIFIED", { commit: "a7f39b1e", issue: "null payment_method dereference" });
      await this.delay(600);
      this.completeStep("root-cause");

      // STEP 4: SANDBOX
      await this.advanceStep("sandbox");
      this.addAudit("SANDBOX_STARTED", { patchBranch: "fix/payment-method-validation" });
      await this.delay(400);
      this.state.steps[3].data = { phase: "Secret scan: PASSED — zero production credentials leaked" };
      this.emit("update", this.getState());
      assertNoSecretsInSandbox({}, { "payments.py": MOCK_SANDBOX_FIX, "test_remediation.py": MOCK_SANDBOX_TEST });
      await this.delay(500);
      this.state.steps[3].data = { ...this.state.steps[3].data as object, phase: "Running isolated test suite...", patchCode: MOCK_SANDBOX_FIX, testCode: MOCK_SANDBOX_TEST };
      this.emit("update", this.getState());
      await this.delay(900);
      this.state.steps[3].data = { ...this.state.steps[3].data as object, phase: "PASSED", testOutput: "Ran 2 tests in 0.003s\n\ntest_valid_payment ... ok\ntest_null_payment_method ... ok\n\nOK", artifacts: ["patch.diff", "test_report.md"] };
      this.addAudit("SANDBOX_COMPLETED", { exitCode: 0, tests: "2/2 passed" });
      this.completeStep("sandbox");

      // STEP 5: POLICY
      await this.advanceStep("policy");
      const domainAction: DomainAction = { id: `act-${randomUUID().slice(0, 8)}`, incidentId: `inc-${this.state.sessionId}`, tool: "deployment-mcp", operation: "deploy", environment: "production", parameters: { version: "v1.42" }, description: "Deploy v1.42 fix to production", requestedAt: new Date().toISOString(), requestedBy: "agent-guardian-sre" };
      const decision = evaluatePolicy(domainAction);
      await this.delay(500);
      this.state.steps[4].data = { allowed: decision.allowed, riskLevel: decision.riskAssessment.level, requiresApproval: decision.requiresApproval, matchedRule: decision.matchedRule, reason: decision.reason };
      this.addAudit("POLICY_EVALUATED", { allowed: decision.allowed, risk: decision.riskAssessment.level, requiresApproval: decision.requiresApproval, rule: decision.matchedRule });
      this.completeStep("policy");

      // STEP 6: APPROVAL (Human in the loop)
      await this.advanceStep("approval");
      this.state.steps[5].status = "waiting";
      this.state.status = "waiting_approval";
      this.state.approvalPending = {
        id: `appr-${randomUUID().slice(0, 8)}`,
        action: "deploy",
        target: "payment-service",
        version: "v1.42",
        riskLevel: decision.riskAssessment.level,
        patchDiff: MOCK_DIFF.patch,
        sandboxResults: "2/2 tests passed (exit code 0)",
        testOutput: "test_valid_payment ... ok\ntest_null_payment_method ... ok",
        policyRule: decision.matchedRule ?? "production-deploy-approval",
        policyReason: decision.reason,
      };
      this.addAudit("APPROVAL_REQUESTED", { approvalId: this.state.approvalPending.id, risk: decision.riskAssessment.level });
      this.emit("update", this.getState());

      // Wait for human decision
      const approved = await new Promise<boolean>((resolve) => {
        this.approvalResolver = resolve;
      });

      if (!approved) {
        this.state.steps[5].status = "error";
        this.state.steps[5].data = { decision: "DENIED by operator. Deployment aborted." };
        this.state.status = "failed";
        this.state.approvalPending = null;
        this.addAudit("APPROVAL_DENIED", { reason: "Operator denied live deployment" });
        this.emit("update", this.getState());
        return;
      }

      this.state.steps[5].data = { decision: "APPROVED by on-call SRE" };
      this.state.approvalPending = null;
      this.addAudit("APPROVAL_GRANTED", { approver: "sre-oncall@company.internal" });
      this.completeStep("approval");

      // STEP 7: DEPLOY
      this.state.status = "running";
      await this.advanceStep("deploy");
      this.addAudit("DEPLOYMENT_STARTED", { service: "payment-service", targetVersion: "v1.42" });
      await this.delay(1200);
      this.state.steps[6].data = { success: true, version: "v1.42", previousVersion: "v1.41", message: "Successfully deployed payment-service to v1.42", replicas: "3/3 ready" };
      this.addAudit("DEPLOYMENT_COMPLETED", { success: true, version: "v1.42" });
      this.completeStep("deploy");

      // STEP 8: VERIFIED
      await this.advanceStep("verified");
      await this.delay(900);
      this.state.health = { ...MOCK_HEALTH_HEALTHY };
      this.state.alerts = [{ ...MOCK_ALERTS_ACTIVE[0], resolved: true, message: "RESOLVED: Error rate returned to normal (0.1%)" }];
      this.state.steps[7].data = { status: "healthy", errorRate: "0.1%", latencyMs: "145ms", replicas: "3/3", resolution: "Incident resolved. Service fully recovered." };
      this.addAudit("INCIDENT_RESOLVED", { service: "payment-service", version: "v1.42", resolution: "Rolled forward with fix" });
      this.completeStep("verified");

      this.state.status = "completed";
      this.emit("update", this.getState());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.state.status = this.killSwitch.state === "STOPPED" ? "killed" : "failed";
      this.addAudit("WORKFLOW_HALTED", { reason: msg });
      this.emit("update", this.getState());
    }
  }
}