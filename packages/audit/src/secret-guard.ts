// ─── Secret Guard ────────────────────────────────────────────
// Detects and redacts secret-shaped values from audit payloads.
// Prevents accidental logging of API keys, tokens, passwords.

/** Patterns that indicate a value is likely a secret */
const SECRET_PATTERNS: RegExp[] = [
  // Generic API key patterns
  /(?:api[_-]?key|apikey)\s*[:=]\s*\S+/i,
  // Bearer tokens
  /bearer\s+[a-zA-Z0-9\-._~+/]+=*/i,
  // GitHub tokens
  /gh[ps]_[a-zA-Z0-9]{36,}/,
  // AWS access keys
  /AKIA[0-9A-Z]{16}/,
  // AWS secret keys (40 chars base64-ish)
  /(?:aws[_-]?secret|secret[_-]?key)\s*[:=]\s*\S+/i,
  // Generic secrets/passwords/tokens
  /(?:password|passwd|pwd|secret|token|auth)\s*[:=]\s*\S+/i,
  // OpenAI / Anthropic keys
  /sk-[a-zA-Z0-9]{20,}/,
  // Slack tokens
  /xox[bprs]-[a-zA-Z0-9\-]+/,
  // Private keys
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/,
  // Connection strings with passwords
  /(?:mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@/i,
];

/**
 * Check whether a string value looks like it contains a secret.
 */
function isSecretString(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Recursively check whether a value contains any secret-shaped content.
 */
export function containsSecret(value: unknown): boolean {
  if (typeof value === "string") {
    return isSecretString(value);
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsSecret(item));
  }

  if (typeof value === "object" && value !== null) {
    // Check keys for secret-sounding names
    const obj = value as Record<string, unknown>;
    for (const [key, val] of Object.entries(obj)) {
      // Key names that suggest secrets
      if (/(?:password|passwd|pwd|secret|token|api[_-]?key|auth[_-]?token|private[_-]?key|access[_-]?key|credentials)/i.test(key)) {
        if (typeof val === "string" && val.length > 0) {
          return true;
        }
      }
      // Recurse into values
      if (containsSecret(val)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Sanitize a payload by redacting any detected secret values.
 * Returns a new object — never mutates the input.
 */
export function sanitizePayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    // Redact keys that look secret-named
    if (/(?:password|passwd|pwd|secret|token|api[_-]?key|auth[_-]?token|private[_-]?key|access[_-]?key|credentials)/i.test(key)) {
      if (typeof value === "string" && value.length > 0) {
        sanitized[key] = "[REDACTED]";
        continue;
      }
    }

    // Redact string values that match secret patterns
    if (typeof value === "string" && isSecretString(value)) {
      sanitized[key] = "[REDACTED]";
      continue;
    }

    // Recurse into nested objects
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizePayload(value as Record<string, unknown>);
      continue;
    }

    // Recurse into arrays
    if (Array.isArray(value)) {
      sanitized[key] = value.map((item) => {
        if (typeof item === "string" && isSecretString(item)) {
          return "[REDACTED]";
        }
        if (typeof item === "object" && item !== null && !Array.isArray(item)) {
          return sanitizePayload(item as Record<string, unknown>);
        }
        return item;
      });
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}
