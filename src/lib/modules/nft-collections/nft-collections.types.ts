import type { RarityConfig } from "@/lib/types";

export type CollectionDocumentStatus = "draft" | "active" | "paused" | "sold_out" | "completed";

export interface CollectionDocument {
  id: string;
  name: string;
  symbol: string;
  description: string;
  image: string;
  creator: string;
  maxSupply: number;
  minted: number;
  mintPrice: number;
  currency: "HIVE";
  creatorFee: number;
  platformFee: number;
  rarities: RarityConfig[];
  metadataBaseUri: string;
  status: CollectionDocumentStatus;
  /** indexed market stats (derived; blockchain wins in Phase 3) */
  floorPrice: number;
  volume: number;
  holders: number;
  trendingScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCollectionInput {
  name: string;
  symbol: string;
  description: string;
  image?: string | undefined;
  creator: string;
  maxSupply: number;
  mintPrice: number;
  creatorFee: number;
  platformFee: number;
  rarities: RarityConfig[];
  metadataBaseUri?: string | undefined;
}
