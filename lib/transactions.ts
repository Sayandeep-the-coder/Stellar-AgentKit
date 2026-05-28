import { Horizon } from "@stellar/stellar-sdk";
import { StrKey } from "@stellar/stellar-sdk";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface TransactionRecord {
  id: string;
  hash: string;
  createdAt: string;
  fee: string;
  memo?: string;
  memoType?: string;
  successful: boolean;
  operationCount: number;
  ledger: number;
  sourceAccount: string;
}

export interface OperationRecord {
  id: string;
  type: string;
  createdAt: string;
  transactionHash: string;
  sourceAccount: string;
  /** Extra type-specific fields forwarded as-is from Horizon */
  details: Record<string, unknown>;
}

export interface TransactionHistoryParams {
  publicKey: string;
  network?: "testnet" | "mainnet";
  limit?: number;
  order?: "asc" | "desc";
  cursor?: string;
}

export interface OperationHistoryParams {
  publicKey: string;
  network?: "testnet" | "mainnet";
  limit?: number;
  order?: "asc" | "desc";
  cursor?: string;
  includeFailedTxs?: boolean;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 10;

function getHorizonUrl(network: "testnet" | "mainnet"): string {
  return network === "mainnet"
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org";
}

function clampLimit(limit: number | undefined): number {
  const n = limit ?? DEFAULT_LIMIT;
  if (n < 1) return 1;
  if (n > MAX_LIMIT) return MAX_LIMIT;
  return n;
}

/** Dependency-injectable server factory (makes unit testing easy without module mocks). */
export interface TransactionsDeps {
  createServer: (horizonUrl: string) => Horizon.Server;
}

export const defaultDeps: TransactionsDeps = {
  createServer: (url) => new Horizon.Server(url),
};

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Fetch recent transactions for a Stellar account.
 *
 * @throws {Error} if publicKey is invalid
 * @throws {Error} if account is not found on the network (404)
 */
export async function getTransactionHistory(
  params: TransactionHistoryParams,
  deps: TransactionsDeps = defaultDeps
): Promise<TransactionRecord[]> {
  const { publicKey, network = "testnet", order = "desc", cursor } = params;
  const limit = clampLimit(params.limit);

  if (!StrKey.isValidEd25519PublicKey(publicKey)) {
    throw new Error(
      `Invalid Stellar public key: must be a 56-character G-prefix Ed25519 key.`
    );
  }

  const server = deps.createServer(getHorizonUrl(network));

  try {
    let call = server
      .transactions()
      .forAccount(publicKey)
      .limit(limit)
      .order(order);

    if (cursor) {
      call = call.cursor(cursor);
    }

    const page = await call.call();

    return page.records.map((tx): TransactionRecord => {
      const record: TransactionRecord = {
        id: tx.id,
        hash: tx.hash,
        createdAt: tx.created_at,
        fee: String(tx.fee_charged ?? tx.max_fee),
        successful: tx.successful,
        operationCount: tx.operation_count,
        ledger: tx.ledger_attr,
        sourceAccount: tx.source_account,
      };

      if (tx.memo_type && tx.memo_type !== "none") {
        record.memoType = tx.memo_type;
        record.memo = tx.memo;
      }

      return record;
    });
  } catch (err: unknown) {
    const horizonErr = err as {
      response?: { status?: number; data?: { title?: string; detail?: string } };
      message?: string;
    };

    const status = horizonErr?.response?.status;
    if (status === 404) {
      throw new Error(
        `Account ${publicKey} not found on ${network}. ` +
          `The account may not be funded yet.`
      );
    }

    const title = horizonErr?.response?.data?.title;
    const detail = horizonErr?.response?.data?.detail;
    throw new Error(
      title || detail || horizonErr?.message || "Failed to fetch transaction history"
    );
  }
}

/**
 * Fetch recent operations for a Stellar account.
 *
 * @throws {Error} if publicKey is invalid
 * @throws {Error} if account is not found on the network (404)
 */
export async function getOperationHistory(
  params: OperationHistoryParams,
  deps: TransactionsDeps = defaultDeps
): Promise<OperationRecord[]> {
  const {
    publicKey,
    network = "testnet",
    order = "desc",
    cursor,
    includeFailedTxs = false,
  } = params;
  const limit = clampLimit(params.limit);

  if (!StrKey.isValidEd25519PublicKey(publicKey)) {
    throw new Error(
      `Invalid Stellar public key: must be a 56-character G-prefix Ed25519 key.`
    );
  }

  const server = deps.createServer(getHorizonUrl(network));

  try {
    let call = server
      .operations()
      .forAccount(publicKey)
      .limit(limit)
      .order(order)
      .includeFailed(includeFailedTxs);

    if (cursor) {
      call = call.cursor(cursor);
    }

    const page = await call.call();

    return page.records.map((op): OperationRecord => {
      // Spread via `unknown` to avoid a TS error on the union type returned by
      // the Stellar SDK (which has no index signature in TypeScript).
      const raw = op as unknown as Record<string, unknown>;
      const { id, type, created_at, transaction_hash, source_account, ...rest } = raw;

      return {
        id: String(id),
        type: String(type),
        createdAt: String(created_at),
        transactionHash: String(transaction_hash),
        sourceAccount: String(source_account),
        details: rest as Record<string, unknown>,
      };
    });
  } catch (err: unknown) {
    const horizonErr = err as {
      response?: { status?: number; data?: { title?: string; detail?: string } };
      message?: string;
    };

    const status = horizonErr?.response?.status;
    if (status === 404) {
      throw new Error(
        `Account ${publicKey} not found on ${network}. ` +
          `The account may not be funded yet.`
      );
    }

    const title = horizonErr?.response?.data?.title;
    const detail = horizonErr?.response?.data?.detail;
    throw new Error(
      title || detail || horizonErr?.message || "Failed to fetch operation history"
    );
  }
}
