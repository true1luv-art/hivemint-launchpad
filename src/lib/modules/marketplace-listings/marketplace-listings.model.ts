import { newId, nowIso } from "../../config/repository";
import type { IndexSpec } from "../../config/repository";
import type { MarketplaceListingDocument } from "./marketplace-listings.types";

export const MARKETPLACE_LISTINGS_COLLECTION = "marketplace_listings";

export const MARKETPLACE_LISTINGS_INDEXES: IndexSpec<MarketplaceListingDocument>[] = [
  { fields: ["id"], unique: true },
  { fields: ["marketTransactionId"], unique: true },
  { fields: ["nftId", "status"] },
  { fields: ["collectionId", "status"] },
  { fields: ["seller", "status"] },
  { fields: ["collectionId", "price"] },
];

export interface CreateListingInput {
  nftId: string;
  collectionId: string;
  seller: string;
  price: number;
  marketTransactionId: string;
  featured?: boolean | undefined;
}

export function createListingDocument(input: CreateListingInput): MarketplaceListingDocument {
  const timestamp = nowIso();
  return {
    id: newId("lst"),
    nftId: input.nftId,
    collectionId: input.collectionId,
    seller: input.seller,
    price: input.price,
    currency: "HIVE",
    marketTransactionId: input.marketTransactionId,
    status: "active",
    featured: input.featured ?? false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/** Maps a persisted listing to the Phase 1 UI shape. */
export function toListingView(doc: MarketplaceListingDocument) {
  return {
    id: doc.id,
    nftId: doc.nftId,
    seller: doc.seller,
    price: doc.price,
    currency: "HIVE" as const,
    listedAt: doc.createdAt,
    featured: doc.featured,
  };
}
