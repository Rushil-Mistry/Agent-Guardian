// ═══════════════════════════════════════════════════════════
// Agent Guardian — Intuitive Incident Manager Frontend
// Dual Mode: Simple English vs Developer Tech Mode
// Full Multi-Run, Recovery, and Re-Arm Support
// ═══════════════════════════════════════════════════════════

const API = "";
let ws = null;
let currentState = null;
let isDevMode = false; // Default to Simple English

// ─── DOM References ─────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const elStorylineText = $("#storyline-text");
const elStatusHeroIcon = $("#status-hero-icon");
const elHeroStatusTitle = $("#hero-status-title");
const elHeroStatusDesc = $("#hero-status-desc");
const elStatusRing = $("#status-ring");
const elHErrorRate = $("#h-error-rate");
const elHErrorSub = $("#h-error-sub");
const elHLatency = $("#h-latency");
const elReliabilityPct = $("#reliability-pct");
const elImpactBarFill = $("#impact-bar-fill");
const elAlertsList = $("#alerts-list");

const elStepper = $("#stepper");
const elWorkflowStatusPill = $("#workflow-status-pill");
const elApprovalOverlay = $("#approval-overlay");
const elBtnApprove = $("#btn-approve");
const elBtnReject = $("#btn-reject");
const elBtnSimulate = $("#btn-simulate");
const elBtnKill = $("#btn-killswitch");
const elBottomPhase = $("#bottom-phase");
const elToggleTech = $("#toggle-tech-mode");

const elEvidenceFeed = $("#evidence-feed");
const elAuditFeed = $("#audit-feed");

// ─── Mode Dictionaries ──────────────────────────────────────
const PLAIN_STEPS = {
  observe: {
    title: "1. Detecting the Problem",
    icon: "🔍",
    summary: "The AI monitors your checkout system 24/7. It noticed customer payment failures jumping from 0% to 13.4%.",
  },
  investigate: {
    title: "2. Finding the Clues",
    icon: "🔎",
    summary: "The AI safely read error records and recent code updates. It discovered that mobile shoppers who didn’t pick a payment method triggered an unhandled crash.",
  },
  "root-cause": {
    title: "3. Identifying What Broke",
    icon: "💡",
    summary: "Root Cause Confirmed: A recent update (v1.41) accidentally deleted the check that handles blank payment fields from mobile checkouts.",
  },
  sandbox: {
    title: "4. Testing Fix in Private Sandbox",
    icon: "🧪",
    summary: "The AI wrote a fix and tested it in a private digital simulation room. Zero real customers or live systems were touched. All 2 tests passed.",
  },
  policy: {
    title: "5. Safety Policy Evaluation",
    icon: "⚖️",
    summary: "Safety Guard Active: Our strict policy blocks AI from modifying live systems without human authorization. The AI halts and requests sign-off.",
  },
  approval: {
    title: "6. Waiting for Human Approval",
    icon: "👤",
    summary: "The AI pauses completely. A human manager must review the fix and click Approve before any changes are made to the live store.",
  },
  deploy: {
    title: "7. Applying the Fix (v1.42)",
    icon: "🚀",
    summary: "With human approval granted, the fix was applied to the live checkout system.",
  },
  verified: {
    title: "8. Recovery Verified",
    icon: "✅",
    summary: "Post-deployment checks confirmed: Payment failure rate dropped back to 0.1%. All customers are checking out normally!",
  },
};

