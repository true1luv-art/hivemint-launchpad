import type { NFTAttribute, Rarity } from "@/lib/types";

export type NftDocumentStatus = "owned" | "listed" | "burned";

export interface NftDocument {
  id: string;
  collectionId: string;
  collectionName: string;
  tokenId: number;
  name: string;
  description: string;
  image: string;
  owner: string;
  rarity: Rarity;
  mintNumber: number;
  maxSupply: number;
  metadataUri: string;
  attributes: NFTAttribute[];
  estimatedValue: number;
  status: NftDocumentStatus;
  /** transaction that produced this NFT — also the idempotency anchor */
  mintTransactionId: string;
  createdAt: string;
  updatedAt: string;
}
