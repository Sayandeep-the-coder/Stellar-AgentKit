import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import {
  getTransactionHistory,
  getOperationHistory,
  type TransactionRecord,
  type OperationRecord,
} from "../lib/transactions";

// ─── Zod schema ───────────────────────────────────────────────────────────────

const transactionHistorySchema = z.object({
  action: z
    .enum(["get_transactions", "get_operations"])
    .describe(
      "get_transactions: recent transactions. get_operations: recent operations (payments, swaps, etc.)."
    ),
  publicKey: z
    .string()
    .describe(
      "The 56-character G-prefix Stellar public key of the account to inspect."
    ),
  network: z
    .enum(["testnet", "mainnet"])
    .optional()
    .describe("The Stellar network to query (defaults to testnet)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Number of records to return (1-200, defaults to 10)."),
  order: z
    .enum(["asc", "desc"])
    .optional()
    .describe("Sort order: desc = newest first (default), asc = oldest first."),
  cursor: z
    .string()
    .optional()
    .describe("Pagination cursor from a previous response for fetching the next page."),
  includeFailedTxs: z
    .boolean()
    .optional()
    .describe(
      "For get_operations only: include operations from failed transactions (defaults to false)."
    ),
});

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatTransactions(records: TransactionRecord[]): string {
  if (records.length === 0) {
    return "No transactions found for this account.";
  }

  const lines = records.map((tx, i) => {
    const parts = [
      `[${i + 1}] Hash: ${tx.hash}`,
      `    Date     : ${tx.createdAt}`,
      `    Status   : ${tx.successful ? "✅ Success" : "❌ Failed"}`,
      `    Ops      : ${tx.operationCount}`,
      `    Ledger   : ${tx.ledger}`,
      `    Fee      : ${tx.fee} stroops`,
    ];
    if (tx.memo) {
      parts.push(`    Memo     : [${tx.memoType}] ${tx.memo}`);
    }
    return parts.join("\n");
  });

  return `═══ Transaction History (${records.length} records) ═══\n\n${lines.join("\n\n")}`;
}

function formatOperations(records: OperationRecord[]): string {
  if (records.length === 0) {
    return "No operations found for this account.";
  }

  const lines = records.map((op, i) => {
    const detailStr = Object.entries(op.details)
      .filter(
        ([k]) =>
          !["_links", "links", "paging_token", "transaction_successful"].includes(k)
      )
      .map(([k, v]) => `    ${k.padEnd(20)}: ${JSON.stringify(v)}`)
      .join("\n");

    return [
      `[${i + 1}] Type: ${op.type}`,
      `    Date             : ${op.createdAt}`,
      `    Source Account   : ${op.sourceAccount}`,
      `    Transaction Hash : ${op.transactionHash}`,
      detailStr,
    ]
      .filter(Boolean)
      .join("\n");
  });

  return `═══ Operation History (${records.length} records) ═══\n\n${lines.join("\n\n")}`;
}

// ─── Tool definition ──────────────────────────────────────────────────────────

/**
 * LangChain DynamicStructuredTool for querying Stellar account transaction
 * and operation history via the Horizon REST API.
 *
 * Supports two actions:
 *  - get_transactions: Returns a list of recent transactions for the account.
 *  - get_operations:   Returns a list of recent operations (payments, swaps,
 *                      DEX orders, etc.) for the account.
 *
 * Both actions are strictly read-only — no transactions are constructed or
 * signed and no private key is required.
 */
export const StellarTransactionHistoryTool = new DynamicStructuredTool({
  name: "stellar_transaction_history",
  description:
    "Query recent transactions or operations for a Stellar account. " +
    "Use get_transactions to see high-level transaction records (hash, status, fee, memo). " +
    "Use get_operations to see individual operations (payments, swaps, trustlines, etc.). " +
    "Both actions are read-only and require no private key.",
  schema: transactionHistorySchema,
  func: async (input: z.infer<typeof transactionHistorySchema>) => {
    const {
      action,
      publicKey,
      network = "testnet",
      limit = 10,
      order = "desc",
      cursor,
      includeFailedTxs = false,
    } = input;

    try {
      if (action === "get_transactions") {
        const records = await getTransactionHistory({
          publicKey,
          network,
          limit,
          order,
          cursor,
        });
        return formatTransactions(records);
      }

      // action === "get_operations"
      const records = await getOperationHistory({
        publicKey,
        network,
        limit,
        order,
        cursor,
        includeFailedTxs,
      });
      return formatOperations(records);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error: ${message}`;
    }
  },
});

export type { TransactionRecord, OperationRecord };
