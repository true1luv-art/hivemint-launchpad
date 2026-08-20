import { newId, nowIso } from "../../config/repository";
import type { IndexSpec } from "../../config/repository";
import type { CreateProcessedTransactionInput, ProcessedTransaction } from "./transactions-processed.types";

export const TRANSACTIONS_PROCESSED_COLLECTION = "transactions_processed";

export const TRANSACTIONS_PROCESSED_INDEXES: IndexSpec<ProcessedTransaction>[] = [
  { fields: ["id"], unique: true },
  { fields: ["transactionId"], unique: true },
  { fields: ["hiveTransactionId"] },
  { fields: ["type"] },
  { fields: ["processedAt"] },
];

export function createProcessedTransaction(
  input: CreateProcessedTransactionInput,
): ProcessedTransaction {
  const timestamp = nowIso();
  return {
    id: newId("xtx"),
    transactionId: input.transactionId,
    requestId: input.requestId,
    type: input.type,
    status: input.status,
    hiveTransactionId: input.hiveTransactionId,
    blockNumber: input.blockNumber ?? 0,
    userId: input.userId,
    hiveAccount: input.hiveAccount,
    collectionId: input.collectionId,
    nftId: input.nftId,
    result: input.result ?? {},
    error: input.error,
    createdAt: timestamp,
    processedAt: timestamp,
  };
}
