// ─── Secret Guard Tests ──────────────────────────────────────

import { describe, it, expect } from "vitest";
import { containsSecret, sanitizePayload } from "../secret-guard.js";

describe("Secret Guard — containsSecret()", () => {
  it("should detect API key patterns", () => {
    expect(containsSecret("api_key=sk_live_abc123")).toBe(true);
    expect(containsSecret("apiKey: my-secret-key")).toBe(true);
  });

  it("should detect Bearer tokens", () => {
    expect(containsSecret("Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig")).toBe(true);
  });

  it("should detect GitHub tokens", () => {
    expect(containsSecret("ghp_1234567890abcdefghijklmnopqrstuvwxyz1234")).toBe(true);
    expect(containsSecret("ghs_1234567890abcdefghijklmnopqrstuvwxyz1234")).toBe(true);
  });

  it("should detect AWS access keys", () => {
    expect(containsSecret("AKIAIOSFODNN7EXAMPLE")).toBe(true);
  });

  it("should detect password patterns", () => {
    expect(containsSecret("password=supersecret123")).toBe(true);
    expect(containsSecret("password: mysecretpwd")).toBe(true);
  });

  it("should detect OpenAI/Anthropic keys", () => {
    expect(containsSecret("sk-abc123def456ghi789jkl012mno345pqr678")).toBe(true);
  });

  it("should detect Slack tokens", () => {
    expect(containsSecret("xoxb-123456789-abcdefg")).toBe(true);
  });

  it("should detect private keys", () => {
    expect(containsSecret("-----BEGIN PRIVATE KEY-----")).toBe(true);
    expect(containsSecret("-----BEGIN RSA PRIVATE KEY-----")).toBe(true);
  });

  it("should detect connection strings with passwords", () => {
    expect(containsSecret("postgres://user:pass@host/db")).toBe(true);
    expect(containsSecret("mongodb://admin:secret@cluster")).toBe(true);
  });

  it("should NOT false-positive on normal strings", () => {
    expect(containsSecret("Hello, world!")).toBe(false);
    expect(containsSecret("deploy-service completed successfully")).toBe(false);
    expect(containsSecret("incident severity: high")).toBe(false);
    expect(containsSecret("kubectl get pods -n production")).toBe(false);
  });

  it("should detect secrets in object keys", () => {
    expect(containsSecret({ password: "abc123" })).toBe(true);
    expect(containsSecret({ api_key: "my-key" })).toBe(true);
    expect(containsSecret({ authToken: "xyz" })).toBe(true);
  });

  it("should NOT detect secrets in objects without secret values", () => {
    expect(containsSecret({ name: "test", status: "ok" })).toBe(false);
  });

  it("should detect secrets in nested objects", () => {
    expect(
      containsSecret({
        config: {
          database: {
            password: "secret",
          },
        },
      }),
    ).toBe(true);
  });

  it("should detect secrets in arrays", () => {
    expect(
      containsSecret(["normal", "Bearer eyJtoken.payload.sig"]),
    ).toBe(true);
  });
});

describe("Secret Guard — sanitizePayload()", () => {
  it("should redact password fields", () => {
    const result = sanitizePayload({ password: "secret123" });
    expect(result.password).toBe("[REDACTED]");
  });

  it("should redact token fields", () => {
    const result = sanitizePayload({ token: "abc123", name: "test" });
    expect(result.token).toBe("[REDACTED]");
    expect(result.name).toBe("test");
  });

  it("should redact secret string values", () => {
    const result = sanitizePayload({
      config: "Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig",
    });
    expect(result.config).toBe("[REDACTED]");
  });

  it("should redact nested secrets", () => {
    const result = sanitizePayload({
      outer: {
        credentials: "my-creds",
      },
    });
    const outer = result.outer as Record<string, unknown>;
    expect(outer.credentials).toBe("[REDACTED]");
  });

  it("should NOT mutate the input object", () => {
    const input = { password: "secret", name: "test" };
    sanitizePayload(input);
    expect(input.password).toBe("secret");
  });

  it("should preserve non-secret fields", () => {
    const result = sanitizePayload({
      action: "deploy",
      environment: "production",
      status: "success",
    });
    expect(result.action).toBe("deploy");
    expect(result.environment).toBe("production");
    expect(result.status).toBe("success");
  });
});
