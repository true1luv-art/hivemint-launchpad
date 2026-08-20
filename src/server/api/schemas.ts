import { z } from "zod";

const hiveAccount = z
  .string()
  .trim()
  .transform((value) => value.replace(/^@/, "").toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9.-]{3,16}$/, "Invalid Hive account name"));

const requestId = z.string().trim().min(8).max(120);

export const raritySchema = z.object({
  rarity: z.enum(["Common", "Uncommon", "Rare", "Epic", "Legendary"]),
  weight: z.number().min(0).max(100),
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
  metadataBaseUri: z.string().trim().max(300).optional(),
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
