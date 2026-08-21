/**
 * Smart-contract worker.
 *
 * Application-side blockchain worker — NOT a deployed Hive smart contract.
 * It drains `transactions_pending`, performs the (currently simulated) chain
 * operation through `BlockchainService`, writes `transactions_processed`,
 * updates the MongoDB index collections and emits typed application events.
 *
 * Constraints: no React, no Zustand, no browser APIs.
 */
import { collectionCreationCost, config } from "@/lib/config/config";
import { logger } from "@/lib/config/logger";
import { COLLECTION_CREATION_FEE, MARKETPLACE_FEE_RATE, MARKET_ACCOUNT, PLATFORM_ACCOUNT } from "@/features/types/constants";
import { APP_EVENTS, emitAppEvent } from "@/features/events/action";
import { activityRepository } from "@/lib/modules/activity/activity.repository";
import { createCollectionDocument } from "@/lib/modules/nft-collections/nft-collections.model";
import { nftAssetsRepository } from "@/lib/modules/nft-assets/nft-assets.repository";
import { nftCollectionsRepository } from "@/lib/modules/nft-collections/nft-collections.repository";
import { createNftDocument } from "@/lib/modules/nfts/nfts.model";
import { nftsRepository } from "@/lib/modules/nfts/nfts.repository";
import { createListingDocument } from "@/lib/modules/marketplace-listings/marketplace-listings.model";
import { marketplaceListingsRepository } from "@/lib/modules/marketplace-listings/marketplace-listings.repository";
import { transactionsPendingRepository } from "@/lib/modules/transactions-pending/transactions-pending.repository";
import { transactionsProcessedRepository } from "@/lib/modules/transactions-processed/transactions-processed.repository";
import { usersRepository } from "@/lib/modules/users/users.repository";
import type { PendingTransaction } from "@/lib/modules/transactions-pending/transactions-pending.types";
import { getBlockchainService } from "./index";
import type { BlockchainService } from "./blockchain.service";

interface ProcessOutcome {
  hiveTransactionId: string;
  blockNumber: number;
  result: Record<string, unknown>;
  collectionId?: string | undefined;
  nftId?: string | undefined;
}

const round = (value: number) => Number(value.toFixed(3));

