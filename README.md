# 🛡️ Agent Guardian

> **Autonomous SRE Incident-Response Agent built on [TrueForge](https://github.com/truefoundry/trueforge) with [Qodo](https://www.qodo.ai/) Code Integrity.**

Agent Guardian investigates production incidents, gathers evidence through the **Model Context Protocol (MCP)**, reproduces regressions inside **TrueForge sandboxes**, enforces **deterministic safety policies**, and requires **human approval** before executing consequential production actions.

---

## 🌟 Architecture Overview

![Agent Guardian Architecture](docs/images/architecture.jpg)

---

## 🚀 Key Features

### 1. TrueForge Agent Harness Runtime
* **Agent Orchestration**: Built on top of the TrueForge harness pattern (`trueforge.yaml`) to coordinate multi-step autonomous incident investigation and remediation.
* **Isolated Sandbox Execution**: Runs diagnostic scripts inside TrueForge secure sandbox containers with strict secret scrubbing (`assertNoSecretsInSandbox`) and timeout controls.
* **Human-in-the-Loop (HITL) Gate**: Halts execution when high-risk operations are requested, requiring cryptographic or explicit operator sign-off.

### 2. Qodo Code Quality & Integrity
* **Automated PR Reviews**: Enforces code standards and safety invariants via Qodo Merge (`.pr_agent.toml`).
* **Deterministic Verification**: Continuous validation across 68+ unit tests with Vitest ensuring 100% policy branch coverage.
* **Safety Invariant Enforcement**: Ensures zero dependencies in domain types, secret scrubbing in audit trails, and kill switch idempotency.

### 3. Deterministic Safety & Governance
* **Fail-Closed Policy Engine**: Every action is evaluated against YAML rules (`policies/default.yaml`). If evaluation fails or no rule matches, the action is automatically blocked (`allowed: false`).
* **Risk Engine**: Classifies operations based on tool sensitivity, environment, reversibility, and blast radius without relying on non-deterministic LLM hallucinations.
* **Idempotent Kill Switch**: State machine (`RUNNING` → `PAUSED` → `WAITING_APPROVAL` → `STOPPING` → `STOPPED`) capable of halting the agent instantly and idempotently.
* **Append-Only Audit Log**: Records all lifecycle events (`SESSION_CREATED`, `POLICY_EVALUATED`, `APPROVAL_REQUESTED`, `DEPLOYMENT_COMPLETED`, etc.) with automated secret redaction.

### 4. Modular MCP Server Suite
* **Monitoring MCP** (`port 3001`): Inspects health, error rates, latencies, and active alerts.
* **Logs MCP** (`port 3002`): Searches application logs and retrieves stack traces by trace ID.
* **GitHub MCP** (`port 3003`): Inspects commit histories, diffs, and creates isolated hotfix patches.
* **Database MCP** (`port 3004`): Gated by `SQL_READ_ONLY_GUARD` (permits only `SELECT`, `EXPLAIN`, `WITH`).
* **Deployment MCP** (`port 3005`): Policy-gated service deployment, rollback, and restart.

---

## 📂 Repository Structure

```
agent-guardian/
├── trueforge.yaml                  # TrueForge Agent Harness Configuration
├── .pr_agent.toml                  # Qodo Merge Code Review & Quality Config
├── .qodo/                          # Qodo Repository Guidelines
│   └── guidelines.md
├── .github/workflows/              # CI/CD & Qodo Review Workflows
│   └── qodo-review.yml
├── apps/
│   ├── agent-runner/               # TrueForge Autonomous SRE Agent Runner
│   │   └── src/
│   │       ├── harness.ts          # TrueForge Harness & Safety Interceptor
│   │       ├── orchestrator.ts     # SRE Investigation & Remediation Loop
│   │       └── simulate-incident.ts# End-to-End Simulation Runner
│   └── demo-service/               # FastAPI Payment Demo Service (v1.40, v1.41, v1.42)
└── packages/
    ├── domain/                     # Pure domain types & guards (Zero dependencies)
    ├── policy-engine/              # Deterministic YAML policy & risk engine
    ├── audit/                      # Append-only audit logger with secret guard
    ├── kill-switch/                # Idempotent kill-switch state machine
    ├── shared/                     # Shared provider interfaces & sandbox types
    └── mcp/                        # MCP Tool microservices
        ├── monitoring/             # Monitoring MCP Server (Port 3001)
        ├── logs/                   # Logs MCP Server (Port 3002)
        ├── github/                 # GitHub MCP Server (Port 3003)
        ├── database/               # Database MCP Server (Port 3004)
        └── deployment/             # Deployment MCP Server (Port 3005)
```

---

## ⚡ Quickstart

### Prerequisites
* **Node.js**: `v20+`
* **pnpm**: `v9+`
* **Python**: `3.10+` (optional, for demo FastAPI service)

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/Rushil-Mistry/Agent-Guardian.git
cd Agent-Guardian

# Install monorepo dependencies
pnpm install

# Build all TypeScript packages
pnpm build
```

### 2. Run Unit Tests (Qodo Quality Verification)
```bash
pnpm test
```
*Executes all 68 unit tests across safety domain, policy engine, audit log, and kill switch.*

### 3. Run TrueForge Autonomous SRE Simulation
```bash
pnpm simulate
```

---

## 🎬 End-to-End Incident Lifecycle Walkthrough

When you execute `pnpm simulate`, the TrueForge agent harness runs the complete incident cycle:

```
===============================================================
🚀 AGENT GUARDIAN — TRUEFORGE AUTONOMOUS SRE INCIDENT HARNESS
===============================================================

🔍 [TrueForge Agent] Investigating service: payment-service...
  📊 Monitoring Status: DEGRADED (Error Rate: 13.4%, Latency: 820ms)
  🚨 Active Alert: High error rate detected on payment-service: 13.4% (threshold: 5%)
  📜 Recent Error: 500 Internal Server Error: AttributeError in process_payment_v141
  🌿 Git Commit: [a7f39b1] "perf(payments): refactor payment processor pipeline to v1.41"
  🔍 Diff Analysis: apps/demo-service/main.py modified (4 deletions)
  🗄️ Database: Schema inspected (1 tables found)

🧪 [TrueForge Sandbox] Running repro test in isolated sandbox container...
  ✅ Sandbox Verification Complete (Exit: 0, Duration: 0ms)

---------------------------------------------------------------
📋 SRE REMEDIATION PLAN GENERATED
---------------------------------------------------------------
Service:        payment-service
Root Cause:     Null pointer exception in v1.41 when payment_method is None (commit a7f39b1)
Proposed Fix:   ROLLBACK -> v1.40
---------------------------------------------------------------

🛡️ [Policy Gate] Evaluating proposed remediation: rollback to v1.40...
  ⚖️ Policy Decision: allowed=true, risk=HIGH, requiresApproval=true
  📋 Matched Rule: "production-deploy-approval" (Production deploy, rollback, and restart require human approval)

⏸️ [Human-in-the-Loop] Execution paused. State: WAITING_APPROVAL
  ✋ Approval requested: appr-b756d1c9-c85a-42fa-99a8-c93829750aa4 (Risk: high)
  👤 Human Operator (on-call SRE): Reviewing rollback plan... APPROVED.

🚀 [Deployment] Executing authorized rollback to v1.40...
  🎉 Deployment Successful: Successfully rolled back payment-service to stable version v1.40
  🟢 Incident Resolved! Error rate returning to baseline (0.0%).

===============================================================
🏁 INCIDENT RESOLUTION STATUS: RESOLVED ✅
Audit Events Emitted: 18
===============================================================
```

---

## 🛠️ MCP Microservice Ports

To run MCP tool servers individually:

| MCP Server | Port | Endpoint | Description | Command |
|---|---|---|---|---|
| **Monitoring** | `3001` | `/mcp` | Health, latency, error rates | `pnpm dev:monitoring` |
| **Logs** | `3002` | `/mcp` | Log search & error traces | `pnpm dev:logs` |
| **GitHub** | `3003` | `/mcp` | Commits, diffs, patches | `pnpm dev:github` |
| **Database** | `3004` | `/mcp` | Schema & read-only SQL | `pnpm dev:database` |
| **Deployment** | `3005` | `/mcp` | Policy-gated rollbacks & deploys | `pnpm dev:deployment` |

To start all MCP servers concurrently:
```bash
pnpm dev:all-mcp
```

---

## 🏆 Hackathon Submission Details

* **Hackathon**: The Agent Harness Hackathon (August 2026)
* **Organizers**: WeMakeDevs × TrueFoundry × Qodo
* **Tracks**:
  - **Main Track**: Autonomous Agent with TrueForge Agent Harness & MCP
  - **Sponsor Track**: Best Code Quality with Qodo (formerly CodiumAI)
* **License**: ISC
