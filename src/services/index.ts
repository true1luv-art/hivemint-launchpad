import { mockTxId } from "@/lib/art";
import { generateInventory } from "@/lib/traits/generator";
import type { GeneratedToken } from "@/lib/traits/types";
import type { Collection, NFT } from "@/lib/types";
import type { DatabaseService, HiveService, MarketplaceService } from "./types";

export const PLATFORM_FEE_RATE = 0.05;
export const MARKETPLACE_FEE_RATE = 0.025;
export const COLLECTION_CREATION_FEE = 25;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MockHiveService implements HiveService {
  async connect(username = "alice") {
    await delay(700);
    return { username, balance: 125.5 };
  }
  async disconnect() {
    await delay(150);
  }
  async getBalance() {
    await delay(100);
    return 125.5;
  }
  async transfer(_from: string, _to: string, _amount: number, _memo: string) {
    await delay(500);
    return { txId: mockTxId(), success: true, blockNumber: 88_000_000 + Math.floor(Math.random() * 9999) };
  }
  async issueNft(_symbol: string, _to: string, _tokenId: number) {
    await delay(600);
    return { txId: mockTxId(), success: true, blockNumber: 88_000_000 + Math.floor(Math.random() * 9999) };
  }
}

export class MockDatabaseService implements DatabaseService {
  async saveCollection(collection: Collection) {
    await delay(120);
    return collection;
  }
  async saveNft(nft: NFT) {
    await delay(120);
    return nft;
  }
  async nextTokenId(collection: Collection) {
    await delay(60);
    return collection.minted + 1;
  }
}

export class MockMarketplaceService implements MarketplaceService {
  async quoteMint(collection: Collection) {
    const platformFee = Number((collection.mintPrice * PLATFORM_FEE_RATE).toFixed(2));
    return {
      mintPrice: collection.mintPrice,
      platformFee,
      total: Number((collection.mintPrice + platformFee).toFixed(2)),
    };
  }
  async quoteListing(price: number) {
    const fee = Number((price * MARKETPLACE_FEE_RATE).toFixed(2));
    return { feeRate: MARKETPLACE_FEE_RATE, fee, receive: Number((price - fee).toFixed(2)) };
  }
  async quotePurchase(price: number) {
    const fee = Number((price * MARKETPLACE_FEE_RATE).toFixed(2));
    return { price, fee, total: Number((price + fee).toFixed(2)) };
  }
  /**
   * Generates one token's traits with the collection's own weights, then ranks
   * it against a freshly generated sample of the collection so the derived
   * rarity class is meaningful.
   */
  async generateToken(collection: Collection, tokenNumber: number): Promise<GeneratedToken> {
    const poolSize = Math.max(1, Math.min(collection.maxSupply, RANK_POOL_CAP));
    const inventory = generateInventory({
      layers: collection.traitLayers,
      count: poolSize,
      seedKey: `${collection.id}-mint-${tokenNumber}-${Date.now()}`,
    });
    const token = inventory.tokens[0]!;
    return { ...token, tokenNumber };
  }
}

export const hiveService: HiveService = new MockHiveService();
export const databaseService: DatabaseService = new MockDatabaseService();
export const marketplaceService: MarketplaceService = new MockMarketplaceService();

export type { DatabaseService, HiveService, MarketplaceService } from "./types";
