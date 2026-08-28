import type { GitProvider, Commit, FileDiff } from "@agent-guardian/shared";

// ─── Fake Git Provider ────────────────────────────────────────────────────────
// Deterministic fake data telling the v1.40 → v1.41 (bug) → v1.42 (fix) story.
// Includes realistic commit messages, diffs, and file content.

export class FakeGitProvider implements GitProvider {
  private readonly commits: Commit[] = [
    {
      sha: "a1b2c3d4e5f6789012345678901234567890abcd",
      message: "fix: add null check for payment_method in process_payment\n\nFixes #142 - payments with null payment_method were causing 500 errors\nsince v1.41. Added explicit validation before accessing payment_method.",
      author: "jane.smith",
      timestamp: new Date("2024-01-15T11:00:00Z"),
      files: ["src/payments.py"],
    },
    {
      sha: "b2c3d4e5f6789012345678901234567890abcde1",
      message: "feat: optimize payment processing pipeline\n\nRemoved redundant validation step for faster processing.\nAlso simplified the payment_method handling.",
      author: "john.doe",
      timestamp: new Date("2024-01-15T09:00:00Z"),
      files: ["src/payments.py", "src/models.py"],
    },
    {
      sha: "c3d4e5f6789012345678901234567890abcdef12",
      message: "chore: update dependencies and bump version to v1.40",
      author: "ci-bot",
      timestamp: new Date("2024-01-14T16:00:00Z"),
      files: ["requirements.txt", "pyproject.toml"],
    },
  ];

  private readonly branches: Map<string, string> = new Map([
    ["main", "a1b2c3d4e5f6789012345678901234567890abcd"],
    ["release/v1.42", "a1b2c3d4e5f6789012345678901234567890abcd"],
    ["release/v1.41", "b2c3d4e5f6789012345678901234567890abcde1"],
    ["release/v1.40", "c3d4e5f6789012345678901234567890abcdef12"],
  ]);

  private branchCounter = 0;
  private patchCounter = 0;

  async getRecentCommits(repo: string, limit: number): Promise<Commit[]> {
    return this.commits.slice(0, limit);
  }

  async getCommitDiff(repo: string, sha: string): Promise<FileDiff[]> {
    const diffs: Record<string, FileDiff[]> = {
      // v1.42 fix commit
      a1b2c3d4e5f6789012345678901234567890abcd: [
        {
          path: "src/payments.py",
          additions: 5,
          deletions: 1,
          patch: [
            "@@ -44,7 +44,11 @@ def process_payment(payment_request):",
            "     payment = Payment(**payment_request)",
            " ",
            "-    method = payment.payment_method.lower()",
            "+    if payment.payment_method is None:",
            '+        raise ValueError("payment_method is required")',
            "+",
            "+    method = payment.payment_method.lower()",
            "+",
            "     processor = get_processor(method)",
            "     result = processor.charge(payment.amount, payment.currency)",
          ].join("\n"),
        },
      ],
      // v1.41 bug-introducing commit
      b2c3d4e5f6789012345678901234567890abcde1: [
        {
          path: "src/payments.py",
          additions: 2,
          deletions: 6,
          patch: [
            "@@ -42,12 +42,8 @@ def process_payment(payment_request):",
            "     payment = Payment(**payment_request)",
            " ",
            "-    # Validate payment method before processing",
            "-    if not payment.payment_method:",
            '-        raise ValueError("payment_method is required")',
            "-",
            "-    method = payment.payment_method.strip().lower()",
            "+    method = payment.payment_method.lower()",
            "     processor = get_processor(method)",
            "     result = processor.charge(payment.amount, payment.currency)",
          ].join("\n"),
        },
        {
          path: "src/models.py",
          additions: 1,
          deletions: 1,
          patch: [
            "@@ -15,7 +15,7 @@ class Payment:",
            "     amount: float",
            "     currency: str",
            "-    payment_method: str",
            "+    payment_method: Optional[str] = None",
            "     metadata: dict = field(default_factory=dict)",
          ].join("\n"),
        },
      ],
    };

    return diffs[sha] ?? [];
  }

  async getFile(repo: string, path: string, ref?: string): Promise<string> {
    const version = ref ?? "main";

    // Return different file content based on version
    if (path === "src/payments.py") {
      if (
        version === "release/v1.41" ||
        version === "b2c3d4e5f6789012345678901234567890abcde1"
      ) {
        return `"""Payment processing module - v1.41"""
from dataclasses import dataclass
from typing import Optional
from .models import Payment
from .processors import get_processor


def process_payment(payment_request: dict) -> dict:
    """Process a payment request and return the result."""
    payment = Payment(**payment_request)

    method = payment.payment_method.lower()
    processor = get_processor(method)
    result = processor.charge(payment.amount, payment.currency)

    return {
        "payment_id": result.id,
        "status": result.status,
        "amount": payment.amount,
        "currency": payment.currency,
        "method": method,
    }
`;
      }

      // v1.42 (fix) or main
      return `"""Payment processing module - v1.42"""
from dataclasses import dataclass
from typing import Optional
from .models import Payment
from .processors import get_processor


def process_payment(payment_request: dict) -> dict:
    """Process a payment request and return the result."""
    payment = Payment(**payment_request)

    if payment.payment_method is None:
        raise ValueError("payment_method is required")

    method = payment.payment_method.lower()
    processor = get_processor(method)
    result = processor.charge(payment.amount, payment.currency)

    return {
        "payment_id": result.id,
        "status": result.status,
        "amount": payment.amount,
        "currency": payment.currency,
        "method": method,
    }
`;
    }

    return `# File: ${path}\n# Version: ${version}\n# (stub content)`;
  }

  async createBranch(
    repo: string,
    branchName: string,
    fromRef: string,
  ): Promise<string> {
    this.branchCounter++;
    const baseSha =
      this.branches.get(fromRef) ?? "0000000000000000000000000000000000000000";
    this.branches.set(branchName, baseSha);
    return `Branch '${branchName}' created from '${fromRef}' at ${baseSha.slice(0, 8)}`;
  }

  async createPatch(
    repo: string,
    branch: string,
    files: Record<string, string>,
    message: string,
  ): Promise<string> {
    this.patchCounter++;
    const fileList = Object.keys(files).join(", ");
    return `Patch committed to '${branch}': ${message}\nFiles modified: ${fileList}\nCommit: fake-patch-${this.patchCounter}`;
  }
}