const DEV_STEPS = {
  observe: {
    title: "1. OBSERVE (monitoring-mcp)",
    icon: "📊",
    summary: "Invoked get_service_health & get_recent_alerts on port 3001. ErrorRate: 13.4% > threshold 5%. Health: DEGRADED.",
  },
  investigate: {
    title: "2. INVESTIGATE (logs, db, git-mcp)",
    icon: "🔎",
    summary: "Logs: AttributeError: 'NoneType' object has no attribute 'lower'. DB: Found 3 rows WHERE payment_method IS NULL. Git: SHA a7f39b1e diff.",
  },
  "root-cause": {
    title: "3. ROOT CAUSE (Static Analysis)",
    icon: "💡",
    summary: "Commit a7f39b1e deleted null check in main.py. payload['payment_method'].lower() throws on None.",
  },
  sandbox: {
    title: "4. SANDBOX EXECUTION (Isolated Runner)",
    icon: "🧪",
    summary: "Secret scan: 0 leaks (assertNoSecretsInSandbox). Executed python test_remediation.py -> 2/2 tests passed (exit 0).",
  },
  policy: {
    title: "5. POLICY ENGINE (YAML Rule Evaluator)",
    icon: "⚖️",
    summary: "evaluate(action: deploy, env: production) -> Matched rule 'production-deploy-approval' in default.yaml. requiresApproval: true.",
  },
  approval: {
    title: "6. HUMAN-IN-THE-LOOP (Approval Gate)",
    icon: "👤",
    summary: "KillSwitch State: WAITING_APPROVAL. Approval ID registered. Execution halted awaiting operator response.",
  },
  deploy: {
    title: "7. DEPLOYMENT MCP (deployment-mcp)",
    icon: "🚀",
    summary: "POST /mcp deploy(payment-service, v1.42). Rolling update triggered. 3/3 replicas ready.",
  },
  verified: {
    title: "8. POST-DEPLOY VERIFY (Telemetry)",
    icon: "✅",
    summary: "Error rate dropped to 0.1%. Latency: 145ms. Replicas: 3/3. Status: HEALTHY. Incident closed.",
  },
};

