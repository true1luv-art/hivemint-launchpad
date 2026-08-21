import { z } from "zod";

import { validateTraitConfig, type TraitLayerConfig } from "@/lib/traits";

const hiveAccount = z
  .string()
  .trim()
  .transform((value) => value.replace(/^@/, "").toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9.-]{3,16}$/, "Invalid Hive account name"));

const requestId = z.string().trim().min(8).max(120);

export const raritySchema = z.object({
  rarity: z.enum(["Common", "Rare", "Epic", "Legendary"]),
  weight: z.number().min(0).max(100),
});

const ipfsUri = z
  .string()
  .trim()
  .regex(/^ipfs:\/\/[a-zA-Z0-9]{10,}(\/.+)?$/, "Must be a canonical ipfs:// URI");

export const assetReferenceSchema = z.object({
  tokenNumber: z.number().int().min(1),
  filename: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(3).max(80),
  size: z.number().int().min(0),
  imageUri: ipfsUri,
  metadataUri: ipfsUri,
  cid: z.string().trim().min(10).max(120),
});

/** Reference-only asset bundle — raw file data is never accepted here. */
export const collectionAssetsSchema = z.object({
  collectionImageUri: ipfsUri,
  collectionMetadataUri: ipfsUri,
  assetRootUri: ipfsUri,
  metadataRootUri: ipfsUri,
  reusableAssets: z.boolean().default(false),
  items: z.array(assetReferenceSchema).min(1).max(100_000),
});

export const traitValueSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(80),
  weight: z.number().finite().min(0).max(1_000_000),
  enabled: z.boolean().default(true),
  assetId: z.string().trim().min(1).max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const traitLayerSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(80),
  order: z.number().int().min(0).max(999),
  enabled: z.boolean().default(true),
  values: z.array(traitValueSchema).min(1).max(500),
});

export const createCollectionSchema = z.object({
  requestId,
  name: z.string().trim().min(3).max(60),
  symbol: z
    .string()
    .trim()
    .min(2)
    .max(10)
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]+$/, "Symbol must be alphanumeric")),
  description: z.string().trim().min(10).max(600),
  image: z.string().trim().max(500).optional(),
  maxSupply: z.number().int().min(1).max(100_000),
  mintPrice: z.number().min(0).max(1_000_000),
  creatorFee: z.number().min(0).max(50),
  platformFee: z.number().min(0).max(50),
  rarities: z.array(raritySchema).min(1).max(10),
  traitLayers: z.array(traitLayerSchema).min(1).max(50),
  metadataBaseUri: z.string().trim().max(300).optional(),
  assets: collectionAssetsSchema,
}).superRefine((data, ctx) => {
  // Weights, layers and combination coverage are validated by one engine.
  for (const issue of validateTraitConfig(data.traitLayers as TraitLayerConfig[], data.maxSupply)) {
    ctx.addIssue({ code: "custom", path: ["traitLayers"], message: issue.message });
  }
});

export const mintSchema = z.object({
  requestId,
  collectionId: z.string().trim().min(1),
  quantity: z.number().int().min(1).max(10).default(1),
});

export const listSchema = z.object({
  requestId,
  nftId: z.string().trim().min(1),
  price: z.number().min(0.001).max(1_000_000),
});

export const buySchema = z.object({
  requestId,
  listingId: z.string().trim().min(1),
});

export const cancelSchema = buySchema;

export const transferSchema = z.object({
  requestId,
  nftId: z.string().trim().min(1),
  to: hiveAccount,
});

export type CreateCollectionBody = z.infer<typeof createCollectionSchema>;
export type MintBody = z.infer<typeof mintSchema>;
export type ListBody = z.infer<typeof listSchema>;
export type BuyBody = z.infer<typeof buySchema>;
export type TransferBody = z.infer<typeof transferSchema>;
