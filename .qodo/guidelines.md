# Agent Guardian - Qodo Code Quality & Review Guidelines

## Architecture & Code Standards

### 1. Safety-First Principles
- **Fail Closed**: All policy decisions and authorization checks must evaluate to `allowed: false` if any unknown state, parsing error, or unhandled exception occurs.
- **Deterministic Evaluation**: Policy and risk engines are deterministic and rule-based (`policies/*.yaml`). Do not replace deterministic checks with unverified model inferences.
- **Audit Logging**: Every action, decision, approval, and transition must emit structured audit events.
- **Secret Redaction**: Data passing into audit trails or MCP responses must be scrubbed through secret-guard patterns.

### 2. Package Boundaries
- `packages/domain`: Pure types, zero runtime dependencies.
- `packages/policy-engine`: Deterministic YAML rule matching, risk classification, strict unit testing.
- `packages/audit`: Append-only in-memory / persistent event emitter with secret protection.
- `packages/kill-switch`: Idempotent session stopper and safety state management.
- `packages/mcp/*`: Model Context Protocol tool adapters for observability, databases, GitHub, and deployment.

### 3. Testing Standards
- All safety features must have corresponding Vitest unit tests in `src/__tests__`.
- All tests must pass with `pnpm test`.
