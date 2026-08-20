import { BaseRepository, nowIso } from "../../config/repository";
import {
  TRANSACTIONS_PENDING_COLLECTION,
  TRANSACTIONS_PENDING_INDEXES,
  createPendingTransaction,
} from "./transactions-pending.model";
import type {
  CreatePendingTransactionInput,
  PendingTransaction,
  TransactionType,
} from "./transactions-pending.types";

class TransactionsPendingRepository extends BaseRepository<PendingTransaction> {
  constructor() {
    super(TRANSACTIONS_PENDING_COLLECTION, TRANSACTIONS_PENDING_INDEXES);
  }

  /**
   * Idempotent enqueue: the same requestId always resolves to the same
   * transaction, so a retried API call never creates a second NFT.
   */
  async enqueue<T extends TransactionType>(
    input: CreatePendingTransactionInput<T>,
  ): Promise<{ transaction: PendingTransaction; duplicate: boolean }> {
    const existing = await this.findOne({ requestId: input.requestId });
    if (existing) return { transaction: existing, duplicate: true };
    const transaction = await this.insert(createPendingTransaction(input));
    return { transaction, duplicate: false };
  }

  findByTransactionId(transactionId: string) {
    return this.findOne({ transactionId });
  }

  listPending(limit = 20) {
    return this.find({ status: "pending" }, { sort: { field: "createdAt", dir: "asc" }, limit });
  }

  listForUser(hiveAccount: string, limit = 50) {
    return this.find({ hiveAccount }, { sort: { field: "createdAt", dir: "desc" }, limit });
  }

  /**
   * Atomically claims the oldest pending transaction. Only one worker can win
   * the transition pending -> processing for a given document.
   */
  async claimNext(workerId: string): Promise<PendingTransaction | null> {
    const timestamp = nowIso();
    const claimed = await this.findOneAndUpdate(
      { status: "pending" },
      { status: "processing", lockedBy: workerId, lockedAt: timestamp, updatedAt: timestamp },
      { sort: { field: "createdAt", dir: "asc" } },
    );
    if (!claimed) return null;
    return this.updateById(claimed.id, { attempts: claimed.attempts + 1 });
  }

  markProcessed(id: string) {
    const timestamp = nowIso();
    return this.updateById(id, {
      status: "processed",
      processedAt: timestamp,
      updatedAt: timestamp,
      lockedBy: undefined,
      error: undefined,
    });
  }

  markFailed(id: string, error: string) {
    const timestamp = nowIso();
    return this.updateById(id, {
      status: "failed",
      error,
      processedAt: timestamp,
      updatedAt: timestamp,
      lockedBy: undefined,
    });
  }

  /** Returns a stuck `processing` transaction to the queue (crash recovery). */
  release(id: string) {
    return this.updateById(id, { status: "pending", lockedBy: undefined, updatedAt: nowIso() });
  }

  async recoverStale(maxAgeMs: number) {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const stale = await this.find({ status: "processing" });
    let recovered = 0;
    for (const tx of stale) {
      if ((tx.lockedAt ?? tx.updatedAt) < cutoff) {
        await this.release(tx.id);
        recovered += 1;
      }
    }
    return recovered;
  }
}

export const transactionsPendingRepository = new TransactionsPendingRepository();
