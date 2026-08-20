import { BaseRepository, nowIso } from "../../config/repository";
import { NFT_ASSETS_COLLECTION, NFT_ASSETS_INDEXES } from "./nft-assets.model";
import type { NftAssetDocument } from "./nft-assets.types";

class NftAssetsRepository extends BaseRepository<NftAssetDocument> {
  constructor() {
    super(NFT_ASSETS_COLLECTION, NFT_ASSETS_INDEXES);
  }

  listByCollection(collectionId: string) {
    return this.find({ collectionId }, { sort: { field: "tokenNumber", dir: "asc" } });
  }

  findByToken(collectionId: string, tokenNumber: number) {
    return this.findOne({ collectionId, tokenNumber });
  }

  countByCollection(collectionId: string) {
    return this.count({ collectionId });
  }

  patch(id: string, patch: Partial<NftAssetDocument>) {
    return this.updateById(id, { ...patch, updatedAt: nowIso() });
  }
}

export const nftAssetsRepository = new NftAssetsRepository();
