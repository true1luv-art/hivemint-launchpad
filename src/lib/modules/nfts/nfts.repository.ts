import { BaseRepository, nowIso } from "../../config/repository";
import { NFTS_COLLECTION, NFTS_INDEXES } from "./nfts.model";
import type { NftDocument, NftDocumentStatus } from "./nfts.types";

class NftsRepository extends BaseRepository<NftDocument> {
  constructor() {
    super(NFTS_COLLECTION, NFTS_INDEXES);
  }

  listAll() {
    return this.find(undefined, { sort: { field: "createdAt", dir: "desc" } });
  }

  listByOwner(owner: string) {
    return this.find({ owner }, { sort: { field: "createdAt", dir: "desc" } });
  }

  listByCollection(collectionId: string) {
    return this.find({ collectionId }, { sort: { field: "mintNumber", dir: "asc" } });
  }

  findByMintTransaction(mintTransactionId: string) {
    return this.findOne({ mintTransactionId });
  }

  patch(id: string, patch: Partial<NftDocument>) {
    return this.updateById(id, { ...patch, updatedAt: nowIso() });
  }

  setStatus(id: string, status: NftDocumentStatus) {
    return this.patch(id, { status });
  }

  transferOwnership(id: string, owner: string, estimatedValue?: number) {
    return this.patch(id, {
      owner,
      status: "owned",
      ...(estimatedValue === undefined ? {} : { estimatedValue }),
    });
  }

  async nextMintNumber(collectionId: string) {
    const existing = await this.find({ collectionId }, { sort: { field: "mintNumber", dir: "desc" }, limit: 1 });
    return (existing[0]?.mintNumber ?? 0) + 1;
  }

  async countHolders(collectionId: string) {
    const docs = await this.find({ collectionId });
    return new Set(docs.map((d) => d.owner)).size;
  }
}

export const nftsRepository = new NftsRepository();
