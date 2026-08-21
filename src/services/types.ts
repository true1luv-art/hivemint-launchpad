import type { GeneratedToken } from "@/lib/traits/types";
import type { Collection, NFT } from "@/lib/types";

/**
 * Service abstraction layer.
 *
 * The UI only ever talks to these interfaces. Today they are backed by
 * in-memory mock implementations; later the same interfaces will be backed by:
 *
 *   Frontend -> SDK -> API -> HiveService -> DHive / Hive Engine -> Hive
 *   Frontend -> SDK -> API -> DatabaseService -> MongoDB
 *
 * The frontend never imports a database driver or a chain client directly.
 */

export interface HiveTransferResult {
  txId: string;
  success: boolean;
  blockNumber: number;
}

export interface HiveService {
  /** Simulates a Hive wallet connection (Keychain later). */
  connect(username?: string): Promise<{ username: string; balance: number }>;
  disconnect(): Promise<void>;
  getBalance(username: string): Promise<number>;
  transfer(from: string, to: string, amount: number, memo: string): Promise<HiveTransferResult>;
  /** Hive Engine NFT issue operation (mocked). */
  issueNft(collectionSymbol: string, to: string, tokenId: number): Promise<HiveTransferResult>;
}

export interface DatabaseService {
  /** Indexing layer — MongoDB in production. */
  saveCollection(collection: Collection): Promise<Collection>;
  saveNft(nft: NFT): Promise<NFT>;
  nextTokenId(collection: Collection): Promise<number>;
}

export interface MarketplaceService {
  quoteMint(collection: Collection): Promise<{ mintPrice: number; platformFee: number; total: number }>;
  quoteListing(price: number): Promise<{ feeRate: number; fee: number; receive: number }>;
  quotePurchase(price: number): Promise<{ price: number; fee: number; total: number }>;
  /**
   * Rolls a full weighted trait combination. Rarity is derived from the
   * result — it is never an input.
   */
  generateToken(collection: Collection, tokenNumber: number): Promise<GeneratedToken>;
}
