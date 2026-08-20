import { newId, nowIso } from "../../config/repository";
import type { IndexSpec } from "../../config/repository";
import type { TraitLayerDocument } from "./nft-trait-layers.types";

export const TRAIT_LAYERS_COLLECTION = "nft_trait_layers";

export const TRAIT_LAYERS_INDEXES: IndexSpec<TraitLayerDocument>[] = [
  { fields: ["id"], unique: true },
  { fields: ["collectionId"] },
  { fields: ["collectionId", "name"], unique: true },
];

export function createTraitLayerDocument(input: {
  id?: string;
  collectionId: string;
  name: string;
  order: number;
  enabled?: boolean;
}): TraitLayerDocument {
  const timestamp = nowIso();
  return {
    id: input.id ?? newId("layer"),
    collectionId: input.collectionId,
    name: input.name,
    order: input.order,
    enabled: input.enabled ?? true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
