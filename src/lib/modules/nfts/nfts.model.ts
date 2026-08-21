import { newId, nowIso } from "../../config/repository";
import type { IndexSpec } from "../../config/repository";
import { buildNFT, RANK_POOL_CAP } from "@/lib/mock-data";
import { generateInventory } from "@/lib/traits/generator";
import { buildCollectionTraitLayers } from "@/lib/traits/presets";
import type { TraitLayerConfig } from "@/lib/traits/types";
import type { Collection } from "@/lib/types";
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
  mintTransactionId: string;
  seedKey?: string | undefined;
  /** Optional explicit trait configuration; defaults to the collection preset. */
  traitLayers?: TraitLayerConfig[] | undefined;
}

/** The trait configuration a collection generates from. */
export function collectionTraitLayers(collection: CollectionDocument): TraitLayerConfig[] {
  return buildCollectionTraitLayers(collection.id, collection.name.split(" ").filter(Boolean));
}

/**
 * Builds an NFT index document.
 *
 * Rarity is NEVER an input: traits are rolled from the collection's weighted
 * layers, scored, then ranked against a deterministic pool of the collection.
 */
export function createNftDocument(input: BuildNftInput): NftDocument {
  const timestamp = nowIso();
  const layers = input.traitLayers ?? collectionTraitLayers(input.collection);
  const seedKey = input.seedKey ?? `${input.collection.id}-${input.mintNumber}`;
  const view = { ...toCollectionView(input.collection), traitLayers: layers } as Collection;

  const poolSize = Math.max(1, Math.min(input.collection.maxSupply, RANK_POOL_CAP));
  const inventory = generateInventory({ layers, count: poolSize, seedKey });
  const token = { ...inventory.tokens[0]!, tokenNumber: input.mintNumber };

  const base = buildNFT({
    collection: view,
    mintNumber: input.mintNumber,
    owner: input.owner,
    createdAt: timestamp,
    token,
    rankTotal: poolSize,
    seedKey,
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
    rarity: base.rarityClass,
    mintNumber: input.mintNumber,
    maxSupply: input.collection.maxSupply,
    metadataUri: base.metadataUri,
    traits: base.traits,
    rarityScore: base.rarityScore,
    rarityRank: base.rarityRank,
    rarityRankTotal: base.rarityRankTotal,
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
    traits: doc.traits,
    rarityScore: doc.rarityScore,
    rarityRank: doc.rarityRank,
    rarityRankTotal: doc.rarityRankTotal,
    rarityClass: doc.rarity,
    mintNumber: doc.mintNumber,
    maxSupply: doc.maxSupply,
    owner: doc.owner,
    attributes: doc.attributes,
    metadataUri: doc.metadataUri,
    imageUri: doc.imageUri,
    estimatedValue: doc.estimatedValue,
    createdAt: doc.createdAt,
    status: doc.status === "listed" ? ("Listed" as const) : ("Owned" as const),
  };
}
