import type { GeneratedTrait, TraitLayerConfig } from "./traits/types";

/**
 * Rarity is a DERIVED display bucket, never a generation input.
 * It is computed from the collection-wide rarity rank.
 */
export type Rarity = "Common" | "Rare" | "Epic" | "Legendary";

export const RARITIES: Rarity[] = ["Common", "Rare", "Epic", "Legendary"];

/**
 * @deprecated Legacy rarity-first configuration. Retained only so old records
 * keep deserialising — new collections configure `traitLayers` instead.
 */
export interface RarityConfig {
  rarity: Rarity;
  /** percentage, 0-100 */
  weight: number;
}

export interface User {
  username: string;
  displayName: string;
  avatarSeed: string;
}

export type CollectionStatus = "Minting" | "Sold Out" | "Upcoming";

export interface CollectionSettings {
  metadataBaseUri: string;
  symbol: string;
  creatorFee: number;
  platformFee: number;
}

export interface Collection {
  id: string;
  name: string;
  symbol: string;
  creator: string;
  description: string;
  image: string;
  maxSupply: number;
  minted: number;
  mintPrice: number;
  creatorFee: number;
  platformFee: number;
  /** @deprecated superseded by `traitLayers`; kept for legacy records. */
  rarities: RarityConfig[];
  /** Generative configuration: layers -> values -> weights. */
  traitLayers: TraitLayerConfig[];
  status: CollectionStatus;
  createdAt: string;
  floorPrice: number;
  volume: number;
  holders: number;
  trendingScore: number;
  metadataBaseUri: string;
  /** IPFS references produced by the asset upload pipeline (Phase 2.5B). */
  storage?: {
    collectionImageUri: string;
    collectionMetadataUri: string;
    assetRootUri: string;
    metadataRootUri: string;
    assetCount: number;
    reusableAssets: boolean;
  };
}

export interface NFTAttribute {
  trait: string;
  value: string | number;
}

export type NFTStatus = "Owned" | "Listed";

export interface NFT {
  id: string;
  collectionId: string;
  collectionName: string;
  tokenId: number;
  name: string;
  description: string;
  image: string;
  /** Derived display bucket — see `rarityClass`. */
  rarity: Rarity;
  /** The actual generated traits behind this token. */
  traits: GeneratedTrait[];
  /** Sum of 1 / probability across every trait. */
  rarityScore: number;
  /** 1 = rarest in the collection. */
  rarityRank: number;
  /** Size of the ranked pool the rank was computed against. */
  rarityRankTotal: number;
  rarityClass: Rarity;
  mintNumber: number;
  maxSupply: number;
  owner: string;
  attributes: NFTAttribute[];
  metadataUri: string;
  estimatedValue: number;
  createdAt: string;
  status: NFTStatus;
}

export interface Listing {
  id: string;
  nftId: string;
  seller: string;
  price: number;
  currency: "HIVE";
  listedAt: string;
  featured: boolean;
}

export type TransactionType = "mint" | "list" | "sale" | "transfer" | "collection_create" | "cancel";

export interface Transaction {
  id: string;
  txId: string;
  type: TransactionType;
  from: string;
  to: string;
  amount: number;
  memo: string;
  createdAt: string;
}

export type ActivityType = "Minted" | "Listed" | "Sold" | "Transferred" | "Collection Created" | "Delisted";

export interface Activity {
  id: string;
  type: ActivityType;
  actor: string;
  target?: string;
  nftId?: string;
  collectionId?: string;
  label: string;
  amount?: number;
  txId?: string;
  createdAt: string;
}