// ─── WebSocket Connection ───────────────────────────────────
function connectWS() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}/ws`);

  ws.onopen = () => console.log("[WS] Connected to Agent Guardian backend");
  ws.onclose = () => { setTimeout(connectWS, 2000); };
  ws.onerror = (err) => console.error("[WS] Error:", err);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "init" || msg.type === "update") {
      currentState = msg.data;
      render(currentState);
    }
  };
}

// ─── Render Pipeline ────────────────────────────────────────
function render(state) {
  if (!state) return;
  renderHeaderAndHero(state);
  renderStepper(state);
  renderApproval(state);
  renderEvidence(state);
  renderAudit(state);
  renderBottomBar(state);
  renderKillSwitchButton(state);
}

function renderKillSwitchButton(state) {
  const isStopped = state.killSwitchState === "STOPPED" || state.status === "killed";
  if (isStopped) {
    elBtnKill.innerHTML = '<span class="kill-icon">🟢</span> RESET / RE-ARM AI';
    elBtnKill.className = "btn-kill rearmed";
    elBtnKill.title = "Click to unfreeze and re-arm the AI agent for new actions";
  } else {
    elBtnKill.innerHTML = '<span class="kill-icon">⛔</span> EMERGENCY STOP';
    elBtnKill.className = "btn-kill";
    elBtnKill.title = "Instantly stops the AI agent from taking any further actions";
  }
}

function renderHeaderAndHero(state) {
  const step = state.steps && state.currentStepIndex >= 0 ? state.steps[state.currentStepIndex] : null;
  const dict = isDevMode ? DEV_STEPS : PLAIN_STEPS;

  // Storyline Pill
  if (state.status === "idle") {
    elStorylineText.textContent = isDevMode
      ? "DEV MODE: Telemetry Normal | MCP Servers Active (:3001-:3005) | KillSwitch: RUNNING"
      : "System Normal — Monitoring Checkout & Payments 24/7";
    elWorkflowStatusPill.textContent = isDevMode ? "READY (IDLE)" : "System Ready";
    elWorkflowStatusPill.className = "workflow-badge idle";
  } else if (state.status === "running" && step) {
    const info = dict[step.id];
    elStorylineText.textContent = isDevMode ? `[DEV] Executing: ${info?.title || step.name}` : `AI in Action: ${info?.title || step.name}`;
    elWorkflowStatusPill.textContent = isDevMode ? "RUNNING" : "AI Active";
    elWorkflowStatusPill.className = "workflow-badge running";
  } else if (state.status === "waiting_approval") {
    elStorylineText.textContent = isDevMode
      ? "PAUSED [WAITING_APPROVAL]: PolicyEngine blocked deploy -> Awaiting operator token"
      : "⏸️ Human Approval Required — AI is Paused";
    elWorkflowStatusPill.textContent = isDevMode ? "APPROVAL PENDING" : "Awaiting Approval";
    elWorkflowStatusPill.className = "workflow-badge waiting_approval";
  } else if (state.status === "completed") {
    elStorylineText.textContent = isDevMode
      ? "RESOLVED: Deployment v1.42 verified | ErrorRate: 0.1% | AuditLog Synced"
      : "✅ Incident Resolved — Checkout Restored to 100% Health";
    elWorkflowStatusPill.textContent = isDevMode ? "RESOLVED (200 OK)" : "Resolved";
    elWorkflowStatusPill.className = "workflow-badge completed";
  } else if (state.status === "failed") {
    elStorylineText.textContent = isDevMode
      ? "DEPLOYMENT ABORTED: Operator rejected change | Production unchanged"
      : "🚫 Deployment Cancelled: Operator chose not to apply the fix.";
    elWorkflowStatusPill.textContent = isDevMode ? "ABORTED" : "Deployment Denied";
    elWorkflowStatusPill.className = "workflow-badge failed";
  } else if (state.status === "killed") {
    elStorylineText.textContent = isDevMode
      ? "EMERGENCY STOPPED: KillSwitch.stop() triggered | All actions blocked"
      : "⛔ AI Agent Stopped by Human Operator (Emergency Stop Active)";
    elWorkflowStatusPill.textContent = isDevMode ? "KILLED" : "Emergency Stopped";
    elWorkflowStatusPill.className = "workflow-badge killed";
  }

  // Left Hero Card
  if (state.health) {
    const isDegraded = state.health.status === "degraded";
    if (isDegraded) {
      elStatusHeroIcon.textContent = "🚨";
      elStatusRing.className = "status-indicator-ring degraded";
      elHeroStatusTitle.textContent = isDevMode ? "CRITICAL: Service Degraded (v1.41)" : "Checkout Outage Detected!";
      elHeroStatusDesc.textContent = isDevMode
        ? "payment-service error rate: 13.4% (threshold: 5.0%), latency: 820ms, replicas: 2/3"
        : "13.4% of customer payments are failing due to a mobile crash bug.";
      elHErrorRate.textContent = state.health.errorRate + "%";
      elHErrorRate.className = "metric-val highlight danger";
      elHErrorSub.textContent = isDevMode ? "prometheus alert" : "⚠️ Critical Spike";
      elHLatency.textContent = state.health.latencyMs + "ms";
      elReliabilityPct.textContent = isDevMode ? "86.6% Availability" : "86.6% (13.4% Failing)";
      elImpactBarFill.className = "impact-progress-fill degraded";
    } else {
      elStatusHeroIcon.textContent = "✅";
      elStatusRing.className = "status-indicator-ring healthy";
      elHeroStatusTitle.textContent = isDevMode ? "HEALTHY: payment-service (v1.42)" : "All Systems Normal";
      elHeroStatusDesc.textContent = isDevMode
        ? "Telemetry baseline normal: errorRate 0.1%, latency 145ms, replicas: 3/3"
        : "Customers are checking out smoothly with zero errors.";
      elHErrorRate.textContent = state.health.errorRate + "%";
      elHErrorRate.className = "metric-val highlight";
      elHErrorSub.textContent = isDevMode ? "target < 1%" : "Target: < 1%";
      elHLatency.textContent = state.health.latencyMs + "ms";
      elReliabilityPct.textContent = isDevMode ? "99.9% SLO Met" : "99.9% Operational";
      elImpactBarFill.className = "impact-progress-fill healthy";
    }
  }

  // Alerts
  if (state.alerts && state.alerts.length > 0) {
    elAlertsList.innerHTML = state.alerts.map((a) => {
      const isResolved = a.resolved;
      return `
        <div class="alert-card ${a.severity} ${isResolved ? "resolved" : ""}">
          <div class="alert-header">
            <span class="alert-title">${isResolved ? "✅ RESOLVED" : "🚨 " + a.severity.toUpperCase()}</span>
          </div>
          <div class="alert-body">${a.message}</div>
        </div>
      `;
    }).join("");
  }
}

function renderStepper(state) {
  if (!state.steps) return;
  const dict = isDevMode ? DEV_STEPS : PLAIN_STEPS;

  elStepper.innerHTML = state.steps.map((step, i) => {
    const isLast = i === state.steps.length - 1;
    const info = dict[step.id] || { title: step.name, summary: step.description };

    let statusPill = "";
    if (step.status === "active") statusPill = `<span class="step-pill running">${isDevMode ? "RUNNING" : "In Progress"}</span>`;
    if (step.status === "waiting") statusPill = `<span class="step-pill waiting">${isDevMode ? "APPROVAL GATED" : "Waiting on You"}</span>`;
    if (step.status === "done") statusPill = `<span class="step-pill done">${isDevMode ? "PASSED" : "Completed"}</span>`;
    if (step.status === "error") statusPill = `<span class="step-pill failed">${isDevMode ? "DENIED / STOPPED" : "Cancelled"}</span>`;

    // Content box
    let contentBox = "";
    if (step.status === "active" || step.status === "done" || step.status === "error") {
      if (step.id === "approval" && step.status === "error") {
        contentBox = `<div class="step-story-box danger">🚫 <strong>Operator Decision:</strong> Deployment was denied. The live checkout was not modified. You can click <em>Restart Incident Simulation</em> to run again.</div>`;
      } else if (isDevMode && step.data) {
        contentBox = `<div class="step-data-dev mono">${formatDevStepData(step)}</div>`;
      } else {
        contentBox = `<div class="step-story-box">${info.summary}</div>`;
      }
    }

    return `
      <div class="step-card ${step.status}">
        <div class="step-rail">
          <div class="step-icon-bubble">${step.status === "done" ? "✓" : step.status === "error" ? "✕" : info.icon}</div>
          ${!isLast ? '<div class="step-track"></div>' : ""}
        </div>
        <div class="step-main">
          <div class="step-title-row">
            <span class="step-title">${info.title}</span>
            ${statusPill}
          </div>
          ${contentBox}
        </div>
      </div>
    `;
  }).join("");
}

function formatDevStepData(step) {
  const d = step.data;
  if (!d) return "";
  switch (step.id) {
    case "observe":
      return `GET /monitoring/health -> status=${d.status}, errorRate=${d.errorRate}%, latency=${d.latencyMs}ms, replicas=${d.replicas}`;
    case "investigate": {
      let out = "";
      if (d.recentErrors) out += "GET /logs/errors -> " + d.recentErrors.map((e) => `[${e.traceId}] ${e.message}`).join("\n");
      if (d.dbResult) out += `\nSQL: "${d.dbQuery}" -> rowCount: ${d.dbResult.rowCount}`;
      if (d.commits) out += "\nGIT: " + d.commits.map((c) => `[${c.sha}] ${c.message}`).join("\n");
      return escapeHtml(out);
    }
    case "root-cause":
      return `AST Diff Analysis:\nCommit: ${d.bugCommit} (${d.bugAuthor})\nAffected: ${d.affectedFile}\nRegression: Removed None check on payment_method.`;
    case "sandbox":
      return `Sandbox Runner: ${d.phase}\nSecret Guard: PASSED (assertNoSecretsInSandbox)\n` + (d.testOutput || "Running isolated tests...");
    case "policy":
      return `PolicyEngine.evaluate(): allowed=${d.allowed}, risk=${String(d.riskLevel).toUpperCase()}, rule="${d.matchedRule}"\nRequiresApproval: ${d.requiresApproval}`;
    case "approval":
      return `Operator Decision: ${d.decision}`;
    case "deploy":
      return `POST /deployment/deploy -> version: ${d.version} (previous: ${d.previousVersion})\nReplicas: ${d.replicas} -> SUCCESS`;
    case "verified":
      return `Verification: status=${d.status}, errorRate=${d.errorRate}, latency=${d.latencyMs}\n${d.resolution}`;
    default:
      return JSON.stringify(d, null, 2);
  }
}

function renderApproval(state) {
  if (state.approvalPending) {
    elApprovalOverlay.classList.remove("hidden");
    const ap = state.approvalPending;

    // Render diff with syntax coloring
    const diffLines = ap.patchDiff.split("\n").map((line) => {
      if (line.startsWith("+")) return `<span class="diff-add">${escapeHtml(line)}</span>`;
      if (line.startsWith("-")) return `<span class="diff-del">${escapeHtml(line)}</span>`;
      return escapeHtml(line);
    }).join("\n");
    $("#approval-diff").innerHTML = diffLines;

    // Expand accordion automatically in Dev mode
    const diffAcc = $("#diff-accordion");
    if (diffAcc) diffAcc.open = isDevMode;
  } else {
    elApprovalOverlay.classList.add("hidden");
  }
}

function renderEvidence(state) {
  if (!state.steps) return;
  const items = [];
  const dict = isDevMode ? DEV_STEPS : PLAIN_STEPS;

  for (const step of state.steps) {
    if (!step.data || step.status === "pending") continue;
    const info = dict[step.id];

    let detail = "";
    if (isDevMode) {
      detail = formatDevStepData(step);
    } else {
      if (step.id === "observe") detail = `Customer Impact: 13.4% of payment requests failed with 500 error code.`;
      else if (step.id === "investigate") detail = `Database search found 3 failed orders with missing payment method. Git inspection located regression in commit a7f39b1e.`;
      else if (step.id === "root-cause") detail = `Bug confirmed: The application attempted to lowercase a null payment_method string on mobile requests.`;
      else if (step.id === "sandbox") detail = `Private test suite executed 2 tests in 0.003s. Zero secrets leaked. 100% pass rate.`;
      else if (step.id === "policy") detail = `Evaluated against default.yaml safety rules: Production changes require human sign-off.`;
      else if (step.id === "approval" && step.status === "error") detail = `Operator DENIED deployment. Safe fallback: zero changes made.`;
      else if (step.id === "deploy") detail = `Version v1.42 deployed successfully to production.`;
      else if (step.id === "verified") detail = `All payment instances healthy. Failure rate back down to 0.1%.`;
    }

    items.push({
      title: `${info?.icon || step.icon} ${info?.title || step.name}`,
      body: detail || JSON.stringify(step.data),
    });
  }

  if (items.length === 0) {
    elEvidenceFeed.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🔍</span>
        <span>${isDevMode ? "MCP evidence buffer empty. Awaiting agent tool calls." : "When an incident occurs, the AI will document every piece of evidence it finds here."}</span>
      </div>
    `;
    return;
  }

  elEvidenceFeed.innerHTML = items.map((item) => `
    <div class="story-card">
      <div class="story-card-title">${item.title}</div>
      <div class="story-card-body ${isDevMode ? "mono" : ""}">${item.body}</div>
    </div>
  `).join("");
}

