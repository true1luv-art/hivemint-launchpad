/**
 * Collection asset upload pipeline (Phase 2.5B).
 *
 * Runs in the browser during collection creation:
 *   validate -> upload images -> build metadata -> upload metadata ->
 *   return an IPFS-reference bundle
 *
 * The result is the ONLY thing sent to the backend — file bytes never leave
 * this module.
 */
import { getStorageProvider } from "./storage";
import { buildCollectionMetadata, buildNftMetadata, metadataFilename } from "./metadata";
import {
  mimeFromFilename,
  tokenNumberFromFilename,
  validateCollectionAsset,
  validateNftAssets,
  validateSupplyCoverage,
  type ValidationIssue,
} from "./validation";
import { StorageError, type StorageFileInput, type UploadProgress } from "./types";
import type { NFTAttribute } from "@/lib/types";

export interface UploadedAsset {
  tokenNumber: number;
  filename: string;
  mimeType: string;
  size: number;
  cid: string;
  imageUri: string;
  metadataUri: string;
  /** Local object URL for previews — never persisted. */
  previewUrl?: string;
}

export interface CollectionAssetBundle {
  collectionImageUri: string;
  collectionMetadataUri: string;
  assetRootUri: string;
  metadataRootUri: string;
  reusableAssets: boolean;
  items: UploadedAsset[];
}

export interface UploadPipelineInput {
  name: string;
  symbol: string;
  description: string;
  creator: string;
  maxSupply: number;
  mintPrice: number;
  reusableAssets: boolean;
  collectionImage: File;
  nftAssets: File[];
  attributesFor?: (tokenNumber: number) => NFTAttribute[];
}

export type UploadStage = "validating" | "collection-image" | "assets" | "metadata" | "done";

export interface UploadState {
  stage: UploadStage;
  completed: number;
  total: number;
  filename: string;
}

const toInput = async (file: File): Promise<StorageFileInput> => ({
  filename: file.name,
  mimeType: file.type || mimeFromFilename(file.name),
  content: new Uint8Array(await file.arrayBuffer()),
});

export class AssetValidationError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    super(issues.map((i) => `${i.filename}: ${i.message}`).join("; "));
    this.name = "StorageValidationError";
  }
}

export function validateUploadInput(input: UploadPipelineInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [
    ...validateCollectionAsset(input.collectionImage).issues,
    ...validateNftAssets(input.nftAssets).issues,
    ...validateSupplyCoverage(input.nftAssets.length, input.maxSupply, input.reusableAssets).issues,
  ];
  return issues;
}

/** Uploads every asset and returns the reference bundle for CREATE_COLLECTION. */
export async function uploadCollectionAssets(
  input: UploadPipelineInput,
  onState?: (state: UploadState) => void,
): Promise<CollectionAssetBundle> {
  const emit = (state: UploadState) => onState?.(state);
  emit({ stage: "validating", completed: 0, total: input.nftAssets.length, filename: "" });

  const issues = validateUploadInput(input);
  if (issues.length) throw new AssetValidationError(issues);

  const storage = getStorageProvider();

  // 1. Collection artwork
  emit({ stage: "collection-image", completed: 0, total: 1, filename: input.collectionImage.name });
  const collectionImage = await storage.uploadFile(await toInput(input.collectionImage), { pin: true });

  // 2. NFT images as one directory (so the collection has a single asset root)
  const files = await Promise.all(input.nftAssets.map(toInput));
  const assetsDir = await storage.uploadDirectory(`${input.symbol.toLowerCase()}-assets`, files, {
    pin: true,
    onProgress: (p: UploadProgress) =>
      emit({ stage: "assets", completed: p.completed, total: p.total, filename: p.filename }),
  });
  if (assetsDir.entries.length !== files.length) {
    throw new StorageError("Some assets failed to upload — retry the upload");
  }

  // 3. Per-token metadata, then the metadata directory
  const items: UploadedAsset[] = assetsDir.entries.map((entry, index) => ({
    tokenNumber: tokenNumberFromFilename(entry.filename, index + 1),
    filename: entry.filename,
    mimeType: entry.mimeType,
    size: entry.size,
    cid: entry.cid,
    imageUri: entry.uri,
    metadataUri: "",
  }));

  const metadataFiles: StorageFileInput[] = items.map((item) => ({
    filename: metadataFilename(item.tokenNumber),
    mimeType: "application/json",
    content: JSON.stringify(
      buildNftMetadata({
        collectionName: input.name,
        tokenNumber: item.tokenNumber,
        description: input.description,
        imageUri: item.imageUri,
        attributes: input.attributesFor?.(item.tokenNumber) ?? [],
      }),
      null,
      2,
    ),
  }));

  emit({ stage: "metadata", completed: 0, total: metadataFiles.length, filename: "metadata" });
  const metadataDir = await storage.uploadDirectory(`${input.symbol.toLowerCase()}-metadata`, metadataFiles, {
    pin: true,
    onProgress: (p) => emit({ stage: "metadata", completed: p.completed, total: p.total, filename: p.filename }),
  });

  metadataDir.entries.forEach((entry, index) => {
    const item = items[index];
    if (item) item.metadataUri = entry.uri;
  });

  // 4. Collection-level metadata document
  const collectionMetadata = await storage.uploadJson(
    "collection.json",
    buildCollectionMetadata({
      name: input.name,
      symbol: input.symbol,
      description: input.description,
      imageUri: collectionImage.uri,
      maxSupply: input.maxSupply,
      mintPrice: input.mintPrice,
      creator: input.creator,
    }),
    { pin: true },
  );

  emit({ stage: "done", completed: items.length, total: items.length, filename: "" });

  return {
    collectionImageUri: collectionImage.uri,
    collectionMetadataUri: collectionMetadata.uri,
    assetRootUri: assetsDir.uri,
    metadataRootUri: metadataDir.uri,
    reusableAssets: input.reusableAssets,
    items,
  };
}
