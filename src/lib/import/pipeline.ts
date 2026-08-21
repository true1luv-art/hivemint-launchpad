/**
 * Import pipeline.
 *
 * buildImportReport(): pure, browser-side analysis of the creator's package.
 * uploadImportedCollection(): pins the analysed package to (mock) IPFS and
 * returns the reference bundle for CREATE_COLLECTION.
 *
 * Nothing here generates NFTs — the records already exist.
 */
import { config } from "@/lib/config/config";
import { getStorageProvider } from "@/lib/storage/storage";
import { MockIPFSProvider } from "@/lib/storage/mock-ipfs";
import { buildCollectionMetadata } from "@/lib/storage/metadata";
import { mimeFromFilename } from "@/lib/storage/validation";
import type { StorageFileInput, StorageProvider } from "@/lib/storage/types";
import { StorageError } from "@/lib/storage/types";
import { matchImages, imageKey } from "./image-match";
import { assignRanks, buildFrequencyTable, calculateRarityScore, traitStatistics } from "./rarity";
import { resolveTokenIds, type TokenIdOptions } from "./token-id";
import { collapseIssues, validateImport } from "./validate";
import type { ImportIssue, ImportReport, ImportedNft, ParsedMetadataRecord } from "./types";

export interface BuildReportInput extends TokenIdOptions {
  records: ParsedMetadataRecord[];
  images: { name: string; previewUrl?: string | undefined }[];
  maxSupply: number;
  /** Issues produced while parsing the JSON files. */
  parseIssues?: ImportIssue[];
}

/** Analyses the imported package: matching, validation, rarity and stats. */
export function buildImportReport(input: BuildReportInput): ImportReport {
  const { records, images, maxSupply } = input;
  const filenames = images.map((i) => i.name);
  const previews = new Map(images.map((i) => [i.name, i.previewUrl]));

  const tokenIds = resolveTokenIds(records, { useImportOrder: input.useImportOrder ?? false });
  const { matched, missing, orphans } = matchImages(
    records.map((r) => r.image),
    filenames,
  );

  const issues = collapseIssues([
    ...(input.parseIssues ?? []),
    ...validateImport({
      records,
      tokenIds: tokenIds.map((t) => t.tokenId),
      matched,
      missing,
      orphans,
      imageFilenames: filenames,
      maxSupply,
    }),
  ]);

  // Rarity is calculated from the imported traits only.
  const table = buildFrequencyTable(records);
  const scored = records.map((record, index) => ({
    record,
    index,
    tokenId: tokenIds[index]?.tokenId ?? index + 1,
    source: tokenIds[index]?.source ?? "order",
    rarityScore: calculateRarityScore(table, record),
  }));
  const ranks = assignRanks(scored.map((s) => ({ tokenId: s.tokenId, rarityScore: s.rarityScore })));

  const nfts: ImportedNft[] = scored
    .map((entry) => {
      const filename = matched.get(entry.index);
      const rank = ranks.get(entry.tokenId);
      return {
        ...entry.record,
        tokenId: entry.tokenId,
        tokenIdSource: entry.source,
        imageKey: imageKey(entry.record.image),
        matchedFilename: filename,
        previewUrl: filename ? previews.get(filename) : undefined,
        rarityScore: entry.rarityScore,
        rarityRank: rank?.rarityRank ?? 0,
        rarityClass: rank?.rarityClass ?? config.rarity.fallbackClass,
      } satisfies ImportedNft;
    })
    .sort((a, b) => a.tokenId - b.tokenId);

  const traits = traitStatistics(table);
  const combinations = new Set(
    records.map((r) =>
      r.attributes
        .map((a) => `${a.trait_type}=${a.value}`)
        .sort()
        .join("|"),
    ),
  );

  const distribution = new Map<string, number>();
  for (const nft of nfts) distribution.set(nft.rarityClass, (distribution.get(nft.rarityClass) ?? 0) + 1);
  const order = [...config.rarity.classes.map((c) => c.name), config.rarity.fallbackClass];

  return {
    nfts,
    traits,
    statistics: {
      totalNfts: records.length,
      totalImages: filenames.length,
      matchedImages: matched.size,
      missingImages: missing.length,
      orphanImages: orphans.length,
      traitTypes: traits.length,
      uniqueTraitValues: traits.reduce((sum, t) => sum + t.uniqueValues, 0),
      uniqueCombinations: combinations.size,
      rarityDistribution: order
        .filter((name) => distribution.has(name))
        .map((name) => ({ rarityClass: name, count: distribution.get(name) ?? 0 })),
    },
    issues,
    ready: records.length > 0 && issues.every((i) => i.severity !== "error"),
  };
}

