import { BaseRepository } from "../../config/repository";
import { NFT_TRAITS_COLLECTION, NFT_TRAITS_INDEXES, toGeneratedTraits } from "./nft-traits.model";
import type { NftTraitDocument } from "./nft-traits.types";

class NftTraitsRepository extends BaseRepository<NftTraitDocument> {
  constructor() {
    super(NFT_TRAITS_COLLECTION, NFT_TRAITS_INDEXES);
  }

  listByNft(nftId: string) {
    return this.find({ nftId });
  }

  listByCollection(collectionId: string) {
    return this.find({ collectionId });
  }

  async generatedTraitsFor(nftId: string) {
    return toGeneratedTraits(await this.listByNft(nftId));
  }

  /** Counts of every trait value across a collection, for rarity tables. */
  async valueCounts(collectionId: string): Promise<Map<string, number>> {
    const docs = await this.listByCollection(collectionId);
    const counts = new Map<string, number>();
    for (const doc of docs) counts.set(doc.traitValueId, (counts.get(doc.traitValueId) ?? 0) + 1);
    return counts;
  }

  async deleteByNft(nftId: string) {
    const docs = await this.listByNft(nftId);
    for (const doc of docs) await this.deleteById(doc.id);
    return docs.length;
  }
}

export const nftTraitsRepository = new NftTraitsRepository();
