import { BaseRepository, nowIso } from "../../config/repository";
import { MARKETPLACE_LISTINGS_COLLECTION, MARKETPLACE_LISTINGS_INDEXES } from "./marketplace-listings.model";
import type { MarketplaceListingDocument } from "./marketplace-listings.types";

class MarketplaceListingsRepository extends BaseRepository<MarketplaceListingDocument> {
  constructor() {
    super(MARKETPLACE_LISTINGS_COLLECTION, MARKETPLACE_LISTINGS_INDEXES);
  }

  listActive() {
    return this.find({ status: "active" }, { sort: { field: "createdAt", dir: "desc" } });
  }

  listByCollection(collectionId: string) {
    return this.find({ collectionId }, { sort: { field: "createdAt", dir: "desc" } });
  }

  listBySeller(seller: string) {
    return this.find({ seller }, { sort: { field: "createdAt", dir: "desc" } });
  }

  findActiveByNft(nftId: string) {
    return this.findOne({ nftId, status: "active" });
  }

  findByMarketTransaction(marketTransactionId: string) {
    return this.findOne({ marketTransactionId });
  }

  patch(id: string, patch: Partial<MarketplaceListingDocument>) {
    return this.updateById(id, { ...patch, updatedAt: nowIso() });
  }

  markSold(id: string, buyer: string) {
    const timestamp = nowIso();
    return this.updateById(id, { status: "sold", buyer, soldAt: timestamp, updatedAt: timestamp });
  }

  markCancelled(id: string) {
    return this.patch(id, { status: "cancelled" });
  }
}

export const marketplaceListingsRepository = new MarketplaceListingsRepository();
