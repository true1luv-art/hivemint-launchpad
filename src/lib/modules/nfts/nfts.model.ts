import { newId, nowIso } from "../../config/repository";
import type { IndexSpec } from "../../config/repository";
import { buildNFT } from "@/lib/mock-data";
import type { Collection, Rarity } from "@/lib/types";
import type { CollectionDocument } from "../nft-collections/nft-collections.types";
import { toCollectionView } from "../nft-collections/nft-collections.model";
import type { NftDocument } from "./nfts.types";

export const NFTS_COLLECTION = "nfts";

export const NFTS_INDEXES: IndexSpec<NftDocument>[] = [
  { fields: ["id"], unique: true },
  { fields: ["collectionId"] },
  { fields: ["owner"] },
  { fields: ["collectionId", "tokenId"], unique: true },
  { fields: ["mintTransactionId"] },
];

export interface BuildNftInput {
  collection: CollectionDocument;
  mintNumber: number;
  owner: string;
  rarity: Rarity;
  mintTransactionId: string;
  seedKey?: string | undefined;
}

/**
 * Builds an NFT index document. Artwork/traits are deterministic so the same
 * token always renders identically across processes.
 */
export function createNftDocument(input: BuildNftInput): NftDocument {
  const timestamp = nowIso();
  const view = toCollectionView(input.collection) as Collection;
  const base = buildNFT({
    collection: view,
    mintNumber: input.mintNumber,
    owner: input.owner,
    rarity: input.rarity,
    createdAt: timestamp,
    seedKey: input.seedKey ?? `${input.collection.id}-${input.mintNumber}`,
  });

  return {
    id: newId("nft"),
    collectionId: input.collection.id,
    collectionName: input.collection.name,
    tokenId: base.tokenId,
    name: base.name,
    description: base.description,
    image: base.image,
    owner: input.owner,
    rarity: input.rarity,
    mintNumber: input.mintNumber,
    maxSupply: input.collection.maxSupply,
    metadataUri: base.metadataUri,
    attributes: base.attributes,
    estimatedValue: base.estimatedValue,
    status: "owned",
    mintTransactionId: input.mintTransactionId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/** Maps a persisted NFT to the Phase 1 UI shape. */
export function toNftView(doc: NftDocument) {
  return {
    id: doc.id,
    collectionId: doc.collectionId,
    collectionName: doc.collectionName,
    tokenId: doc.tokenId,
    name: doc.name,
    description: doc.description,
    image: doc.image,
    rarity: doc.rarity,
    mintNumber: doc.mintNumber,
    maxSupply: doc.maxSupply,
    owner: doc.owner,
    attributes: doc.attributes,
    metadataUri: doc.metadataUri,
    estimatedValue: doc.estimatedValue,
    createdAt: doc.createdAt,
    status: doc.status === "listed" ? ("Listed" as const) : ("Owned" as const),
  };
}
