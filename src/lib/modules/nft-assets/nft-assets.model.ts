import { newId, nowIso } from "../../config/repository";
import type { IndexSpec } from "../../config/repository";
import type { CreateNftAssetInput, NftAssetDocument } from "./nft-assets.types";

export const NFT_ASSETS_COLLECTION = "nft_assets";

export const NFT_ASSETS_INDEXES: IndexSpec<NftAssetDocument>[] = [
  { fields: ["id"], unique: true },
  { fields: ["collectionId"] },
  { fields: ["collectionId", "tokenNumber"], unique: true },
  { fields: ["cid"] },
];

export function createNftAssetDocument(input: CreateNftAssetInput): NftAssetDocument {
  const timestamp = nowIso();
  return {
    id: newId("asset"),
    collectionId: input.collectionId,
    tokenNumber: input.tokenNumber,
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.size,
    imageUri: input.imageUri,
    metadataUri: input.metadataUri,
    cid: input.cid,
    status: input.status ?? "uploaded",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
