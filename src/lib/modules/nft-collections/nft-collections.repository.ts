import { BaseRepository, nowIso } from "../../config/repository";
import { NFT_COLLECTIONS_COLLECTION, NFT_COLLECTIONS_INDEXES } from "./nft-collections.model";
import type { CollectionDocument } from "./nft-collections.types";

class NftCollectionsRepository extends BaseRepository<CollectionDocument> {
  constructor() {
    super(NFT_COLLECTIONS_COLLECTION, NFT_COLLECTIONS_INDEXES);
  }

  listAll() {
    return this.find(undefined, { sort: { field: "createdAt", dir: "desc" } });
  }

  listByCreator(creator: string) {
    return this.find({ creator }, { sort: { field: "createdAt", dir: "desc" } });
  }

  patch(id: string, patch: Partial<CollectionDocument>) {
    return this.updateById(id, { ...patch, updatedAt: nowIso() });
  }

  /**
   * Reserves one mint slot BEFORE any payment or chain call.
   * Returns null when the collection is sold out, which makes supply overruns
   * impossible even if several mints are processed back to back.
   */
  async reserveMint(id: string): Promise<{ mintNumber: number; collection: CollectionDocument } | null> {
    const doc = await this.findById(id);
    if (!doc) return null;
    if (doc.minted >= doc.maxSupply) return null;
    const minted = doc.minted + 1;
    const updated = await this.patch(id, {
      minted,
      status: minted >= doc.maxSupply ? "sold_out" : doc.status,
    });
    if (!updated) return null;
    return { mintNumber: minted, collection: updated };
  }

  /** Rolls a reservation back when the mint fails after reserving. */
  async releaseMint(id: string): Promise<CollectionDocument | null> {
    const doc = await this.findById(id);
    if (!doc || doc.minted <= 0) return doc;
    const minted = doc.minted - 1;
    return this.patch(id, { minted, status: minted < doc.maxSupply ? "active" : doc.status });
  }

  /** Records mint revenue for an already reserved slot. */
  async addVolume(id: string, amount: number): Promise<CollectionDocument | null> {
    const doc = await this.findById(id);
    if (!doc) return null;
    return this.patch(id, { volume: Number((doc.volume + amount).toFixed(3)) });
  }

  /** Reserves the next mint number atomically-ish and returns the updated doc. */
  async incrementMinted(id: string, amount: number): Promise<CollectionDocument | null> {
    const doc = await this.findById(id);
    if (!doc) return null;
    const minted = doc.minted + 1;
    return this.patch(id, {
      minted,
      volume: Number((doc.volume + amount).toFixed(3)),
      status: minted >= doc.maxSupply ? "sold_out" : doc.status,
    });
  }

  async registerSale(id: string, price: number) {
    const doc = await this.findById(id);
    if (!doc) return null;
    return this.patch(id, {
      volume: Number((doc.volume + price).toFixed(3)),
      floorPrice: doc.floorPrice === 0 ? price : Math.min(doc.floorPrice, price),
    });
  }
}

export const nftCollectionsRepository = new NftCollectionsRepository();
