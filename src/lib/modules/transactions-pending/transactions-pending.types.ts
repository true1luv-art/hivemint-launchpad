/**
 * Phase 2.5 boundary.
 *
 * The pending queue is reserved for PLATFORM operations — the ones that mutate
 * supply / deploy contracts and therefore must be serialized by the
 * smart-contract worker. User-signed marketplace operations run directly
 * through `MarketplaceService` and never enter this queue.
 */
export type TransactionType = "CREATE_COLLECTION" | "MINT_NFT";

/** Direct, user-signed (Keychain) operations. Not queued. */
export type DirectTransactionType = "TRANSFER_NFT" | "LIST_NFT" | "BUY_NFT" | "CANCEL_LISTING";

/** Anything that can end up in `transactions_processed`. */
export type AnyTransactionType = TransactionType | DirectTransactionType;

export type PendingTransactionStatus = "pending" | "processing" | "processed" | "failed";

export interface PendingTransactionPayloads {
  CREATE_COLLECTION: {
    name: string;
    symbol: string;
    description: string;
    image?: string | undefined;
    maxSupply: number;
    mintPrice: number;
    creatorFee: number;
    platformFee: number;
    rarities: { rarity: string; weight: number }[];
    metadataBaseUri?: string | undefined;
  };
  MINT_NFT: { collectionId: string; quantity: number };
}

export interface PendingTransaction {
  id: string;
  /** application transaction id, unique */
  transactionId: string;
  /** client supplied idempotency key, unique */
  requestId: string;
  type: TransactionType;
  status: PendingTransactionStatus;
  userId: string;
  hiveAccount: string;
  collectionId?: string | undefined;
  nftId?: string | undefined;
  amount: number;
  currency: "HIVE";
  payload: Record<string, unknown>;
  attempts: number;
  /** worker lease owner — protects against double processing */
  lockedBy?: string | undefined;
  lockedAt?: string | undefined;
  error?: string | undefined;
  createdAt: string;
  updatedAt: string;
  processedAt?: string | undefined;
}

export interface CreatePendingTransactionInput<T extends TransactionType = TransactionType> {
  type: T;
  requestId: string;
  userId: string;
  hiveAccount: string;
  amount?: number | undefined;
  collectionId?: string | undefined;
  nftId?: string | undefined;
  payload: T extends keyof PendingTransactionPayloads
    ? PendingTransactionPayloads[T]
    : Record<string, unknown>;
}
