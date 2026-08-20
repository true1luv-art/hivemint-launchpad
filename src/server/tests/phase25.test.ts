/**
 * Phase 2.5 separation-of-concerns test suite.
 *
 * Runnable without a test runner: `npm run test:phase25`.
 *
 * Verifies:
 *  - the pending queue only ever holds platform operations
 *  - marketplace operations run directly (Keychain signed) and are idempotent
 *  - a rejected Keychain prompt aborts a direct operation with no side effects
 *  - minting never overruns maxSupply (slot reservation)
 */
import { seedDatabase } from "@/server/seed/seed";
import { getWorker } from "@/server/smart-contract";
import { getMarketplaceService, MarketplaceService } from "@/server/marketplace/marketplace.service";
import { MockKeychainService } from "@/server/keychain/mock-keychain.service";
import { transactionsPendingRepository } from "@/lib/modules/transactions-pending/transactions-pending.repository";
import { transactionsProcessedRepository } from "@/lib/modules/transactions-processed/transactions-processed.repository";
import { nftCollectionsRepository } from "@/lib/modules/nft-collections/nft-collections.repository";
import { nftsRepository } from "@/lib/modules/nfts/nfts.repository";
import { marketplaceListingsRepository } from "@/lib/modules/marketplace-listings/marketplace-listings.repository";
import { usersRepository } from "@/lib/modules/users/users.repository";
import { getBlockchainService } from "@/server/smart-contract";

interface Result {
  name: string;
  ok: boolean;
  error?: string;
}

const results: Result[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

const rid = () => `req_test_${Math.random().toString(36).slice(2, 12)}`;

async function mint(collectionId: string, account: string) {
  const { transaction } = await transactionsPendingRepository.enqueue({
    type: "MINT_NFT",
    requestId: rid(),
    userId: account,
    hiveAccount: account,
    collectionId,
    payload: { collectionId, quantity: 1 },
  });
  await getWorker().drain(5);
  return transaction;
}

async function run() {
  await seedDatabase({ force: true });

  const collections = await nftCollectionsRepository.listAll();
  const collection = collections[0]!;
  const owner = "alice";
  const buyer = "bob";
  await usersRepository.ensure({ username: owner });
  await usersRepository.ensure({ username: buyer });
  await usersRepository.adjustBalance(owner, 10_000);
  await usersRepository.adjustBalance(buyer, 10_000);

  await test("queue accepts platform operations and the worker processes them", async () => {
    const before = await nftsRepository.count();
    const tx = await mint(collection.id, owner);
    const pending = await transactionsPendingRepository.findByTransactionId(tx.transactionId);
    assert(pending?.status === "processed", `expected processed, got ${pending?.status}`);
    assert((await nftsRepository.count()) === before + 1, "one NFT should have been minted");
  });

  await test("pending queue never contains marketplace operations", async () => {
    const all = await transactionsPendingRepository.find();
    const bad = all.filter((t) => t.type !== "CREATE_COLLECTION" && t.type !== "MINT_NFT");
    assert(bad.length === 0, `found queued marketplace ops: ${bad.map((t) => t.type).join(", ")}`);
  });

  const marketplace = getMarketplaceService();
  const owned = (await nftsRepository.listByOwner(owner)).filter((n) => n.status === "owned");
  const nft = owned[0]!;

  await test("list runs directly without touching the queue", async () => {
    const queuedBefore = await transactionsPendingRepository.count();
    const result = await marketplace.list({ requestId: rid(), hiveAccount: owner }, { nftId: nft.id, price: 42 });
    assert(result.direct && result.status === "processed", "listing should confirm immediately");
    assert((await transactionsPendingRepository.count()) === queuedBefore, "listing must not enqueue anything");
    const receipt = await transactionsProcessedRepository.findByTransactionId(result.transactionId);
    assert(receipt?.type === "LIST_NFT", "a processed receipt must exist for the direct op");
    const listing = await marketplaceListingsRepository.findActiveByNft(nft.id);
    assert(listing?.price === 42, "an active listing should exist");
  });

  await test("direct operations are idempotent on requestId", async () => {
    const other = (await nftsRepository.listByOwner(owner)).find((n) => n.status === "owned")!;
    const requestId = rid();
    const first = await marketplace.list({ requestId, hiveAccount: owner }, { nftId: other.id, price: 15 });
    const second = await marketplace.list({ requestId, hiveAccount: owner }, { nftId: other.id, price: 15 });
    assert(second.duplicate, "the retried call must return the original receipt");
    assert(second.transactionId === first.transactionId, "transaction id must be stable");
    const listings = (await marketplaceListingsRepository.listByCollection(other.collectionId)).filter(
      (l) => l.nftId === other.id && l.status === "active",
    );
    assert(listings.length === 1, `expected 1 active listing, got ${listings.length}`);
  });

  await test("buy transfers ownership, pays the seller and closes the listing", async () => {
    const listing = (await marketplaceListingsRepository.listActive()).find((l) => l.seller === owner)!;
    const sellerBefore = (await usersRepository.findByUsername(owner))!.hiveBalance;
    const result = await marketplace.buy({ requestId: rid(), hiveAccount: buyer }, { listingId: listing.id });
    const updatedNft = await nftsRepository.findById(listing.nftId);
    const sold = await marketplaceListingsRepository.findById(listing.id);
    const sellerAfter = (await usersRepository.findByUsername(owner))!.hiveBalance;
    assert(updatedNft?.owner === buyer, "buyer should own the NFT");
    assert(sold?.status === "sold", "listing should be marked sold");
    assert(sellerAfter > sellerBefore, "seller should be paid");
    assert(result.type === "BUY_NFT" && result.direct, "buy should be a direct operation");
  });

  await test("a rejected Keychain prompt aborts the operation with no side effects", async () => {
    const rejecting = new MarketplaceService(getBlockchainService(), new MockKeychainService("reject"));
    const target = (await nftsRepository.listByOwner(owner)).find((n) => n.status === "owned")!;
    const listingsBefore = await marketplaceListingsRepository.count();
    let threw = false;
    try {
      await rejecting.list({ requestId: rid(), hiveAccount: owner }, { nftId: target.id, price: 9 });
    } catch (error) {
      threw = (error as Error).name === "KeychainRejectedError";
    }
    assert(threw, "a rejected prompt must throw KeychainRejectedError");
    assert((await marketplaceListingsRepository.count()) === listingsBefore, "no listing should be written");
    const after = await nftsRepository.findById(target.id);
    assert(after?.status === "owned", "NFT status must be unchanged");
  });

  await test("minting cannot overrun maxSupply", async () => {
    const small = await nftCollectionsRepository.insert({
      ...collection,
      id: `col_supplytest_${Date.now()}`,
      name: "Supply Test",
      symbol: "SUPPLY",
      maxSupply: 2,
      minted: 0,
      volume: 0,
      holders: 0,
      status: "active",
      mintPrice: 1,
    });
    await usersRepository.adjustBalance(owner, 1_000);

    for (let i = 0; i < 5; i++) await mint(small.id, owner);

    const after = await nftCollectionsRepository.findById(small.id);
    const minted = (await nftsRepository.listByCollection(small.id)).length;
    assert(after?.minted === 2, `collection.minted should be 2, got ${after?.minted}`);
    assert(minted === 2, `only 2 NFTs should exist, got ${minted}`);
    assert(after?.status === "sold_out", "collection should be sold out");
  });

  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.error ? ` — ${r.error}` : ""}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

void run();
