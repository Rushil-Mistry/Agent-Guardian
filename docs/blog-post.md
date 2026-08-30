# Building Agent Guardian: Autonomous SRE Incident Response with TrueForge & Deterministic Safety

> *How we built an autonomous SRE incident-response agent using TrueForge harnesses, MCP microservices, and a fail-closed policy engine—and what we learned about securing AI agents in production.*

---

## 🚀 Introduction: The Promise and Peril of AI SREs

When an incident strikes production at 3:00 AM, every minute spent searching logs, inspecting git diffs, and triaging stack traces translates directly to customer impact and downtime costs. Autonomous AI agents promise to revolutionize incident response by investigating alerts and executing fixes at machine speed.

However, giving an LLM direct access to production infrastructure introduces significant operational risk. Hallucinations, unvetted commands, or overzealous remediation scripts could escalate a minor service slowdown into a major outage. 

To bridge this gap between **high-velocity automation** and **uncompromising operational safety**, we built **[Agent Guardian](https://github.com/Rushil-Mistry/Agent-Guardian)**—an autonomous SRE incident-response system built on top of **[TrueForge](https://github.truefoundry.com/trueforge)** and hardened with **Qodo Code Integrity**.

In this blog post, we'll walk through what we built, how TrueForge powers our harness and sandbox execution, and the key architectural lessons we learned while bringing deterministic safety to autonomous agents.

---

## 🛡️ What We Built: Agent Guardian

**Agent Guardian** is a production-grade SRE agent designed to investigate alerts, collect evidence, reproduce regressions inside isolated sandbox environments, evaluate action risks quantitatively, and enforce human operator sign-offs before performing high-risk operations.

## Core Architecture Overview

### Key System Components

1. **TrueForge Harness Runtime (`apps/agent-runner`)**: Manages the agent workflow lifecycle, orchestrates MCP tool calls, and handles execution in isolated sandboxes.
2. **Fail-Closed Policy Engine (`packages/policy-engine`)**: Evaluates structured YAML policies with zero silent "default-allow" behavior.
3. **7-Factor Risk Assessment Engine**: Quantifies operation risk into a 0–100 score using deterministic dimensions (Operation Type, Environment, Blast Radius, Reversibility, Data Sensitivity, Tool Sensitivity, Destructive Potential).
4. **Idempotent Kill Switch (`packages/kill-switch`)**: State machine (`RUNNING` ➔ `PAUSED` ➔ `WAITING_APPROVAL` ➔ `STOPPING` ➔ `STOPPED`) enabling on-call engineers to halt agent execution instantly.
5. **Secret-Safe Audit Trail (`packages/audit`)**: Active scanning for AWS keys, GitHub PATs, and API credentials to guarantee audit logs remain secret-safe.
6. **SQL Write Guard (`packages/mcp/database`)**: Lexical AST parser that blocks mutation queries (`UPDATE`, `DELETE`, `DROP`, `ALTER`) on diagnostic database connections.

---

## ⚡ How We Used TrueForge

TrueForge served as the core agent execution harness and sandboxing foundation for Agent Guardian. Here is how we leveraged its key capabilities:

### 1. Declarative Agent Harness Configuration (`trueforge.yaml`)

We configured the agent runtime declaratively in `trueforge.yaml`, defining model parameters, timeouts, MCP tool endpoints, sandbox specs, and human-in-the-loop policies:

```yaml
version: "1.0"
agent:
  name: "agent-guardian"
  version: "1.0.0"
  model:
    provider: "openai"
    name: "gpt-4o"
    temperature: 0.1

runtime:
  type: "harness"
  max_iterations: 15
  timeout_seconds: 600
  kill_switch:
    enabled: true
    state_file: ".agent-guardian-state.json"

sandbox:
  provider: "trueforge-sandbox"
  environment: "isolated-container"
  image: "python:3.11-slim"
  memory_limit: "512MB"
  cpu_limit: "1.0"
  network_access: false
  secret_scrubbing: true
  timeout_seconds: 30
```

### 2. Isolated Container Sandboxes for Diagnostic Repro Code

When investigating a production issue, an SRE agent often needs to generate and run diagnostic scripts to reproduce the bug. Executing arbitrary LLM-generated code directly on host servers is extremely dangerous.

With TrueForge, Agent Guardian runs repro tests inside isolated Python container sandboxes (`python:3.11-slim`). Network access is disabled, execution memory/CPU are strictly capped, and outputs are automatically sanitized for secrets.

```typescript
// Executing reproduction code safely inside TrueForge Sandbox
const sandboxCode = `
import sys
def test_payment_handler():
    payload = {"amount": 100, "currency": "USD", "payment_method": None}
    try:
        payload["payment_method"].lower() # Repro v1.41 bug
        return False
    except AttributeError:
        return True # Repro confirmed

assert test_payment_handler() == True
print("CONFIRMED_REGRESSION: payment_method null dereference in v1.41")
`;

const sandboxResult = await this.harness.executeInSandbox(sandboxCode);
// Clean exit with verified reproduction proof without touching production!
```

### 3. Policy-Gated MCP Tool Server Suite

TrueForge orchestrates communication with five specialized Model Context Protocol (MCP) microservices:
* **Monitoring MCP** (`Port 3001`): Fetches health status, latencies, and alert logs.
* **Logs MCP** (`Port 3002`): Queries application stack traces and trace IDs.
* **GitHub MCP** (`Port 3003`): Inspects recent commits, diffs, and branch patches.
* **Database MCP** (`Port 3004`): Provides schema inspection gated by `SQL_READ_ONLY_GUARD`.
* **Deployment MCP** (`Port 3005`): Handles version deployments and rollbacks, wrapped by TrueForge policy interception.

---

## 🔍 Incident Simulation: End-to-End Walkthrough

To validate Agent Guardian under realistic operational conditions, we built a sample FastAPI microservice (`apps/demo-service`) and simulated a high-severity production regression:

1. **Incident Trigger**: Version `v1.41` of `payment-service` is deployed, introducing an unhandled null dereference when `payment_method` is missing. Error rates spike to 35%.
2. **Phase 1: Autonomous Investigation**:
   - Agent Guardian queries Monitoring MCP (`port 3001`) and flags the elevated error rate.
   - Logs MCP (`port 3002`) pinpoints `AttributeError: 'NoneType' object has no attribute 'lower'`.
   - GitHub MCP (`port 3003`) identifies commit `8f2a1d` in `v1.41` as the culprit.
3. **Phase 2: TrueForge Sandbox Verification**:
   - The agent writes a targeted reproduction script and executes it inside a TrueForge sandbox container.
   - Reproduction is confirmed in 214ms with exit code `0`.
4. **Phase 3: Quantitative Risk Assessment**:
   - The proposed remediation (`rollback` to `v1.40` in `production`) is evaluated against the 7-Factor Risk Engine:
     - **Operation**: `deploy` (75)
     - **Environment**: `production` (90)
     - **Blast Radius**: High (70)
     - **Final Risk Score**: **78.5 / 100** (Risk Level: `HIGH`)
5. **Phase 4: Policy Gate & Human Approval**:
   - TrueForge harness pauses execution state to `WAITING_APPROVAL`.
   - An on-call SRE reviews the evidence payload, root cause analysis, and sandbox repro results, then issues approval via the TrueForge harness API.
6. **Phase 5: Automated Rollback**:
   - Deployment MCP executes rollback to `v1.40`. Error rates return to 0%, and audit logs record the full lifecycle.

---

## 💡 What We Learned Along the Way

Building Agent Guardian revealed critical lessons about developing autonomous systems for high-stakes operational environments:

### 1. LLMs Should Reason; Deterministic Systems Must Govern
LLMs excel at synthesizing unstructured evidence—parsing log traces, correlating commit diffs, and hypothesizing root causes. However, **never let an LLM grade its own safety or decide if an action requires approval**. 

By delegating risk assessment and policy decisions to a deterministic TypeScript policy engine, we eliminated non-deterministic bypasses and guaranteed consistent policy enforcement.

### 2. "Fail-Closed" is Non-Negotiable
If a policy rule definition is missing, a rule file fails to parse, or an unknown environment parameter is supplied, the policy engine must **fail-closed** (`allowed: false`, `score: 100`). In production SRE automation, a false denial is a minor inconvenience; a false approval can result in a catastrophic outage.

### 3. Sandboxes are Essential for AI SRE Credibility
SREs are naturally skeptical of automated fixes. Providing an isolated TrueForge sandbox execution step—where the agent proves the regression with an executable test *before* proposing a fix—radically increases human operator confidence during approval reviews.

### 4. Defense-in-Depth Beats Single Safety Layers
Single guards can fail. Agent Guardian employs four distinct safety boundaries:
* **Lexical AST Guards** on DB connections (`SQL_READ_ONLY_GUARD`).
* **Active Secret Scanners** on audit streams (`SecretGuard`).
* **Quantitative Policy Engines** on action dispatchers.
* **State-Machine Kill Switches** on runtime harnesses.

Together, these layers ensure that even if one component fails, downstream safety remains intact.

---

## 🏁 Conclusion

Autonomous SRE agents have the potential to reduce Mean Time to Resolution (MTTR) from hours to seconds. But speed without control is a liability. By pairing **TrueForge's harness and containerized sandboxes** with **deterministic fail-closed governance**, Agent Guardian demonstrates how SRE teams can safely harness AI automation in production.

Check out the repository, inspect our 68 Vitest test suites, or run the incident simulation yourself:

👉 **[GitHub: Rushil-Mistry/Agent-Guardian](https://github.com/Rushil-Mistry/Agent-Guardian)**

---

*Built with ❤️ using TrueForge, Qodo, TypeScript, and FastAPI.*
