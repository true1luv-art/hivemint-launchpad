/**
 * Normalised trait records for generated NFTs — the source of truth behind
 * every NFT's metadata attributes and rarity score.
 */
export interface NftTraitDocument {
  id: string;
  nftId: string;
  collectionId: string;
  layerId: string;
  layerName: string;
  traitValueId: string;
  traitValueName: string;
  weight: number;
  /** Normalised probability of the selected value inside its layer (0-1). */
  probability: number;
  createdAt: string;
}
