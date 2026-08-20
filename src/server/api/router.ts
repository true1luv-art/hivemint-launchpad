/**
 * HTTP API router.
 *
 * Exposes the Phase 2 repository layer + smart-contract worker over a small,
 * curl-able REST surface. It is served by the TanStack server route at
 * `src/routes/api/$.ts` (splat) and runs entirely server-side — no React,
 * no Zustand, no browser APIs.
 *
 * Auth: until Hive Keychain lands (Phase 3) every mutating request is executed
 * as the dev user (`config.devUser`). The HTTP layer is unauthenticated on
 * purpose; the security boundary moves to the route/handler middleware later.
 */
import { config } from "@/lib/config/config";
import { logger } from "@/lib/config/logger";
import { COLLECTION_CREATION_FEE } from "@/features/types/constants";
import { getEventBus } from "@/features/events/action";
import { getWorker } from "@/server/smart-contract";
import { ensureSeeded } from "@/server/seed/seed";
import { activityRepository } from "@/lib/modules/activity/activity.repository";
import { marketplaceListingsRepository } from "@/lib/modules/marketplace-listings/marketplace-listings.repository";
import { nftCollectionsRepository } from "@/lib/modules/nft-collections/nft-collections.repository";
import { nftsRepository } from "@/lib/modules/nfts/nfts.repository";
import { transactionsPendingRepository } from "@/lib/modules/transactions-pending/transactions-pending.repository";
import { transactionsProcessedRepository } from "@/lib/modules/transactions-processed/transactions-processed.repository";
import { usersRepository } from "@/lib/modules/users/users.repository";
import type { TransactionType } from "@/lib/modules/transactions-pending/transactions-pending.types";
import type { CreatePendingTransactionInput } from "@/lib/modules/transactions-pending/transactions-pending.types";
import { badRequest, fail, json, notFound, readJson } from "./http";
import {
  buySchema,
  cancelSchema,
  createCollectionSchema,
  listSchema,
  mintSchema,
  transferSchema,
} from "./schemas";

/* ------------------------------------------------------------------ */
/* bootstrap                                                           */
/* ------------------------------------------------------------------ */

let ready: Promise<unknown> | null = null;

/** Seeds the in-memory store once per process before the first read/write. */
async function ensureReady(): Promise<void> {
  if (!ready) ready = ensureSeeded().catch((error) => {
    ready = null;
    logger.error("API", "Seed failed", error);
    throw error;
  });
  await ready;
}

/** Dev actor used until Hive Keychain auth lands. */
const ACTOR = config.devUser;

