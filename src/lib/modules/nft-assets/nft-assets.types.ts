import type { AssetStatus } from "@/lib/storage/types";

/**
 * Application-side index of collection assets.
 *
 * IMPORTANT: this table stores REFERENCES only. The bytes conceptually live on
 * IPFS (mocked in Phase 2.5B) and the ownership record lives on the chain.
 */
export interface NftAssetDocument {
  id: string;
  collectionId: string;
  /** 1-based token number this asset will be attached to when minted. */
  tokenNumber: number;
  filename: string;
  mimeType: string;
  size: number;
  /** `ipfs://…` of the image. */
  imageUri: string;
  /** `ipfs://…` of the NFT metadata JSON. */
  metadataUri: string;
  /** CID of the image (the metadata CID is embedded in `metadataUri`). */
  cid: string;
  status: AssetStatus;
  error?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNftAssetInput {
  collectionId: string;
  tokenNumber: number;
  filename: string;
  mimeType: string;
  size: number;
  imageUri: string;
  metadataUri: string;
  cid: string;
  status?: AssetStatus;
}
