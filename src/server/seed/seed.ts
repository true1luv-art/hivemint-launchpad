/**
 * Database seeding.
 *
 * Converts the deterministic mock catalogue into MongoDB-shaped index
 * documents. Safe to run repeatedly — it is a no-op when data already exists
 * unless `force` is passed.
 */
import { logger } from "@/lib/config/logger";
import { nowIso } from "@/lib/config/repository";
import { createSeedData, CURRENT_USER, USERS } from "@/lib/mock-data";
import { activityRepository } from "@/lib/modules/activity/activity.repository";
import { nftCollectionsRepository } from "@/lib/modules/nft-collections/nft-collections.repository";
import { mockCid } from "@/lib/storage/mock-ipfs";
import { nftAssetsRepository } from "@/lib/modules/nft-assets/nft-assets.repository";
import { nftsRepository } from "@/lib/modules/nfts/nfts.repository";
import { marketplaceListingsRepository } from "@/lib/modules/marketplace-listings/marketplace-listings.repository";
import { transactionsPendingRepository } from "@/lib/modules/transactions-pending/transactions-pending.repository";
import { transactionsProcessedRepository } from "@/lib/modules/transactions-processed/transactions-processed.repository";
import { usersRepository } from "@/lib/modules/users/users.repository";
import type { CollectionDocument } from "@/lib/modules/nft-collections/nft-collections.types";
import type { NftDocument } from "@/lib/modules/nfts/nfts.types";
import type { MarketplaceListingDocument } from "@/lib/modules/marketplace-listings/marketplace-listings.types";
import type { ActivityDocument } from "@/lib/modules/activity/activity.types";

export interface SeedResult {
  seeded: boolean;
  counts: Record<string, number>;
}

export async function seedDatabase(options: { force?: boolean } = {}): Promise<SeedResult> {
  const existing = await nftCollectionsRepository.count();
  if (existing > 0 && !options.force) {
    return { seeded: false, counts: await currentCounts() };
  }

  if (options.force) {
    await Promise.all([
      nftCollectionsRepository.clear(),
      nftsRepository.clear(),
      marketplaceListingsRepository.clear(),
      activityRepository.clear(),
      usersRepository.clear(),
      transactionsPendingRepository.clear(),
      transactionsProcessedRepository.clear(),
      nftAssetsRepository.clear(),
    ]);
  }

  const data = createSeedData();
  const timestamp = nowIso();

  const collections: CollectionDocument[] = data.collections.map((c) => ({
    id: c.id,
    name: c.name,
    symbol: c.symbol,
    description: c.description,
    image: c.image,
    creator: c.creator,
    maxSupply: c.maxSupply,
    minted: c.minted,
    mintPrice: c.mintPrice,
    currency: "HIVE",
    creatorFee: c.creatorFee,
    platformFee: c.platformFee,
    rarities: c.rarities,
    metadataBaseUri: c.metadataBaseUri,
    status: c.minted >= c.maxSupply ? "sold_out" : "active",
    creationState: "ACTIVE",
    // Seeded collections behave as if their assets were already pinned.
    collectionImageUri: `ipfs://${mockCid(`seed-image-${c.id}`)}`,
    collectionMetadataUri: `ipfs://${mockCid(`seed-collection-metadata-${c.id}`)}`,
    assetRootUri: `ipfs://${mockCid(`seed-assets-${c.id}`)}`,
    metadataRootUri: `ipfs://${mockCid(`seed-metadata-${c.id}`)}`,
    assetCount: 0,
    reusableAssets: true,
    floorPrice: c.floorPrice,
    volume: c.volume,
    holders: c.holders,
    trendingScore: c.trendingScore,
    createdAt: c.createdAt,
    updatedAt: timestamp,
  }));

  const listedNftIds = new Set(data.listings.map((l) => l.nftId));

  const nfts: NftDocument[] = data.nfts.map((n) => ({
    id: n.id,
    collectionId: n.collectionId,
    collectionName: n.collectionName,
    tokenId: n.tokenId,
    name: n.name,
    description: n.description,
    image: n.image,
    owner: n.owner,
    rarity: n.rarity,
    mintNumber: n.mintNumber,
    maxSupply: n.maxSupply,
    metadataUri: n.metadataUri,
    attributes: n.attributes,
    estimatedValue: n.estimatedValue,
    status: listedNftIds.has(n.id) ? "listed" : "owned",
    mintTransactionId: `SEED-${n.id}`,
    createdAt: n.createdAt,
    updatedAt: timestamp,
  }));

  const nftById = new Map(nfts.map((n) => [n.id, n]));

  const listings: MarketplaceListingDocument[] = data.listings.flatMap((l) => {
    const nft = nftById.get(l.nftId);
    if (!nft) return [];
    return [
      {
        id: l.id,
        nftId: l.nftId,
        collectionId: nft.collectionId,
        seller: l.seller,
        price: l.price,
        currency: "HIVE" as const,
        status: "active" as const,
        featured: l.featured,
        marketTransactionId: `SEED-MARKET-${l.id}`,
        createdAt: l.listedAt,
        updatedAt: timestamp,
      },
    ];
  });

  const activities: ActivityDocument[] = data.activities.map((a) => ({
    id: a.id,
    type: a.type,
    actor: a.actor,
    target: a.target,
    nftId: a.nftId,
    collectionId: a.collectionId,
    label: a.label,
    amount: a.amount,
    transactionId: a.txId,
    hiveTransactionId: a.txId,
    createdAt: a.createdAt,
  }));

  await nftCollectionsRepository.insertMany(collections);
  await nftsRepository.insertMany(nfts);
  await marketplaceListingsRepository.insertMany(listings);
  await activityRepository.insertMany(activities);

  // Accounts: the dev user plus every account referenced by the catalogue.
  const accounts = new Set<string>([CURRENT_USER.username, ...USERS, ...collections.map((c) => c.creator)]);
  for (const username of accounts) {
    await usersRepository.ensure({
      username,
      displayName: username === CURRENT_USER.username ? CURRENT_USER.displayName : `@${username}`,
      hiveBalance: username === CURRENT_USER.username ? 1250 : 500,
    });
  }

  const counts = await currentCounts();
  logger.info("DB", "Seed complete", counts);
  return { seeded: true, counts };
}

async function currentCounts() {
  const [collections, nfts, listings, activity, users] = await Promise.all([
    nftCollectionsRepository.count(),
    nftsRepository.count(),
    marketplaceListingsRepository.count(),
    activityRepository.count(),
    usersRepository.count(),
  ]);
  return { collections, nfts, listings, activity, users };
}

let bootstrapped: Promise<SeedResult> | null = null;

/** Called once per server process before the first API read. */
export function ensureSeeded(): Promise<SeedResult> {
  if (!bootstrapped) bootstrapped = seedDatabase();
  return bootstrapped;
}
