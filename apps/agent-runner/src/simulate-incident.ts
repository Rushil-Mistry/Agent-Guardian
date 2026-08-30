import { TrueForgeAgentHarness } from "./harness.js";
import { AgentGuardianOrchestrator } from "./orchestrator.js";

async function main() {
  console.log("===============================================================");
  console.log("🚀 AGENT GUARDIAN — TRUEFORGE AUTONOMOUS SRE INCIDENT HARNESS");
  console.log("===============================================================");

  const harness = new TrueForgeAgentHarness({
    sessionId: `sess-${Date.now()}`,
    agentName: "agent-guardian-sre",
  });

  const orchestrator = new AgentGuardianOrchestrator(harness);

  // 1. Investigation Phase
  const plan = await orchestrator.investigate("payment-service");

  console.log("\n---------------------------------------------------------------");
  console.log("📋 SRE REMEDIATION PLAN GENERATED");
  console.log("---------------------------------------------------------------");
  console.log(`Service:        ${plan.service}`);
  console.log(`Root Cause:     ${plan.rootCause}`);
  console.log(`Proposed Fix:   ${plan.proposedAction.toUpperCase()} -> ${plan.targetVersion}`);
  console.log("---------------------------------------------------------------");

  // 2. Policy-Gated Remediation Phase with Human-in-the-Loop
  const result = await orchestrator.executeRemediation(plan, true);

  console.log("\n===============================================================");
  console.log(`🏁 INCIDENT RESOLUTION STATUS: ${result.success ? "RESOLVED ✅" : "FAILED ❌"}`);
  console.log(`Audit Events Emitted: ${harness.auditLog.size}`);
  console.log("===============================================================\n");
}

main().catch((err) => {
  console.error("Simulation error:", err);
  process.exit(1);
});