/* ------------------------------------------------------------------ */
/* storage                                                             */
/* ------------------------------------------------------------------ */

export interface ImportedAssetReference {
  tokenId: number;
  filename: string;
  mimeType: string;
  size: number;
  cid: string;
  imageUri: string;
  metadataUri: string;
}

export interface ImportedCollectionBundle {
  collectionImageUri: string;
  collectionMetadataUri: string;
  assetRootUri: string;
  metadataRootUri: string;
  items: ImportedAssetReference[];
}

export type UploadStage = "collection-image" | "images" | "metadata" | "done";

export interface UploadState {
  stage: UploadStage;
  completed: number;
  total: number;
  filename: string;
}

export interface UploadImportInput {
  name: string;
  symbol: string;
  description: string;
  creator: string;
  maxSupply: number;
  mintPrice: number;
  collectionImage: File;
  /** Uploaded NFT images keyed by their original filename. */
  imageFiles: Map<string, File>;
  nfts: ImportedNft[];
}

const toInput = async (file: File): Promise<StorageFileInput> => ({
  filename: file.name,
  mimeType: file.type || mimeFromFilename(file.name),
  content: new Uint8Array(await file.arrayBuffer()),
});

/** Large imports skip the simulated per-file latency so 2,500 files stay usable. */
function providerFor(fileCount: number): StorageProvider {
  return fileCount > 200 ? new MockIPFSProvider({ latency: 0 }) : getStorageProvider();
}

/**
 * Pins the imported package to (mock) IPFS.
 * The creator's metadata is stored VERBATIM apart from `image`, which is
 * rewritten to the pinned ipfs:// URI of the matching file.
 */
export async function uploadImportedCollection(
  input: UploadImportInput,
  onState?: (state: UploadState) => void,
): Promise<ImportedCollectionBundle> {
  const emit = (state: UploadState) => onState?.(state);
  const storage = providerFor(input.nfts.length);

  emit({ stage: "collection-image", completed: 0, total: 1, filename: input.collectionImage.name });
  const collectionImage = await storage.uploadFile(await toInput(input.collectionImage), { pin: true });

  // 1. NFT images as one directory -> a single asset root for the collection.
  const ordered = [...input.nfts].sort((a, b) => a.tokenId - b.tokenId);
  const files: StorageFileInput[] = [];
  for (const nft of ordered) {
    const file = nft.matchedFilename ? input.imageFiles.get(nft.matchedFilename) : undefined;
    if (!file) throw new StorageError(`No image file for token #${nft.tokenId}`);
    files.push(await toInput(file));
  }
  const imagesDir = await storage.uploadDirectory(`${input.symbol.toLowerCase()}-images`, files, {
    pin: true,
    onProgress: (p) => emit({ stage: "images", completed: p.completed, total: p.total, filename: p.filename }),
  });
  if (imagesDir.entries.length !== files.length) throw new StorageError("Some images failed to pin — retry");

  // 2. Imported metadata, image reference swapped for the pinned CID.
  const metadataFiles: StorageFileInput[] = ordered.map((nft, index) => ({
    filename: `${nft.tokenId}.json`,
    mimeType: "application/json",
    content: JSON.stringify({ ...nft.raw, image: imagesDir.entries[index]!.uri }, null, 2),
  }));
  emit({ stage: "metadata", completed: 0, total: metadataFiles.length, filename: "metadata" });
  const metadataDir = await storage.uploadDirectory(`${input.symbol.toLowerCase()}-metadata`, metadataFiles, {
    pin: true,
    onProgress: (p) => emit({ stage: "metadata", completed: p.completed, total: p.total, filename: p.filename }),
  });

  // 3. Collection-level metadata (kept strictly separate from NFT metadata).
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

  emit({ stage: "done", completed: ordered.length, total: ordered.length, filename: "" });

  return {
    collectionImageUri: collectionImage.uri,
    collectionMetadataUri: collectionMetadata.uri,
    assetRootUri: imagesDir.uri,
    metadataRootUri: metadataDir.uri,
    items: ordered.map((nft, index) => {
      const entry = imagesDir.entries[index]!;
      return {
        tokenId: nft.tokenId,
        filename: entry.filename,
        mimeType: entry.mimeType,
        size: entry.size,
        cid: entry.cid,
        imageUri: entry.uri,
        metadataUri: metadataDir.entries[index]!.uri,
      };
    }),
  };
}
