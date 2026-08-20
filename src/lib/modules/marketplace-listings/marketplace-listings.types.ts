export type ListingStatus = "active" | "sold" | "cancelled" | "expired";

/**
 * INDEX ONLY.
 *
 * Hive Engine's marketplace is the authority for listings once Phase 3 lands.
 * This collection is a cached projection for fast application queries:
 *
 *   Hive Engine Marketplace -> Indexer -> marketplace_listings (MongoDB)
 *
 * If MongoDB and Hive ever disagree, Hive wins.
 */
export interface MarketplaceListingDocument {
  id: string;
  nftId: string;
  collectionId: string;
  seller: string;
  price: number;
  currency: "HIVE";
  /** id of the on-chain market operation (mock in Phase 2) */
  marketTransactionId: string;
  status: ListingStatus;
  featured: boolean;
  buyer?: string | undefined;
  createdAt: string;
  updatedAt: string;
  soldAt?: string | undefined;
}
