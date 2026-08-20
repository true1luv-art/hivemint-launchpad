import { newId, nowIso } from "../../config/repository";
import type { IndexSpec } from "../../config/repository";
import type { TraitValueDocument } from "./nft-trait-values.types";

export const TRAIT_VALUES_COLLECTION = "nft_trait_values";

export const TRAIT_VALUES_INDEXES: IndexSpec<TraitValueDocument>[] = [
  { fields: ["id"], unique: true },
  { fields: ["collectionId"] },
  { fields: ["layerId"] },
];

export function createTraitValueDocument(input: {
  id?: string;
  collectionId: string;
  layerId: string;
  name: string;
  weight: number;
  enabled?: boolean;
  assetId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}): TraitValueDocument {
  const timestamp = nowIso();
  return {
    id: input.id ?? newId("trait"),
    collectionId: input.collectionId,
    layerId: input.layerId,
    name: input.name,
    weight: input.weight,
    enabled: input.enabled ?? true,
    assetId: input.assetId,
    metadata: input.metadata,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
