import type {
  DeploymentProvider,
  DeploymentStatus,
  DeploymentResult,
} from "@agent-guardian/shared";

// ─── Fake Deployment Provider ─────────────────────────────────────────────────
// Simulates deployment operations with version tracking.
// The provider itself does NOT enforce policy — that's the MCP server's job
// via PolicyEngine.evaluate().

export class FakeDeploymentProvider implements DeploymentProvider {
  private currentVersion = "v1.41";
  private previousVersion = "v1.40";
  private status: DeploymentStatus["status"] = "running";

  async getDeploymentStatus(service: string): Promise<DeploymentStatus> {
    return {
      service,
      version: this.currentVersion,
      status: this.status,
      replicas: { ready: 2, total: 3 },
      lastDeployed: new Date("2024-01-15T10:30:00Z"),
    };
  }

  async deploy(service: string, version: string): Promise<DeploymentResult> {
    this.previousVersion = this.currentVersion;
    this.currentVersion = version;
    this.status = "running";

    return {
      success: true,
      version,
      message: `Successfully deployed ${service} to ${version} (previous: ${this.previousVersion})`,
    };
  }

  async rollback(
    service: string,
    toVersion: string,
  ): Promise<DeploymentResult> {
    const rolledFrom = this.currentVersion;
    this.currentVersion = toVersion;
    this.status = "rolled_back";

    return {
      success: true,
      version: toVersion,
      message: `Successfully rolled back ${service} from ${rolledFrom} to ${toVersion}`,
    };
  }

  async restartService(service: string): Promise<DeploymentResult> {
    return {
      success: true,
      version: this.currentVersion,
      message: `Successfully restarted ${service} (version: ${this.currentVersion})`,
    };
  }
}
