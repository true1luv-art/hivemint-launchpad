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
import { config } from "@/lib/config/config";
import { logger } from "@/lib/config/logger";
import { COLLECTION_CREATION_FEE, MARKETPLACE_FEE_RATE, MARKET_ACCOUNT, PLATFORM_ACCOUNT } from "@/features/types/constants";
import { APP_EVENTS, emitAppEvent } from "@/features/events/action";
import { pickRarity } from "@/lib/mock-data";
import type { RarityConfig } from "@/lib/types";
import { activityRepository } from "@/lib/modules/activity/activity.repository";
import { createCollectionDocument } from "@/lib/modules/nft-collections/nft-collections.model";
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
      case "LIST_NFT":
        return this.handleList(tx);
      case "BUY_NFT":
        return this.handleBuy(tx);
      case "CANCEL_LISTING":
        return this.handleCancel(tx);
      case "TRANSFER_NFT":
        return this.handleTransfer(tx);
      default:
        throw new PermanentError(`Unsupported transaction type: ${String(tx.type)}`);
    }
  }

  private async handleCreateCollection(tx: PendingTransaction): Promise<ProcessOutcome> {
    const payload = tx.payload as {
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
    };

    const creator = await usersRepository.ensure({ username: tx.hiveAccount });
    if (creator.hiveBalance < COLLECTION_CREATION_FEE) {
      throw new PermanentError("Insufficient HIVE balance for the collection deployment fee");
    }

    const payment = await this.chain.transfer({
      from: tx.hiveAccount,
      to: PLATFORM_ACCOUNT,
      amount: COLLECTION_CREATION_FEE,
      currency: "HIVE",
      memo: `Collection deployment · ${payload.name}`,
    });
    await emitAppEvent(APP_EVENTS.PAYMENT_CONFIRMED, {
      transactionId: tx.transactionId,
      hiveTransactionId: payment.hiveTransactionId,
      from: tx.hiveAccount,
      to: PLATFORM_ACCOUNT,
      amount: COLLECTION_CREATION_FEE,
      currency: "HIVE",
      memo: `Collection deployment · ${payload.name}`,
    });

    const deploy = await this.chain.deployCollection({
      creator: tx.hiveAccount,
      symbol: payload.symbol.toUpperCase(),
      name: payload.name,
      maxSupply: payload.maxSupply,
    });

    const doc = await nftCollectionsRepository.insert(
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
      }),
    );

    await usersRepository.adjustBalance(tx.hiveAccount, -COLLECTION_CREATION_FEE);
    await activityRepository.record({
      type: "Collection Created",
      actor: tx.hiveAccount,
      collectionId: doc.id,
      label: `@${tx.hiveAccount} created ${doc.name}`,
      amount: COLLECTION_CREATION_FEE,
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
      result: { collectionId: doc.id, symbol: doc.symbol, fee: COLLECTION_CREATION_FEE },
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

    // Weighted random selection driven by the collection's rarity configuration.
    const rarity = pickRarity(collection.rarities, Math.random);
    const mintNumber = await nftsRepository.nextMintNumber(collection.id);

    const nft = createNftDocument({
      collection,
      mintNumber,
      owner: tx.hiveAccount,
      rarity,
      mintTransactionId: tx.transactionId,
      seedKey: `${collection.id}-${mintNumber}-${tx.transactionId}`,
    });

    const issue = await this.chain.issueNft({
      symbol: collection.symbol,
      to: tx.hiveAccount,
      tokenId: nft.tokenId,
      metadataUri: nft.metadataUri,
    });

    await nftsRepository.insert(nft);
    await nftCollectionsRepository.incrementMinted(collection.id, total);
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

  private async handleList(tx: PendingTransaction): Promise<ProcessOutcome> {
    const { nftId, price } = tx.payload as { nftId: string; price: number };
    const nft = await nftsRepository.findById(nftId);
    if (!nft) throw new PermanentError("NFT not found");
    if (nft.owner !== tx.hiveAccount) throw new PermanentError("Only the owner can list this NFT");
    const already = await marketplaceListingsRepository.findActiveByNft(nftId);
    if (already) throw new PermanentError("NFT is already listed");

    const collection = await nftCollectionsRepository.findById(nft.collectionId);
    const sell = await this.chain.sellNft({
      symbol: collection?.symbol ?? nft.collectionName,
      seller: tx.hiveAccount,
      tokenId: nft.tokenId,
      price,
    });

    const listing = await marketplaceListingsRepository.insert(
      createListingDocument({
        nftId: nft.id,
        collectionId: nft.collectionId,
        seller: tx.hiveAccount,
        price,
        marketTransactionId: sell.hiveTransactionId,
      }),
    );
    await nftsRepository.setStatus(nft.id, "listed");

    if (collection && (collection.floorPrice === 0 || price < collection.floorPrice)) {
      await nftCollectionsRepository.patch(collection.id, { floorPrice: price });
    }

    await activityRepository.record({
      type: "Listed",
      actor: tx.hiveAccount,
      nftId: nft.id,
      collectionId: nft.collectionId,
      label: `@${tx.hiveAccount} listed ${nft.name}`,
      amount: price,
      transactionId: tx.transactionId,
      hiveTransactionId: sell.hiveTransactionId,
    });

    await emitAppEvent(APP_EVENTS.NFT_LISTED, {
      transactionId: tx.transactionId,
      hiveTransactionId: sell.hiveTransactionId,
      listingId: listing.id,
      nftId: nft.id,
      collectionId: nft.collectionId,
      seller: tx.hiveAccount,
      price,
    });

    return {
      hiveTransactionId: sell.hiveTransactionId,
      blockNumber: sell.blockNumber,
      collectionId: nft.collectionId,
      nftId: nft.id,
      result: { listingId: listing.id, price, marketplaceFeeRate: MARKETPLACE_FEE_RATE },
    };
  }

  private async handleCancel(tx: PendingTransaction): Promise<ProcessOutcome> {
    const { listingId } = tx.payload as { listingId: string };
    const listing = await marketplaceListingsRepository.findById(listingId);
    if (!listing) throw new PermanentError("Listing not found");
    if (listing.status !== "active") throw new PermanentError("Listing is no longer active");
    if (listing.seller !== tx.hiveAccount) throw new PermanentError("Only the seller can cancel this listing");

    const nft = await nftsRepository.findById(listing.nftId);
    const collection = await nftCollectionsRepository.findById(listing.collectionId);
    const cancel = await this.chain.cancelSell({
      symbol: collection?.symbol ?? "UNKNOWN",
      seller: listing.seller,
      tokenId: nft?.tokenId ?? 0,
      price: listing.price,
    });

    await marketplaceListingsRepository.markCancelled(listing.id);
    if (nft) await nftsRepository.setStatus(nft.id, "owned");

    await activityRepository.record({
      type: "Delisted",
      actor: listing.seller,
      nftId: listing.nftId,
      collectionId: listing.collectionId,
      label: `@${listing.seller} cancelled listing for ${nft?.name ?? "NFT"}`,
      amount: listing.price,
      transactionId: tx.transactionId,
      hiveTransactionId: cancel.hiveTransactionId,
    });

    await emitAppEvent(APP_EVENTS.LISTING_CANCELLED, {
      transactionId: tx.transactionId,
      hiveTransactionId: cancel.hiveTransactionId,
      listingId: listing.id,
      nftId: listing.nftId,
      seller: listing.seller,
    });

    return {
      hiveTransactionId: cancel.hiveTransactionId,
      blockNumber: cancel.blockNumber,
      collectionId: listing.collectionId,
      nftId: listing.nftId,
      result: { listingId: listing.id },
    };
  }

  private async handleBuy(tx: PendingTransaction): Promise<ProcessOutcome> {
    const { listingId } = tx.payload as { listingId: string };
    const listing = await marketplaceListingsRepository.findById(listingId);
    if (!listing) throw new PermanentError("Listing not found");
    if (listing.status !== "active") throw new PermanentError("Listing is no longer available");
    if (listing.seller === tx.hiveAccount) throw new PermanentError("You cannot buy your own listing");

    const nft = await nftsRepository.findById(listing.nftId);
    if (!nft) throw new PermanentError("NFT not found");

    const buyer = await usersRepository.ensure({ username: tx.hiveAccount });
    const fee = round(listing.price * MARKETPLACE_FEE_RATE);
    const total = round(listing.price + fee);
    if (buyer.hiveBalance < total) throw new PermanentError("Insufficient HIVE balance");

    const collection = await nftCollectionsRepository.findById(listing.collectionId);
    const purchase = await this.chain.buyNft({
      symbol: collection?.symbol ?? nft.collectionName,
      seller: listing.seller,
      buyer: tx.hiveAccount,
      tokenId: nft.tokenId,
      price: listing.price,
    });

    await emitAppEvent(APP_EVENTS.PAYMENT_CONFIRMED, {
      transactionId: tx.transactionId,
      hiveTransactionId: purchase.hiveTransactionId,
      from: tx.hiveAccount,
      to: MARKET_ACCOUNT,
      amount: total,
      currency: "HIVE",
      memo: `Marketplace purchase · ${nft.name}`,
    });

    await usersRepository.adjustBalance(tx.hiveAccount, -total);
    await usersRepository.ensure({ username: listing.seller });
    await usersRepository.adjustBalance(listing.seller, round(listing.price - fee));

    await nftsRepository.transferOwnership(nft.id, tx.hiveAccount, round(listing.price * 1.05));
    await marketplaceListingsRepository.markSold(listing.id, tx.hiveAccount);
    await nftCollectionsRepository.registerSale(listing.collectionId, listing.price);
    const holders = await nftsRepository.countHolders(listing.collectionId);
    await nftCollectionsRepository.patch(listing.collectionId, { holders });

    await activityRepository.record({
      type: "Sold",
      actor: tx.hiveAccount,
      target: listing.seller,
      nftId: nft.id,
      collectionId: listing.collectionId,
      label: `@${tx.hiveAccount} purchased ${nft.name}`,
      amount: listing.price,
      transactionId: tx.transactionId,
      hiveTransactionId: purchase.hiveTransactionId,
    });

    await emitAppEvent(APP_EVENTS.NFT_SOLD, {
      transactionId: tx.transactionId,
      hiveTransactionId: purchase.hiveTransactionId,
      listingId: listing.id,
      nftId: nft.id,
      collectionId: listing.collectionId,
      seller: listing.seller,
      buyer: tx.hiveAccount,
      price: listing.price,
      marketplaceFee: fee,
    });

    return {
      hiveTransactionId: purchase.hiveTransactionId,
      blockNumber: purchase.blockNumber,
      collectionId: listing.collectionId,
      nftId: nft.id,
      result: { listingId: listing.id, price: listing.price, fee, total, seller: listing.seller },
    };
  }

  private async handleTransfer(tx: PendingTransaction): Promise<ProcessOutcome> {
    const { nftId, to } = tx.payload as { nftId: string; to: string };
    const nft = await nftsRepository.findById(nftId);
    if (!nft) throw new PermanentError("NFT not found");
    if (nft.owner !== tx.hiveAccount) throw new PermanentError("Only the owner can transfer this NFT");

    const active = await marketplaceListingsRepository.findActiveByNft(nftId);
    if (active) await marketplaceListingsRepository.markCancelled(active.id);

    const collection = await nftCollectionsRepository.findById(nft.collectionId);
    const transfer = await this.chain.transferNft({
      symbol: collection?.symbol ?? nft.collectionName,
      from: nft.owner,
      to,
      tokenId: nft.tokenId,
    });

    await usersRepository.ensure({ username: to });
    await nftsRepository.transferOwnership(nft.id, to);
    const holders = await nftsRepository.countHolders(nft.collectionId);
    await nftCollectionsRepository.patch(nft.collectionId, { holders });

    await activityRepository.record({
      type: "Transferred",
      actor: nft.owner,
      target: to,
      nftId: nft.id,
      collectionId: nft.collectionId,
      label: `@${nft.owner} transferred ${nft.name} to @${to}`,
      transactionId: tx.transactionId,
      hiveTransactionId: transfer.hiveTransactionId,
    });

    await emitAppEvent(APP_EVENTS.NFT_TRANSFERRED, {
      transactionId: tx.transactionId,
      hiveTransactionId: transfer.hiveTransactionId,
      nftId: nft.id,
      collectionId: nft.collectionId,
      from: nft.owner,
      to,
    });

    return {
      hiveTransactionId: transfer.hiveTransactionId,
      blockNumber: transfer.blockNumber,
      collectionId: nft.collectionId,
      nftId: nft.id,
      result: { from: nft.owner, to },
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
