import { BaseRepository, nowIso } from "../../config/repository";
import { TRAIT_VALUES_COLLECTION, TRAIT_VALUES_INDEXES } from "./nft-trait-values.model";
import type { TraitValueDocument } from "./nft-trait-values.types";

class NftTraitValuesRepository extends BaseRepository<TraitValueDocument> {
  constructor() {
    super(TRAIT_VALUES_COLLECTION, TRAIT_VALUES_INDEXES);
  }

  listByCollection(collectionId: string) {
    return this.find({ collectionId }, { sort: { field: "name", dir: "asc" } });
  }

  listByLayer(layerId: string) {
    return this.find({ layerId }, { sort: { field: "weight", dir: "desc" } });
  }

  countByCollection(collectionId: string) {
    return this.count({ collectionId });
  }

  patch(id: string, patch: Partial<TraitValueDocument>) {
    return this.updateById(id, { ...patch, updatedAt: nowIso() });
  }

  async replaceForCollection(collectionId: string, values: TraitValueDocument[]) {
    const existing = await this.listByCollection(collectionId);
    for (const value of existing) await this.deleteById(value.id);
    if (values.length) await this.insertMany(values);
    return values;
  }
}

export const nftTraitValuesRepository = new NftTraitValuesRepository();
