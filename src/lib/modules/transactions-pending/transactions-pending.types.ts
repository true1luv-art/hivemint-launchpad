export type TransactionType =
  | "CREATE_COLLECTION"
  | "MINT_NFT"
  | "TRANSFER_NFT"
  | "LIST_NFT"
  | "BUY_NFT"
  | "CANCEL_LISTING";

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
  TRANSFER_NFT: { nftId: string; to: string };
  LIST_NFT: { nftId: string; price: number };
  BUY_NFT: { listingId: string };
  CANCEL_LISTING: { listingId: string };
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