function genRequestId(): string {
  return `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function parseIntParam(value: string | null, fallback: number, max = 200): number {
  if (value === null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.trunc(n), max);
}

/* ------------------------------------------------------------------ */
/* enqueue + process helper                                            */
/* ------------------------------------------------------------------ */

interface MutationResult {
  transactionId: string;
  requestId: string;
  type: TransactionType;
  status: string;
  duplicate: boolean;
  receipt: {
    status: string;
    hiveTransactionId: string;
    blockNumber: number | undefined;
    collectionId: string | undefined;
    nftId: string | undefined;
    result: Record<string, unknown>;
    error: string | undefined;
  } | null;
}

/**
 * Enqueues a pending transaction, drains the worker so the result is
 * available synchronously, then returns the final status. Idempotent on
 * `requestId` — a retried call returns the original receipt.
 */
async function enqueueAndProcess<T extends TransactionType>(
  input: Omit<CreatePendingTransactionInput<T>, "userId" | "hiveAccount">,
): Promise<MutationResult> {
  const full = {
    ...input,
    userId: ACTOR,
    hiveAccount: ACTOR,
  } as CreatePendingTransactionInput<T>;

  const { transaction, duplicate } = await transactionsPendingRepository.enqueue(full);

  // Process inline so the caller gets a confirmed result in one round-trip.
  // The worker is idempotent (receipt guard), so draining extra is safe.
  await getWorker().drain(5);

  const receipt = await transactionsProcessedRepository.findByTransactionId(transaction.transactionId);
  const pending = await transactionsPendingRepository.findById(transaction.id);

  return {
    transactionId: transaction.transactionId,
    requestId: transaction.requestId,
    type: transaction.type,
    status: receipt?.status ?? pending?.status ?? "pending",
    duplicate,
    receipt: receipt
      ? {
          status: receipt.status,
          hiveTransactionId: receipt.hiveTransactionId,
          blockNumber: receipt.blockNumber,
          collectionId: receipt.collectionId,
          nftId: receipt.nftId,
          result: receipt.result,
          error: receipt.error,
        }
      : null,
  };
}

/* ------------------------------------------------------------------ */
/* router                                                              */
/* ------------------------------------------------------------------ */

export async function handleApiRequest(
  method: string,
  splat: string | undefined,
  request?: Request,
): Promise<Response> {
  try {
    await ensureReady();
    const segments = (splat ?? "").split("/").filter(Boolean);
    const url = new URL(request?.url ?? `https://local/api/${segments.join("/")}`);
    const params = url.searchParams;
    const [a, b, c] = segments;

    const isGet = method === "GET";
    const isPost = method === "POST";
    if (!isGet && !isPost) return fail(badRequest(`Method ${method} not allowed`));

    /* ---------------------------- reads ---------------------------- */
    if (isGet) {
      switch (a) {
        case "health": {
          const [collections, nfts, listings, activity, users] = await Promise.all([
            nftCollectionsRepository.count(),
            nftsRepository.count(),
            marketplaceListingsRepository.count({ status: "active" }),
            activityRepository.count(),
            usersRepository.count(),
          ]);
          return json({ ok: true, driver: config.databaseDriver, worker: getWorker().id, counts: { collections, nfts, listings, activity, users } });
        }
        case "stats": {
          return json(await computeStats());
        }
        case "events": {
          return json(getEventBus().recent(parseIntParam(params.get("limit"), 50, 200)));
        }
        case "collections": {
          if (!b) {
            const creator = params.get("creator");
            const list = creator ? await nftCollectionsRepository.listByCreator(creator) : await nftCollectionsRepository.listAll();
            return json({ collections: list });
          }
          if (b && c === "nfts") return json({ nfts: await nftsRepository.listByCollection(b) });
          if (b && c === "listings") return json({ listings: await marketplaceListingsRepository.listByCollection(b) });
          if (b && c === "activity") return json({ activity: await activityRepository.listByCollection(b, parseIntParam(params.get("limit"), 50)) });
          if (b) {
            const collection = await nftCollectionsRepository.findById(b);
            if (!collection) return fail(notFound("Collection not found"));
            return json({ collection });
          }
          return fail(notFound());
        }
        case "nfts": {
          if (!b) {
            const owner = params.get("owner");
            const list = owner ? await nftsRepository.listByOwner(owner) : await nftsRepository.listAll();
            return json({ nfts: list });
          }
          if (b && c === "listing") {
            const listing = await marketplaceListingsRepository.findActiveByNft(b);
            return json({ listing });
          }
          if (b && c === "activity") return json({ activity: await activityRepository.listByNft(b, parseIntParam(params.get("limit"), 50)) });
          if (b) {
            const nft = await nftsRepository.findById(b);
            if (!nft) return fail(notFound("NFT not found"));
            return json({ nft });
          }
          return fail(notFound());
        }
        case "listings": {
          if (!b) {
            const collectionId = params.get("collectionId");
            const seller = params.get("seller");
            const list = seller
              ? await marketplaceListingsRepository.listBySeller(seller)
              : collectionId
                ? await marketplaceListingsRepository.listByCollection(collectionId)
                : await marketplaceListingsRepository.listActive();
            return json({ listings: list });
          }
          const listing = await marketplaceListingsRepository.findById(b);
          if (!listing) return fail(notFound("Listing not found"));
          return json({ listing });
        }
        case "activity": {
          const actor = params.get("actor");
          const list = actor ? await activityRepository.listByActor(actor, parseIntParam(params.get("limit"), 100)) : await activityRepository.listRecent(parseIntParam(params.get("limit"), 100));
          return json({ activity: list });
        }
        case "users": {
          if (!b) return fail(badRequest("Username required"));
          const user = await usersRepository.findByUsername(b);
          if (!user) return fail(notFound("User not found"));
          return json({ user });
        }
        case "transactions": {
          if (b === "pending") {
            const user = params.get("user");
            const list = user ? await transactionsPendingRepository.listForUser(user) : await transactionsPendingRepository.listPending(parseIntParam(params.get("limit"), 50));
            return json({ transactions: list });
          }
          if (b === "recent") return json({ transactions: await transactionsProcessedRepository.listRecent(parseIntParam(params.get("limit"), 50)) });
          if (b) {
            const receipt = await transactionsProcessedRepository.findByTransactionId(b);
            const pending = await transactionsPendingRepository.findByTransactionId(b);
            return json({ transaction: pending ?? null, receipt: receipt ?? null });
          }
          return fail(notFound());
        }
        default:
          return fail(notFound(`Unknown path: /api/${segments.join("/")}`));
      }
    }

    /* --------------------------- mutations ------------------------- */
    if (isPost) {
      const body = request ? await readJson<Record<string, unknown>>(request) : {};
      const requestId = (body["requestId"] as string | undefined) ?? genRequestId();
      const payload = { ...body, requestId };

      // POST /api/collections  -> CREATE_COLLECTION
      if (a === "collections" && !b) {
        const data = createCollectionSchema.parse(payload);
        return json(await enqueueAndProcess({
          type: "CREATE_COLLECTION" as TransactionType,
          requestId,
          amount: COLLECTION_CREATION_FEE,
          payload: {
            name: data.name,
            symbol: data.symbol,
            description: data.description,
            image: data.image,
            maxSupply: data.maxSupply,
            mintPrice: data.mintPrice,
            creatorFee: data.creatorFee,
            platformFee: data.platformFee,
            rarities: data.rarities,
            metadataBaseUri: data.metadataBaseUri,
          },
        } as Omit<CreatePendingTransactionInput<"CREATE_COLLECTION">, "userId" | "hiveAccount">));
      }

      // POST /api/collections/:id/mint -> MINT_NFT
      if (a === "collections" && b && c === "mint") {
        const data = mintSchema.parse({ ...payload, collectionId: b });
        return json(await enqueueAndProcess({
          type: "MINT_NFT" as TransactionType,
          requestId,
          collectionId: b,
          amount: 0,
          payload: { collectionId: b, quantity: data.quantity },
        } as Omit<CreatePendingTransactionInput<"MINT_NFT">, "userId" | "hiveAccount">));
      }

      if (a === "nfts" && b && c === "list") {
        const data = listSchema.parse({ ...payload, nftId: b });
        return json(await enqueueAndProcess({
          type: "LIST_NFT" as TransactionType,
          requestId,
          nftId: b,
          amount: data.price,
          payload: { nftId: b, price: data.price },
        } as Omit<CreatePendingTransactionInput<"LIST_NFT">, "userId" | "hiveAccount">));
      }

      if (a === "nfts" && b && c === "transfer") {
        const data = transferSchema.parse({ ...payload, nftId: b });
        return json(await enqueueAndProcess({
          type: "TRANSFER_NFT" as TransactionType,
          requestId,
          nftId: b,
          amount: 0,
          payload: { nftId: b, to: data.to },
        } as Omit<CreatePendingTransactionInput<"TRANSFER_NFT">, "userId" | "hiveAccount">));
      }

      if (a === "listings" && b && c === "buy") {
        const data = buySchema.parse({ ...payload, listingId: b });
        return json(await enqueueAndProcess({
          type: "BUY_NFT" as TransactionType,
          requestId,
          amount: 0,
          payload: { listingId: b },
        } as Omit<CreatePendingTransactionInput<"BUY_NFT">, "userId" | "hiveAccount">));
      }

      if (a === "listings" && b && c === "cancel") {
        const data = cancelSchema.parse({ ...payload, listingId: b });
        return json(await enqueueAndProcess({
          type: "CANCEL_LISTING" as TransactionType,
          requestId,
          amount: 0,
          payload: { listingId: b },
        } as Omit<CreatePendingTransactionInput<"CANCEL_LISTING">, "userId" | "hiveAccount">));
      }

      // dev helpers
      if (a === "tick") {
        const processed = await getWorker().drain(parseIntParam(params.get("max"), 25, 100));
        return json({ drained: processed, worker: getWorker().id });
      }
      if (a === "reset") {
        await resetDatabase();
        return json({ ok: true, message: "Database cleared and reseeded" });
      }

      return fail(notFound(`Unknown path: /api/${segments.join("/")}`));
    }

    return fail(badRequest("Unsupported request"));
  } catch (error) {
    return fail(error);
  }
}

async function computeStats() {
  const collections = await nftCollectionsRepository.listAll();
  const totalVolume = collections.reduce((sum, c) => sum + c.volume, 0);
  const floors = collections.map((c) => c.floorPrice).filter((p) => p > 0);
  const [nfts, listings, users, activity] = await Promise.all([
    nftsRepository.count(),
    marketplaceListingsRepository.count({ status: "active" }),
    usersRepository.count(),
    activityRepository.count(),
  ]);
  return {
    collections: collections.length,
    nfts,
    activeListings: listings,
    users,
    activity,
    totalVolume: Number(totalVolume.toFixed(3)),
    floorPrice: floors.length ? Math.min(...floors) : 0,
    trending: collections
      .slice()
      .sort((x, y) => y.trendingScore - x.trendingScore)
      .slice(0, 6)
      .map((c) => ({ id: c.id, name: c.name, symbol: c.symbol, image: c.image, floorPrice: c.floorPrice, volume: c.volume, minted: c.minted, maxSupply: c.maxSupply, trendingScore: c.trendingScore })),
  };
}

async function resetDatabase() {
  const { seedDatabase } = await import("@/server/seed/seed");
  await seedDatabase({ force: true });
}
