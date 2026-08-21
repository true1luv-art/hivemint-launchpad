import { BaseRepository, nowIso } from "../../config/repository";
import { NFTS_COLLECTION, NFTS_INDEXES } from "./nfts.model";
import type { NftDocument, NftDocumentStatus } from "./nfts.types";

class NftsRepository extends BaseRepository<NftDocument> {
  constructor() {
    super(NFTS_COLLECTION, NFTS_INDEXES);
  }

  listAll() {
    return this.find({ mintState: "MINTED" }, { sort: { field: "createdAt", dir: "desc" } });
  }

  /** Imported records still waiting to be minted, lowest token id first. */
  listUnminted(collectionId: string) {
    return this.find(
      { collectionId, mintState: "UNMINTED" },
      { sort: { field: "tokenId", dir: "asc" }, limit: 1000 },
    );
  }

  countUnminted(collectionId: string) {
    return this.count({ collectionId, mintState: "UNMINTED" });
  }

  /**
   * Atomically claims one EXISTING unminted NFT for a buyer.
   * The platform never generates a token here — it hands over one that the
   * creator already imported.
   */
  async claimUnminted(collectionId: string, owner: string, mintTransactionId: string) {
    const next = (await this.listUnminted(collectionId))[0];
    if (!next) return null;
    return this.findOneAndUpdate(
      { id: next.id, mintState: "UNMINTED" },
      { mintState: "MINTED", owner, mintTransactionId, status: "owned", updatedAt: nowIso() },
    );
  }

  listByOwner(owner: string) {
    return this.find({ owner }, { sort: { field: "createdAt", dir: "desc" } });
  }

  listByCollection(collectionId: string) {
    return this.find({ collectionId, mintState: "MINTED" }, { sort: { field: "mintNumber", dir: "asc" } });
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
    const docs = await this.find({ collectionId, mintState: "MINTED" });
    return new Set(docs.map((d) => d.owner)).size;
  }
}

export const nftsRepository = new NftsRepository();
