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
