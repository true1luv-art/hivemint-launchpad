import { BaseRepository, nowIso } from "../../config/repository";
import { TRAIT_LAYERS_COLLECTION, TRAIT_LAYERS_INDEXES } from "./nft-trait-layers.model";
import type { TraitLayerDocument } from "./nft-trait-layers.types";

class NftTraitLayersRepository extends BaseRepository<TraitLayerDocument> {
  constructor() {
    super(TRAIT_LAYERS_COLLECTION, TRAIT_LAYERS_INDEXES);
  }

  listByCollection(collectionId: string) {
    return this.find({ collectionId }, { sort: { field: "order", dir: "asc" } });
  }

  countByCollection(collectionId: string) {
    return this.count({ collectionId });
  }

  patch(id: string, patch: Partial<TraitLayerDocument>) {
    return this.updateById(id, { ...patch, updatedAt: nowIso() });
  }

  async replaceForCollection(collectionId: string, layers: TraitLayerDocument[]) {
    const existing = await this.listByCollection(collectionId);
    for (const layer of existing) await this.deleteById(layer.id);
    if (layers.length) await this.insertMany(layers);
    return layers;
  }
}

export const nftTraitLayersRepository = new NftTraitLayersRepository();
