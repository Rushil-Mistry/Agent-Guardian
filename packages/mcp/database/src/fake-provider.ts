import type {
  DatabaseProvider,
  TableSchema,
  QueryResult,
} from "@agent-guardian/shared";

// ─── Fake Database Provider ───────────────────────────────────────────────────
// Simulates a payments database with realistic schema and query results.

export class FakeDatabaseProvider implements DatabaseProvider {
  async getSchema(database: string): Promise<TableSchema[]> {
    return [
      {
        table: "payments",
        columns: [
          { name: "id", type: "UUID", nullable: false },
          { name: "amount", type: "DECIMAL(10,2)", nullable: false },
          { name: "currency", type: "VARCHAR(3)", nullable: false },
          { name: "payment_method", type: "VARCHAR(50)", nullable: true },
          { name: "status", type: "VARCHAR(20)", nullable: false },
          { name: "created_at", type: "TIMESTAMP", nullable: false },
          { name: "updated_at", type: "TIMESTAMP", nullable: false },
          { name: "error_message", type: "TEXT", nullable: true },
        ],
      },
      {
        table: "payment_methods",
        columns: [
          { name: "id", type: "UUID", nullable: false },
          { name: "name", type: "VARCHAR(50)", nullable: false },
          { name: "processor", type: "VARCHAR(50)", nullable: false },
          { name: "enabled", type: "BOOLEAN", nullable: false },
        ],
      },
      {
        table: "transactions",
        columns: [
          { name: "id", type: "UUID", nullable: false },
          { name: "payment_id", type: "UUID", nullable: false },
          { name: "type", type: "VARCHAR(20)", nullable: false },
          { name: "amount", type: "DECIMAL(10,2)", nullable: false },
          { name: "status", type: "VARCHAR(20)", nullable: false },
          { name: "processor_ref", type: "VARCHAR(100)", nullable: true },
          { name: "created_at", type: "TIMESTAMP", nullable: false },
        ],
      },
    ];
  }

  async readQuery(database: string, query: string): Promise<QueryResult> {
    const queryLower = query.toLowerCase();

    // Simulate different query results
    if (queryLower.includes("payment_method is null")) {
      return {
        columns: [
          "id",
          "amount",
          "currency",
          "payment_method",
          "status",
          "error_message",
          "created_at",
        ],
        rows: [
          {
            id: "pay_8472",
            amount: 100.0,
            currency: "USD",
            payment_method: null,
            status: "failed",
            error_message:
              "AttributeError: 'NoneType' object has no attribute 'lower'",
            created_at: "2024-01-15T10:32:15Z",
          },
          {
            id: "pay_8473",
            amount: 250.0,
            currency: "EUR",
            payment_method: null,
            status: "failed",
            error_message:
              "AttributeError: 'NoneType' object has no attribute 'lower'",
            created_at: "2024-01-15T10:32:18Z",
          },
          {
            id: "pay_8479",
            amount: 75.5,
            currency: "GBP",
            payment_method: null,
            status: "failed",
            error_message:
              "AttributeError: 'NoneType' object has no attribute 'lower'",
            created_at: "2024-01-15T10:33:42Z",
          },
        ],
        rowCount: 3,
      };
    }

    if (queryLower.includes("count") && queryLower.includes("status")) {
      return {
        columns: ["status", "count"],
        rows: [
          { status: "completed", count: 847 },
          { status: "failed", count: 134 },
          { status: "pending", count: 12 },
        ],
        rowCount: 3,
      };
    }

    // Default: recent payments
    return {
      columns: [
        "id",
        "amount",
        "currency",
        "payment_method",
        "status",
        "created_at",
      ],
      rows: [
        {
          id: "pay_8470",
          amount: 50.0,
          currency: "USD",
          payment_method: "credit_card",
          status: "completed",
          created_at: "2024-01-15T10:30:00Z",
        },
        {
          id: "pay_8471",
          amount: 200.0,
          currency: "USD",
          payment_method: "debit_card",
          status: "completed",
          created_at: "2024-01-15T10:31:00Z",
        },
        {
          id: "pay_8472",
          amount: 100.0,
          currency: "USD",
          payment_method: null,
          status: "failed",
          created_at: "2024-01-15T10:32:15Z",
        },
      ],
      rowCount: 3,
    };
  }

  async explainQuery(database: string, query: string): Promise<string> {
    return [
      "QUERY PLAN",
      "──────────────────────────────────────────────────────────",
      "Seq Scan on payments  (cost=0.00..25.88 rows=6 width=284)",
      '  Filter: (payment_method IS NULL AND status = \'failed\')',
      "  Rows Removed by Filter: 987",
      "Planning Time: 0.15 ms",
      "Execution Time: 0.42 ms",
    ].join("\n");
  }
}
