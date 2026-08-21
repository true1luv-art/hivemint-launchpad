import { newId, nowIso } from "../../config/repository";
import type { IndexSpec } from "../../config/repository";
import { buildNFT, RANK_POOL_CAP } from "@/lib/mock-data";
import { generateInventory } from "@/lib/traits/generator";
import { buildCollectionTraitLayers } from "@/lib/traits/presets";
import type { TraitLayerConfig } from "@/lib/traits/types";
import type { Collection, NFTAttribute, Rarity } from "@/lib/types";
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
  if (collection.traitLayers?.length) return collection.traitLayers;
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
    mintState: "MINTED",
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

/* ------------------------------------------------------------------ */
/* imported collections                                                */
/* ------------------------------------------------------------------ */

/** Display label -> legacy 4-bucket rarity used by existing UI badges. */
export function toLegacyRarity(label: string): Rarity {
  switch (label) {
    case "Legendary":
    case "Epic":
    case "Rare":
      return label;
    default:
      return "Common";
  }
}

export interface ImportedNftInput {
  collection: CollectionDocument;
  tokenId: number;
  name: string;
  description: string;
  image: string;
  imageUri: string;
  metadataUri: string;
  assetId?: string | undefined;
  attributes: NFTAttribute[];
  rarityScore: number;
  rarityRank: number;
  rarityRankTotal: number;
  rarityClass: string;
  sourceMetadata: Record<string, unknown>;
}

/**
 * Registers an EXISTING imported NFT as an UNMINTED record.
 * Nothing is generated here: traits, name and image come from the creator's
 * metadata, and rarity was calculated from the collection's real distribution.
 */
export function createImportedNftDocument(input: ImportedNftInput): NftDocument {
  const timestamp = nowIso();
  return {
    id: newId("nft"),
    collectionId: input.collection.id,
    collectionName: input.collection.name,
    tokenId: input.tokenId,
    name: input.name,
    description: input.description,
    image: input.image,
    owner: "",
    mintState: "UNMINTED",
    imported: true,
    sourceMetadata: input.sourceMetadata,
    rarity: toLegacyRarity(input.rarityClass),
    rarityClassLabel: input.rarityClass,
    mintNumber: input.tokenId,
    maxSupply: input.collection.maxSupply,
    metadataUri: input.metadataUri,
    imageUri: input.imageUri,
    assetId: input.assetId,
    traits: input.attributes.map((attribute) => ({
      layerId: String(attribute.trait),
      layerName: String(attribute.trait),
      traitValueId: `${attribute.trait}:${attribute.value}`,
      traitValueName: String(attribute.value),
      weight: 0,
      probability: 0,
    })),
    rarityScore: input.rarityScore,
    rarityRank: input.rarityRank,
    rarityRankTotal: input.rarityRankTotal,
    attributes: input.attributes,
    estimatedValue: input.collection.mintPrice,
    status: "owned",
    mintTransactionId: "",
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
    rarityClassLabel: doc.rarityClassLabel ?? doc.rarity,
    mintState: doc.mintState ?? "MINTED",
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
