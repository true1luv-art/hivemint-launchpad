import { generateArtwork } from "@/lib/art";
import { newId, nowIso } from "../../config/repository";
import type { IndexSpec } from "../../config/repository";
import type { CollectionDocument, CreateCollectionInput } from "./nft-collections.types";

export const NFT_COLLECTIONS_COLLECTION = "nft_collections";

export const NFT_COLLECTIONS_INDEXES: IndexSpec<CollectionDocument>[] = [
  { fields: ["id"], unique: true },
  { fields: ["symbol"], unique: true },
  { fields: ["creator"] },
];

export function createCollectionDocument(input: CreateCollectionInput): CollectionDocument {
  const timestamp = nowIso();
  const symbol = input.symbol.toUpperCase();
  return {
    id: newId("col"),
    name: input.name,
    symbol,
    description: input.description,
    image: input.image || generateArtwork(`collection-${symbol}-${input.name}`, "Epic"),
    creator: input.creator,
    maxSupply: input.maxSupply,
    minted: 0,
    mintPrice: input.mintPrice,
    currency: "HIVE",
    creatorFee: input.creatorFee,
    platformFee: input.platformFee,
    rarities: input.rarities,
    metadataBaseUri: input.metadataBaseUri || `https://meta.hivemint.app/${symbol.toLowerCase()}/`,
    status: "active",
    floorPrice: input.mintPrice,
    volume: 0,
    holders: 0,
    trendingScore: 50,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/** Maps the persisted document to the shape the Phase 1 UI already renders. */
export function toCollectionView(doc: CollectionDocument) {
  return {
    id: doc.id,
    name: doc.name,
    symbol: doc.symbol,
    creator: doc.creator,
    description: doc.description,
    image: doc.image,
    maxSupply: doc.maxSupply,
    minted: doc.minted,
    mintPrice: doc.mintPrice,
    creatorFee: doc.creatorFee,
    platformFee: doc.platformFee,
    rarities: doc.rarities,
    status:
      doc.status === "sold_out" || doc.minted >= doc.maxSupply
        ? ("Sold Out" as const)
        : doc.status === "draft"
          ? ("Upcoming" as const)
          : ("Minting" as const),
    createdAt: doc.createdAt,
    floorPrice: doc.floorPrice,
    volume: doc.volume,
    holders: doc.holders,
    trendingScore: doc.trendingScore,
    metadataBaseUri: doc.metadataBaseUri,
  };
}
