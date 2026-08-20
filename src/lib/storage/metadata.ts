/**
 * Metadata builders.
 *
 * Two clearly distinct documents:
 *  - COLLECTION metadata: name, symbol, description, image
 *  - NFT metadata:        name, description, image, attributes
 *
 * Both are uploaded through the `StorageProvider`; the canonical `image` field
 * always references `ipfs://…`, never an HTTP gateway URL.
 */
import type { NFTAttribute } from "@/lib/types";

export interface CollectionMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  external_url?: string;
  properties?: Record<string, unknown>;
}

export interface NftMetadata {
  name: string;
  description: string;
  image: string;
  attributes: NFTAttribute[];
  properties?: Record<string, unknown>;
}

export function buildCollectionMetadata(input: {
  name: string;
  symbol: string;
  description: string;
  imageUri: string;
  maxSupply: number;
  mintPrice: number;
  creator: string;
}): CollectionMetadata {
  return {
    name: input.name,
    symbol: input.symbol,
    description: input.description,
    image: input.imageUri,
    properties: {
      maxSupply: input.maxSupply,
      mintPrice: input.mintPrice,
      currency: "HIVE",
      creator: input.creator,
      chain: "hive",
    },
  };
}

export function buildNftMetadata(input: {
  collectionName: string;
  tokenNumber: number;
  description: string;
  imageUri: string;
  attributes?: NFTAttribute[];
}): NftMetadata {
  return {
    name: `${input.collectionName} #${input.tokenNumber}`,
    description: input.description,
    image: input.imageUri,
    attributes: input.attributes ?? [],
    properties: { tokenNumber: input.tokenNumber, chain: "hive" },
  };
}

/** Metadata filename convention inside the metadata directory: `1.json`. */
export const metadataFilename = (tokenNumber: number) => `${tokenNumber}.json`;