function renderAudit(state) {
  if (!state.auditEvents || state.auditEvents.length === 0) {
    elAuditFeed.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📜</span>
        <span>${isDevMode ? "Audit log stream active. 0 events recorded." : "Security audit logs will record every AI query and safety evaluation."}</span>
      </div>
    `;
    return;
  }

  elAuditFeed.innerHTML = state.auditEvents.slice().reverse().map((ev) => {
    const time = new Date(ev.timestamp).toLocaleTimeString();
    const detail = Object.entries(ev.payload).map(([k, v]) => `${k}: ${v}`).join(", ");
    return `
      <div class="audit-row">
        <div style="display:flex; justify-content:space-between;">
          <span class="audit-badge">${ev.type}</span>
          <span style="color:var(--text-muted); font-size:0.9em;">${time}</span>
        </div>
        <div class="audit-text mono">${escapeHtml(detail)}</div>
      </div>
    `;
  }).join("");
}

function renderBottomBar(state) {
  const step = state.steps && state.currentStepIndex >= 0 ? state.steps[state.currentStepIndex] : null;
  const dict = isDevMode ? DEV_STEPS : PLAIN_STEPS;

  if (state.status === "idle") {
    elBottomPhase.textContent = isDevMode
      ? "DEV: Test harness idle | Ready to trigger incident simulation"
      : "Ready to demo — click the button to simulate an outage";
    elBtnSimulate.disabled = false;
    elBtnSimulate.innerHTML = '<span class="btn-icon">⚡</span> <span class="btn-text">Simulate Real Incident (Break Checkout & Watch AI Fix It)</span>';
  } else if (state.status === "running" && step) {
    const info = dict[step.id];
    elBottomPhase.textContent = isDevMode ? `RUNNING [${step.id}]: ${info?.summary}` : `Active: ${info?.title || step.name}`;
    elBtnSimulate.disabled = true;
    elBtnSimulate.innerHTML = '<span class="btn-icon">⏳</span> <span class="btn-text">AI is Investigating & Remedying...</span>';
  } else if (state.status === "waiting_approval") {
    elBottomPhase.textContent = isDevMode
      ? "WAITING_APPROVAL: PolicyEngine approval gate active. Operator input required."
      : "⏸️ Paused — waiting for your decision on the approval screen";
    elBtnSimulate.disabled = true;
  } else if (state.status === "completed") {
    elBottomPhase.textContent = isDevMode
      ? "COMPLETED (200 OK): SRE workflow finished. Production healthy."
      : "✅ Incident resolved successfully!";
    elBtnSimulate.disabled = false;
    elBtnSimulate.innerHTML = '<span class="btn-icon">🔄</span> <span class="btn-text">Run Simulation Again</span>';
  } else if (state.status === "failed") {
    elBottomPhase.textContent = isDevMode
      ? "ABORTED: Deployment cancelled by operator. Click below to restart."
      : "🚫 Deployment was cancelled. Click below to restart the simulation.";
    elBtnSimulate.disabled = false;
    elBtnSimulate.innerHTML = '<span class="btn-icon">🔄</span> <span class="btn-text">Restart Incident Simulation</span>';
  } else if (state.status === "killed") {
    elBottomPhase.textContent = isDevMode
      ? "KILLED: Emergency stop active. Click below or use Reset AI button above to restart."
      : "⛔ Emergency Stop Active. Click below to reset and simulate again.";
    elBtnSimulate.disabled = false;
    elBtnSimulate.innerHTML = '<span class="btn-icon">🟢</span> <span class="btn-text">Reset & Run Simulation Again</span>';
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ─── Button Handlers ────────────────────────────────────────
elBtnSimulate.addEventListener("click", async () => {
  elBtnSimulate.disabled = true;
  await fetch(API + "/api/incident/start", { method: "POST" });
});

elBtnApprove.addEventListener("click", async () => {
  await fetch(API + "/api/incident/approve", { method: "POST" });
});

elBtnReject.addEventListener("click", async () => {
  await fetch(API + "/api/incident/reject", { method: "POST" });
});

elBtnKill.addEventListener("click", async () => {
  const isStopped = currentState && (currentState.killSwitchState === "STOPPED" || currentState.status === "killed");
  if (isStopped) {
    // Re-arm / reset the system
    await fetch(API + "/api/killswitch/resume", { method: "POST" });
  } else {
    if (confirm("EMERGENCY STOP: Do you want to instantly freeze the AI agent?")) {
      await fetch(API + "/api/killswitch/stop", { method: "POST" });
    }
  }
});

// Tab Handlers
$$(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".tab-btn").forEach((b) => b.classList.remove("active"));
    $$(".tab-content").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    $(`#tab-${btn.dataset.tab}`).classList.add("active");
  });
});

// Mode Toggle (Simple English vs Developer)
if (elToggleTech) {
  elToggleTech.checked = false; // Start in Simple English by default
  isDevMode = false;

  elToggleTech.addEventListener("change", (e) => {
    isDevMode = e.target.checked;
    const labels = $$(".mode-toggle-wrap .toggle-label");
    if (labels.length >= 2) {
      labels[0].classList.toggle("active-label", !isDevMode);
      labels[1].classList.toggle("active-label", isDevMode);
    }
    if (currentState) {
      render(currentState);
    }
  });
}

// ─── Init ───────────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch(API + "/api/initial");
    const data = await res.json();
    if (data.health) {
      renderHeaderAndHero({ health: data.health, alerts: data.alerts, status: "idle", steps: [] });
    }
  } catch {}
  connectWS();
}

init();