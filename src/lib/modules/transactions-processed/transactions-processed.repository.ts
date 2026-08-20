import { BaseRepository } from "../../config/repository";
import {
  TRANSACTIONS_PROCESSED_COLLECTION,
  TRANSACTIONS_PROCESSED_INDEXES,
  createProcessedTransaction,
} from "./transactions-processed.model";
import type {
  CreateProcessedTransactionInput,
  ProcessedTransaction,
} from "./transactions-processed.types";

class TransactionsProcessedRepository extends BaseRepository<ProcessedTransaction> {
  constructor() {
    super(TRANSACTIONS_PROCESSED_COLLECTION, TRANSACTIONS_PROCESSED_INDEXES);
  }

  findByTransactionId(transactionId: string) {
    return this.findOne({ transactionId });
  }

  /**
   * Writes the processing receipt. The unique `transactionId` index means a
   * replayed transaction can never produce two receipts.
   */
  async record(input: CreateProcessedTransactionInput): Promise<ProcessedTransaction> {
    const existing = await this.findByTransactionId(input.transactionId);
    if (existing) return existing;
    return this.insert(createProcessedTransaction(input));
  }

  listRecent(limit = 50) {
    return this.find(undefined, { sort: { field: "processedAt", dir: "desc" }, limit });
  }
}

export const transactionsProcessedRepository = new TransactionsProcessedRepository();
