import { describe, expect, it, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import {
  getTransactionHistory,
  getOperationHistory,
  type TransactionsDeps,
} from "../../../lib/transactions";

// ─── Shared test data ─────────────────────────────────────────────────────────

const VALID_PUBLIC_KEY = Keypair.random().publicKey();

// ─── Mock factory helpers ─────────────────────────────────────────────────────

function makeFakeTx(overrides: Record<string, unknown> = {}) {
  return {
    id: "tx1",
    hash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    created_at: "2026-01-01T00:00:00Z",
    fee_charged: "100",
    max_fee: "200",
    successful: true,
    operation_count: 1,
    ledger_attr: 12345,
    source_account: VALID_PUBLIC_KEY,
    memo_type: "none",
    ...overrides,
  };
}

function makeFakeOp(overrides: Record<string, unknown> = {}) {
  return {
    id: "op1",
    type: "payment",
    created_at: "2026-01-01T00:00:01Z",
    transaction_hash: "abc123",
    source_account: VALID_PUBLIC_KEY,
    asset_type: "native",
    amount: "10.0000000",
    to: Keypair.random().publicKey(),
    ...overrides,
  };
}

function makeDepsWithTxPage(records: ReturnType<typeof makeFakeTx>[]): TransactionsDeps {
  return {
    createServer: () =>
      ({
        transactions: () => ({
          forAccount: () => ({
            limit: () => ({
              order: () => ({
                cursor: () => ({ call: async () => ({ records }) }),
                call: async () => ({ records }),
              }),
            }),
          }),
        }),
      } as unknown as import("@stellar/stellar-sdk").Horizon.Server),
  };
}

function makeDepsWithOpPage(records: ReturnType<typeof makeFakeOp>[]): TransactionsDeps {
  return {
    createServer: () =>
      ({
        operations: () => ({
          forAccount: () => ({
            limit: () => ({
              order: () => ({
                includeFailed: () => ({
                  cursor: () => ({ call: async () => ({ records }) }),
                  call: async () => ({ records }),
                }),
              }),
            }),
          }),
        }),
      } as unknown as import("@stellar/stellar-sdk").Horizon.Server),
  };
}

function makeDepsWithError(status: number): TransactionsDeps {
  const err = Object.assign(new Error("Horizon error"), {
    response: { status, data: { title: status === 404 ? "Resource Missing" : "Bad Request" } },
  });
  return {
    createServer: () =>
      ({
        transactions: () => ({
          forAccount: () => ({
            limit: () => ({
              order: () => ({
                call: async () => { throw err; },
              }),
            }),
          }),
        }),
        operations: () => ({
          forAccount: () => ({
            limit: () => ({
              order: () => ({
                includeFailed: () => ({
                  call: async () => { throw err; },
                }),
              }),
            }),
          }),
        }),
      } as unknown as import("@stellar/stellar-sdk").Horizon.Server),
  };
}

// ─── getTransactionHistory tests ──────────────────────────────────────────────

describe("getTransactionHistory", () => {
  it("rejects an invalid public key", async () => {
    await expect(
      getTransactionHistory({ publicKey: "INVALID_KEY" })
    ).rejects.toThrow("Invalid Stellar public key");
  });

  it("rejects a key too short to be valid", async () => {
    await expect(
      getTransactionHistory({ publicKey: "GABC" })
    ).rejects.toThrow("Invalid Stellar public key");
  });

  it("returns mapped TransactionRecord objects on success", async () => {
    const fakeTx = makeFakeTx();
    const deps = makeDepsWithTxPage([fakeTx]);

    const result = await getTransactionHistory(
      { publicKey: VALID_PUBLIC_KEY, network: "testnet" },
      deps
    );

    expect(result).toHaveLength(1);
    expect(result[0].hash).toBe(fakeTx.hash);
    expect(result[0].successful).toBe(true);
    expect(result[0].operationCount).toBe(1);
    expect(result[0].fee).toBe("100");
    expect(result[0].sourceAccount).toBe(VALID_PUBLIC_KEY);
  });

  it("defaults to testnet when network is not specified", async () => {
    let capturedUrl = "";
    const deps: TransactionsDeps = {
      createServer: (url) => {
        capturedUrl = url;
        return makeDepsWithTxPage([makeFakeTx()]).createServer(url);
      },
    };

    await getTransactionHistory({ publicKey: VALID_PUBLIC_KEY }, deps);
    expect(capturedUrl).toContain("testnet");
  });

  it("uses mainnet Horizon URL when network=mainnet", async () => {
    let capturedUrl = "";
    const deps: TransactionsDeps = {
      createServer: (url) => {
        capturedUrl = url;
        return makeDepsWithTxPage([makeFakeTx()]).createServer(url);
      },
    };

    await getTransactionHistory({ publicKey: VALID_PUBLIC_KEY, network: "mainnet" }, deps);
    expect(capturedUrl).toBe("https://horizon.stellar.org");
  });

  it("returns empty array when account has no transactions", async () => {
    const deps = makeDepsWithTxPage([]);
    const result = await getTransactionHistory({ publicKey: VALID_PUBLIC_KEY }, deps);
    expect(result).toEqual([]);
  });

  it("throws a friendly error when account is not found (404)", async () => {
    const deps = makeDepsWithError(404);
    await expect(
      getTransactionHistory({ publicKey: VALID_PUBLIC_KEY }, deps)
    ).rejects.toThrow("not found");
  });

  it("clamps limit below 1 to 1", async () => {
    const deps = makeDepsWithTxPage([]);
    // Should not throw; clamping happens silently
    await expect(
      getTransactionHistory({ publicKey: VALID_PUBLIC_KEY, limit: 0 }, deps)
    ).resolves.toEqual([]);
  });

  it("clamps limit above 200 to 200", async () => {
    const deps = makeDepsWithTxPage([]);
    await expect(
      getTransactionHistory({ publicKey: VALID_PUBLIC_KEY, limit: 999 }, deps)
    ).resolves.toEqual([]);
  });

  it("includes memo fields when memo_type is not 'none'", async () => {
    const fakeTx = makeFakeTx({ memo_type: "text", memo: "hello world" });
    const deps = makeDepsWithTxPage([fakeTx]);

    const result = await getTransactionHistory({ publicKey: VALID_PUBLIC_KEY }, deps);

    expect(result[0].memoType).toBe("text");
    expect(result[0].memo).toBe("hello world");
  });

  it("does not include memo fields when memo_type is 'none'", async () => {
    const fakeTx = makeFakeTx({ memo_type: "none" });
    const deps = makeDepsWithTxPage([fakeTx]);

    const result = await getTransactionHistory({ publicKey: VALID_PUBLIC_KEY }, deps);

    expect(result[0].memo).toBeUndefined();
    expect(result[0].memoType).toBeUndefined();
  });
});

// ─── getOperationHistory tests ────────────────────────────────────────────────

describe("getOperationHistory", () => {
  it("rejects an invalid public key", async () => {
    await expect(
      getOperationHistory({ publicKey: "BAD_KEY" })
    ).rejects.toThrow("Invalid Stellar public key");
  });

  it("returns mapped OperationRecord objects on success", async () => {
    const fakeOp = makeFakeOp();
    const deps = makeDepsWithOpPage([fakeOp]);

    const result = await getOperationHistory(
      { publicKey: VALID_PUBLIC_KEY, network: "testnet" },
      deps
    );

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("payment");
    expect(result[0].transactionHash).toBe("abc123");
    expect(result[0].sourceAccount).toBe(VALID_PUBLIC_KEY);
    expect(result[0].details).toBeDefined();
  });

  it("defaults to testnet when network is not specified", async () => {
    let capturedUrl = "";
    const deps: TransactionsDeps = {
      createServer: (url) => {
        capturedUrl = url;
        return makeDepsWithOpPage([makeFakeOp()]).createServer(url);
      },
    };

    await getOperationHistory({ publicKey: VALID_PUBLIC_KEY }, deps);
    expect(capturedUrl).toContain("testnet");
  });

  it("returns empty array when account has no operations", async () => {
    const deps = makeDepsWithOpPage([]);
    const result = await getOperationHistory({ publicKey: VALID_PUBLIC_KEY }, deps);
    expect(result).toEqual([]);
  });

  it("throws a friendly error when account is not found (404)", async () => {
    const deps = makeDepsWithError(404);
    await expect(
      getOperationHistory({ publicKey: VALID_PUBLIC_KEY }, deps)
    ).rejects.toThrow("not found");
  });

  it("forwards operation-specific fields into the details object", async () => {
    const fakeOp = makeFakeOp({ amount: "99.0000000", asset_type: "native" });
    const deps = makeDepsWithOpPage([fakeOp]);

    const result = await getOperationHistory({ publicKey: VALID_PUBLIC_KEY }, deps);

    expect(result[0].details["amount"]).toBe("99.0000000");
    expect(result[0].details["asset_type"]).toBe("native");
  });
});
