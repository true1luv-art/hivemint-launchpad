import { newId, nowIso } from "../../config/repository";
import type { CreatePendingTransactionInput, PendingTransaction, TransactionType } from "./transactions-pending.types";

export const TRANSACTIONS_PENDING_COLLECTION = "transactions_pending";

/** Unique constraints are the backbone of idempotency. */
export const TRANSACTIONS_PENDING_INDEXES = [
  { field: "id" as const, unique: true },
  { field: "transactionId" as const, unique: true },
  { field: "requestId" as const, unique: true },
];

export function newTransactionId(): string {
  const chars = "0123456789ABCDEF";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `TX-${out}`;
}

export function createPendingTransaction<T extends TransactionType>(
  input: CreatePendingTransactionInput<T>,
): PendingTransaction {
  const timestamp = nowIso();
  return {
    id: newId("ptx"),
    transactionId: newTransactionId(),
    requestId: input.requestId,
    type: input.type,
    status: "pending",
    userId: input.userId,
    hiveAccount: input.hiveAccount,
    collectionId: input.collectionId,
    nftId: input.nftId,
    amount: input.amount ?? 0,
    currency: "HIVE",
    payload: input.payload as Record<string, unknown>,
    attempts: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
