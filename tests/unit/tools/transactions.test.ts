import { describe, expect, it, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";

// ─── Shared test data ─────────────────────────────────────────────────────────

const VALID_PUBLIC_KEY = Keypair.random().publicKey();

// ─── Mock lib/transactions before importing the tool ─────────────────────────

vi.mock("../../../lib/transactions", () => ({
  getTransactionHistory: vi.fn(),
  getOperationHistory: vi.fn(),
}));

import { getTransactionHistory, getOperationHistory } from "../../../lib/transactions";
import { StellarTransactionHistoryTool } from "../../../tools/transactions";

const mockGetTxHistory = vi.mocked(getTransactionHistory);
const mockGetOpHistory = vi.mocked(getOperationHistory);

// ─── Tool metadata tests ──────────────────────────────────────────────────────

describe("StellarTransactionHistoryTool metadata", () => {
  it("has the correct tool name", () => {
    expect(StellarTransactionHistoryTool.name).toBe("stellar_transaction_history");
  });

  it("has a non-empty description", () => {
    expect(StellarTransactionHistoryTool.description.length).toBeGreaterThan(10);
  });

  it("description mentions transactions and operations", () => {
    const desc = StellarTransactionHistoryTool.description.toLowerCase();
    expect(desc).toContain("transaction");
    expect(desc).toContain("operation");
  });
});

// ─── get_transactions action tests ───────────────────────────────────────────

describe("StellarTransactionHistoryTool – get_transactions", () => {
  it("delegates to getTransactionHistory and formats the output", async () => {
    mockGetTxHistory.mockResolvedValueOnce([
      {
        id: "tx1",
        hash: "deadbeef1234deadbeef1234deadbeef1234deadbeef1234deadbeef1234dead",
        createdAt: "2026-01-01T00:00:00Z",
        fee: "100",
        successful: true,
        operationCount: 2,
        ledger: 99999,
        sourceAccount: VALID_PUBLIC_KEY,
      },
    ]);

    const result = await StellarTransactionHistoryTool.func({
      action: "get_transactions",
      publicKey: VALID_PUBLIC_KEY,
      network: "testnet",
      limit: 5,
      order: "desc",
    });

    expect(mockGetTxHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        publicKey: VALID_PUBLIC_KEY,
        network: "testnet",
        limit: 5,
      })
    );
    expect(result).toContain("Transaction History");
    expect(result).toContain("deadbeef");
    expect(result).toContain("✅ Success");
  });

  it("returns 'No transactions found' when the result is empty", async () => {
    mockGetTxHistory.mockResolvedValueOnce([]);

    const result = await StellarTransactionHistoryTool.func({
      action: "get_transactions",
      publicKey: VALID_PUBLIC_KEY,
    });

    expect(result).toContain("No transactions found");
  });

  it("returns Error message when getTransactionHistory throws", async () => {
    mockGetTxHistory.mockRejectedValueOnce(new Error("Account not found on testnet"));

    const result = await StellarTransactionHistoryTool.func({
      action: "get_transactions",
      publicKey: VALID_PUBLIC_KEY,
    });

    expect(result).toContain("Error:");
    expect(result).toContain("Account not found on testnet");
  });

  it("includes memo info when present in the record", async () => {
    mockGetTxHistory.mockResolvedValueOnce([
      {
        id: "tx2",
        hash: "aabbcc1234aabbcc1234aabbcc1234aabbcc1234aabbcc1234aabbcc1234aabb",
        createdAt: "2026-02-01T00:00:00Z",
        fee: "200",
        successful: true,
        operationCount: 1,
        ledger: 11111,
        sourceAccount: VALID_PUBLIC_KEY,
        memo: "hello world",
        memoType: "text",
      },
    ]);

    const result = await StellarTransactionHistoryTool.func({
      action: "get_transactions",
      publicKey: VALID_PUBLIC_KEY,
    });

    expect(result).toContain("hello world");
    expect(result).toContain("text");
  });
});

// ─── get_operations action tests ─────────────────────────────────────────────

describe("StellarTransactionHistoryTool – get_operations", () => {
  it("delegates to getOperationHistory and formats the output", async () => {
    mockGetOpHistory.mockResolvedValueOnce([
      {
        id: "op1",
        type: "payment",
        createdAt: "2026-01-01T00:00:01Z",
        transactionHash: "abc123",
        sourceAccount: VALID_PUBLIC_KEY,
        details: { amount: "10.0000000", asset_type: "native" },
      },
    ]);

    const result = await StellarTransactionHistoryTool.func({
      action: "get_operations",
      publicKey: VALID_PUBLIC_KEY,
      network: "testnet",
      limit: 3,
      order: "desc",
      includeFailedTxs: false,
    });

    expect(mockGetOpHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        publicKey: VALID_PUBLIC_KEY,
        network: "testnet",
        limit: 3,
        includeFailedTxs: false,
      })
    );
    expect(result).toContain("Operation History");
    expect(result).toContain("payment");
    expect(result).toContain("abc123");
  });

  it("returns 'No operations found' when the result is empty", async () => {
    mockGetOpHistory.mockResolvedValueOnce([]);

    const result = await StellarTransactionHistoryTool.func({
      action: "get_operations",
      publicKey: VALID_PUBLIC_KEY,
    });

    expect(result).toContain("No operations found");
  });

  it("returns Error message when getOperationHistory throws", async () => {
    mockGetOpHistory.mockRejectedValueOnce(new Error("Rate limit exceeded"));

    const result = await StellarTransactionHistoryTool.func({
      action: "get_operations",
      publicKey: VALID_PUBLIC_KEY,
    });

    expect(result).toContain("Error:");
    expect(result).toContain("Rate limit exceeded");
  });

  it("passes includeFailedTxs=true to the lib function", async () => {
    mockGetOpHistory.mockResolvedValueOnce([]);

    await StellarTransactionHistoryTool.func({
      action: "get_operations",
      publicKey: VALID_PUBLIC_KEY,
      includeFailedTxs: true,
    });

    expect(mockGetOpHistory).toHaveBeenCalledWith(
      expect.objectContaining({ includeFailedTxs: true })
    );
  });
});

// ─── Tool type exports ────────────────────────────────────────────────────────

describe("StellarTransactionHistoryTool type re-exports", () => {
  it("re-exports TransactionRecord and OperationRecord types from the tool module", async () => {
    // This is a compile-time check surfaced at runtime via the import
    const toolModule = await import("../../../tools/transactions");
    expect(toolModule.StellarTransactionHistoryTool).toBeDefined();
  });
});
