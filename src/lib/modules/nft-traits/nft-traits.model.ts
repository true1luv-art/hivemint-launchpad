import { newId, nowIso } from "../../config/repository";
import type { IndexSpec } from "../../config/repository";
import type { GeneratedTrait } from "@/lib/traits/types";
import type { NftTraitDocument } from "./nft-traits.types";

export const NFT_TRAITS_COLLECTION = "nft_traits";

export const NFT_TRAITS_INDEXES: IndexSpec<NftTraitDocument>[] = [
  { fields: ["id"], unique: true },
  { fields: ["nftId"] },
  { fields: ["collectionId"] },
  { fields: ["traitValueId"] },
];

export function createNftTraitDocuments(input: {
  nftId: string;
  collectionId: string;
  traits: GeneratedTrait[];
}): NftTraitDocument[] {
  const timestamp = nowIso();
  return input.traits.map((trait) => ({
    id: newId("nfttrait"),
    nftId: input.nftId,
    collectionId: input.collectionId,
    layerId: trait.layerId,
    layerName: trait.layerName,
    traitValueId: trait.traitValueId,
    traitValueName: trait.traitValueName,
    weight: trait.weight,
    probability: trait.probability,
    createdAt: timestamp,
  }));
}

/** Trait records -> the in-memory shape used by the generator and the UI. */
export function toGeneratedTraits(docs: NftTraitDocument[]): GeneratedTrait[] {
  return docs.map((doc) => ({
    layerId: doc.layerId,
    layerName: doc.layerName,
    traitValueId: doc.traitValueId,
    traitValueName: doc.traitValueName,
    weight: doc.weight,
    probability: doc.probability,
  }));
}