export class SmartContractWorker {
  readonly id: string;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly chain: BlockchainService = getBlockchainService(),
    id?: string,
  ) {
    this.id = id ?? `worker-${Math.random().toString(36).slice(2, 8)}`;
  }

  /* ---------------------------------------------------------------- */
  /* queue loop                                                        */
  /* ---------------------------------------------------------------- */

  /** Claims and processes at most one transaction. Returns false when idle. */
  async processNext(): Promise<boolean> {
    await transactionsPendingRepository.recoverStale(60_000);

    const tx = await transactionsPendingRepository.claimNext(this.id);
    if (!tx) return false;

    logger.info("SMART-CONTRACT", `Transaction claimed ${tx.transactionId} (${tx.type}) by ${this.id}`);

    // Idempotency guard: a receipt already exists -> never process twice.
    const existingReceipt = await transactionsProcessedRepository.findByTransactionId(tx.transactionId);
    if (existingReceipt) {
      logger.warn("SMART-CONTRACT", `Duplicate processing prevented for ${tx.transactionId}`);
      await transactionsPendingRepository.markProcessed(tx.id);
      return true;
    }

    try {
      logger.info("SMART-CONTRACT", `Processing ${tx.type}`, { transactionId: tx.transactionId });
      const outcome = await this.dispatch(tx);

      await transactionsProcessedRepository.record({
        transactionId: tx.transactionId,
        requestId: tx.requestId,
        type: tx.type,
        status: "processed",
        hiveTransactionId: outcome.hiveTransactionId,
        blockNumber: outcome.blockNumber,
        userId: tx.userId,
        hiveAccount: tx.hiveAccount,
        collectionId: outcome.collectionId ?? tx.collectionId,
        nftId: outcome.nftId ?? tx.nftId,
        result: outcome.result,
      });

      await transactionsPendingRepository.updateById(tx.id, {
        collectionId: outcome.collectionId ?? tx.collectionId,
        nftId: outcome.nftId ?? tx.nftId,
      });
      await transactionsPendingRepository.markProcessed(tx.id);
      logger.info("TX", `Transaction processed ${tx.transactionId}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = tx.attempts < config.smartContractMaxAttempts && !(error instanceof PermanentError);

      if (retryable) {
        logger.warn("SMART-CONTRACT", `Attempt ${tx.attempts} failed for ${tx.transactionId}: ${message}`);
        await transactionsPendingRepository.update({ id: tx.id }, { status: "pending", error: message });
        return true;
      }

      await transactionsProcessedRepository.record({
        transactionId: tx.transactionId,
        requestId: tx.requestId,
        type: tx.type,
        status: "failed",
        hiveTransactionId: "",
        userId: tx.userId,
        hiveAccount: tx.hiveAccount,
        collectionId: tx.collectionId,
        nftId: tx.nftId,
        result: {},
        error: message,
      });
      if (tx.type === "CREATE_COLLECTION" && tx.collectionId) {
        await nftCollectionsRepository.patch(tx.collectionId, { creationState: "FAILED", creationError: message });
      }
      await transactionsPendingRepository.markFailed(tx.id, message);
      logger.error("TX", `Transaction failed ${tx.transactionId}: ${message}`);
      await emitAppEvent(APP_EVENTS.TRANSACTION_FAILED, {
        transactionId: tx.transactionId,
        type: tx.type,
        hiveAccount: tx.hiveAccount,
        error: message,
      });
      return true;
    }
  }

  /** Drains the queue until empty (used by the HTTP tick endpoint). */
  async drain(max = 10): Promise<number> {
    let processed = 0;
    while (processed < max) {
      const didWork = await this.processNext();
      if (!didWork) break;
      processed += 1;
    }
    return processed;
  }

  /** Long-lived polling loop (used by `npm run server:smart-contract`). */
  start() {
    if (this.running) return;
    this.running = true;
    logger.info("SMART-CONTRACT", `Worker ${this.id} started (interval=${config.smartContractInterval}ms)`);
    const loop = async () => {
      if (!this.running) return;
      try {
        await this.drain(25);
      } catch (error) {
        logger.error("SMART-CONTRACT", "Worker loop error", error);
      }
      if (this.running) this.timer = setTimeout(() => void loop(), config.smartContractInterval);
    };
    void loop();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    logger.info("SMART-CONTRACT", `Worker ${this.id} stopped`);
  }

  /* ---------------------------------------------------------------- */
  /* handlers                                                          */
  /* ---------------------------------------------------------------- */

  private dispatch(tx: PendingTransaction): Promise<ProcessOutcome> {
    switch (tx.type) {
      case "CREATE_COLLECTION":
        return this.handleCreateCollection(tx);
      case "MINT_NFT":
        return this.handleMint(tx);
      default:
        throw new PermanentError(`Unsupported transaction type: ${String(tx.type)}`);
    }
  }

  private async handleCreateCollection(tx: PendingTransaction): Promise<ProcessOutcome> {
    const payload = tx.payload as {
      collectionId?: string;
      name: string;
      symbol: string;
      description: string;
      image?: string;
      maxSupply: number;
      mintPrice: number;
      creatorFee: number;
      platformFee: number;
      rarities: RarityConfig[];
      metadataBaseUri?: string;
      collectionImageUri?: string;
      collectionMetadataUri?: string;
      assetRootUri?: string;
      metadataRootUri?: string;
      assetCount?: number;
      reusableAssets?: boolean;
    };

    // Rule 16: never deploy a collection whose assets are not pinned.
    if (payload.collectionId) {
      for (const [label, uri] of [
        ["collection image", payload.collectionImageUri],
        ["collection metadata", payload.collectionMetadataUri],
        ["asset root", payload.assetRootUri],
        ["metadata root", payload.metadataRootUri],
      ] as const) {
        if (!uri) throw new PermanentError(`Cannot deploy: ${label} is not stored yet`);
      }
    }

    const fee = collectionCreationCost(payload.maxSupply);
    const creator = await usersRepository.ensure({ username: tx.hiveAccount });
    if (creator.hiveBalance < fee) {
      if (payload.collectionId) {
        await nftCollectionsRepository.patch(payload.collectionId, {
          creationState: "FAILED",
          creationError: "Insufficient HIVE balance for the collection deployment fee",
        });
      }
      throw new PermanentError("Insufficient HIVE balance for the collection deployment fee");
    }

    if (payload.collectionId) {
      await nftCollectionsRepository.patch(payload.collectionId, { creationState: "PROCESSING" });
    }

    const payment = await this.chain.transfer({
      from: tx.hiveAccount,
      to: PLATFORM_ACCOUNT,
      amount: fee,
      currency: "HIVE",
      memo: `Collection deployment · ${payload.name}`,
    });
    await emitAppEvent(APP_EVENTS.PAYMENT_CONFIRMED, {
      transactionId: tx.transactionId,
      hiveTransactionId: payment.hiveTransactionId,
      from: tx.hiveAccount,
      to: PLATFORM_ACCOUNT,
      amount: fee,
      currency: "HIVE",
      memo: `Collection deployment · ${payload.name}`,
    });

    const deploy = await this.chain.deployCollection({
      creator: tx.hiveAccount,
      symbol: payload.symbol.toUpperCase(),
      name: payload.name,
      maxSupply: payload.maxSupply,
    });

    // The row already exists when the collection was prepared with assets
    // (Phase 2.5B). Otherwise create it here for the legacy/no-asset path.
    const existing = payload.collectionId ? await nftCollectionsRepository.findById(payload.collectionId) : null;
    const doc =
      (existing
        ? await nftCollectionsRepository.patch(existing.id, { status: "active", creationState: "ACTIVE" })
        : null) ??
      (existing ??
        (await nftCollectionsRepository.insert(
          createCollectionDocument({
            name: payload.name,
            symbol: payload.symbol,
            description: payload.description,
            image: payload.image,
            creator: tx.hiveAccount,
            maxSupply: payload.maxSupply,
            mintPrice: payload.mintPrice,
            creatorFee: payload.creatorFee,
            platformFee: payload.platformFee,
            rarities: payload.rarities,
            metadataBaseUri: payload.metadataBaseUri,
            creationState: "ACTIVE",
            collectionImageUri: payload.collectionImageUri,
            collectionMetadataUri: payload.collectionMetadataUri,
            assetRootUri: payload.assetRootUri,
            metadataRootUri: payload.metadataRootUri,
            assetCount: payload.assetCount ?? 0,
            reusableAssets: payload.reusableAssets ?? false,
          }),
        )));

    const assetCount = await nftAssetsRepository.countByCollection(doc.id);
    if (assetCount !== (doc.assetCount ?? 0)) {
      await nftCollectionsRepository.patch(doc.id, { assetCount });
    }

    await usersRepository.adjustBalance(tx.hiveAccount, -fee);
    await activityRepository.record({
      type: "Collection Created",
      actor: tx.hiveAccount,
      collectionId: doc.id,
      label: `@${tx.hiveAccount} created ${doc.name}`,
      amount: fee,
      transactionId: tx.transactionId,
      hiveTransactionId: deploy.hiveTransactionId,
    });

    await emitAppEvent(APP_EVENTS.COLLECTION_CREATED, {
      transactionId: tx.transactionId,
      hiveTransactionId: deploy.hiveTransactionId,
      collectionId: doc.id,
      creator: doc.creator,
      symbol: doc.symbol,
      maxSupply: doc.maxSupply,
    });

    return {
      hiveTransactionId: deploy.hiveTransactionId,
      blockNumber: deploy.blockNumber,
      collectionId: doc.id,
      result: {
        collectionId: doc.id,
        symbol: doc.symbol,
        fee,
        assetCount,
        collectionImageUri: doc.collectionImageUri,
        collectionMetadataUri: doc.collectionMetadataUri,
        assetRootUri: doc.assetRootUri,
        metadataRootUri: doc.metadataRootUri,
      },
    };
  }

  private async handleMint(tx: PendingTransaction): Promise<ProcessOutcome> {
    const { collectionId } = tx.payload as { collectionId: string };
    const collection = await nftCollectionsRepository.findById(collectionId);
    if (!collection) throw new PermanentError("Collection not found");
    if (collection.minted >= collection.maxSupply) throw new PermanentError("Collection is sold out");

    const buyer = await usersRepository.ensure({ username: tx.hiveAccount });
    const platformFee = round(collection.mintPrice * (collection.platformFee / 100));
    const total = round(collection.mintPrice + platformFee);
    if (buyer.hiveBalance < total) throw new PermanentError("Insufficient HIVE balance");

    // Reserve the supply slot BEFORE payment or any chain call so concurrent
    // mints can never overrun maxSupply. Released again if anything fails.
    const reservation = await nftCollectionsRepository.reserveMint(collection.id);
    if (!reservation) throw new PermanentError("Collection is sold out");
    const mintNumber = reservation.mintNumber;

    // Rule 24: reuse the collection's uploaded asset set — never duplicate files.
    const assetCount = await nftAssetsRepository.countByCollection(collection.id);
    const asset = assetCount
      ? ((await nftAssetsRepository.findByToken(collection.id, mintNumber)) ??
        (collection.reusableAssets
          ? (await nftAssetsRepository.listByCollection(collection.id))[(mintNumber - 1) % assetCount]
          : null))
      : null;

    const nft = createNftDocument({
      collection,
      mintNumber,
      owner: tx.hiveAccount,
      mintTransactionId: tx.transactionId,
      seedKey: `${collection.id}-${mintNumber}-${tx.transactionId}`,
    });

    if (asset) {
      nft.imageUri = asset.imageUri;
      nft.metadataUri = asset.metadataUri;
      nft.assetId = asset.id;
    }

    let issue;
    try {
      const payment = await this.chain.transfer({
        from: tx.hiveAccount,
        to: PLATFORM_ACCOUNT,
        amount: total,
        currency: "HIVE",
        memo: `Mint · ${collection.name}`,
      });
      await emitAppEvent(APP_EVENTS.PAYMENT_CONFIRMED, {
        transactionId: tx.transactionId,
        hiveTransactionId: payment.hiveTransactionId,
        from: tx.hiveAccount,
        to: PLATFORM_ACCOUNT,
        amount: total,
        currency: "HIVE",
        memo: `Mint · ${collection.name}`,
      });

      issue = await this.chain.issueNft({
        symbol: collection.symbol,
        to: tx.hiveAccount,
        tokenId: nft.tokenId,
        metadataUri: nft.metadataUri,
      });

      await nftsRepository.insert(nft);
    } catch (error) {
      await nftCollectionsRepository.releaseMint(collection.id);
      throw error;
    }

    await nftCollectionsRepository.addVolume(collection.id, total);
    const holders = await nftsRepository.countHolders(collection.id);
    await nftCollectionsRepository.patch(collection.id, { holders });

    const creatorShare = round(collection.mintPrice * (collection.creatorFee / 100));
    await usersRepository.adjustBalance(tx.hiveAccount, -total);
    await usersRepository.ensure({ username: collection.creator });
    await usersRepository.adjustBalance(collection.creator, creatorShare);

    await activityRepository.record({
      type: "Minted",
      actor: tx.hiveAccount,
      nftId: nft.id,
      collectionId: collection.id,
      label: `@${tx.hiveAccount} minted ${nft.name}`,
      amount: collection.mintPrice,
      transactionId: tx.transactionId,
      hiveTransactionId: issue.hiveTransactionId,
    });

    await emitAppEvent(APP_EVENTS.NFT_MINTED, {
      transactionId: tx.transactionId,
      hiveTransactionId: issue.hiveTransactionId,
      nftId: nft.id,
      collectionId: collection.id,
      owner: nft.owner,
      tokenId: nft.tokenId,
      rarity: nft.rarity,
    });

    return {
      hiveTransactionId: issue.hiveTransactionId,
      blockNumber: issue.blockNumber,
      collectionId: collection.id,
      nftId: nft.id,
      result: {
        nftId: nft.id,
        tokenId: nft.tokenId,
        name: nft.name,
        rarity: nft.rarity,
        mintNumber: nft.mintNumber,
        mintPrice: collection.mintPrice,
        platformFee,
        total,
        creatorShare,
      },
    };
  }

}

/** Business-rule failure — never retried. */
export class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentError";
  }
}

interface WorkerGlobal {
  __hivemint_worker?: SmartContractWorker | undefined;
}
const workerGlobal = globalThis as unknown as WorkerGlobal;

export function getWorker(): SmartContractWorker {
  if (!workerGlobal.__hivemint_worker) workerGlobal.__hivemint_worker = new SmartContractWorker();
  return workerGlobal.__hivemint_worker;
}
