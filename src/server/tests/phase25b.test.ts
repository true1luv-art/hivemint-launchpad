/**
 * Phase 2.5B storage / mock-IPFS test suite.
 *
 * Run with: `npm run test:phase25b`
 *
 * Verifies:
 *  - CIDs are deterministic (same content -> same CID) and content-addressed
 *  - metadata JSON round-trips through the provider
 *  - validation rejects bad type/size/duplicates and short asset sets
 *  - no CREATE_COLLECTION can be prepared before every CID exists
 *  - a prepared collection stays PENDING until the worker confirms it
 *  - minted NFTs reuse the collection's uploaded assets
 */
import { getStorageProvider } from "@/lib/storage/storage";
import { buildCollectionMetadata, buildNftMetadata } from "@/lib/storage/metadata";
import {
  validateCollectionAsset,
  validateNftAssets,
  validateSupplyCoverage,
} from "@/lib/storage/validation";
import { prepareCollection, type CollectionAssetBundle } from "@/server/collections/collection-creation.service";
import { nftCollectionsRepository } from "@/lib/modules/nft-collections/nft-collections.repository";
import { nftAssetsRepository } from "@/lib/modules/nft-assets/nft-assets.repository";
import { nftsRepository } from "@/lib/modules/nfts/nfts.repository";
import { transactionsPendingRepository } from "@/lib/modules/transactions-pending/transactions-pending.repository";
import { usersRepository } from "@/lib/modules/users/users.repository";
import { seedDatabase } from "@/server/seed/seed";
import { getWorker } from "@/server/smart-contract";
import { DEFAULT_RARITIES } from "@/lib/mock-data";

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

const bytes = (text: string) => new TextEncoder().encode(text);

async function buildBundle(symbol: string, count: number): Promise<CollectionAssetBundle> {
  const storage = getStorageProvider();
  const image = await storage.uploadFile({ filename: "cover.png", mimeType: "image/png", content: bytes(`${symbol}-cover`) });
  const dir = await storage.uploadDirectory(
    `${symbol}-assets`,
    Array.from({ length: count }, (_, i) => ({
      filename: `${i + 1}.png`,
      mimeType: "image/png",
      content: bytes(`${symbol}-asset-${i + 1}`),
    })),
  );
  const metaDir = await storage.uploadDirectory(
    `${symbol}-metadata`,
    dir.entries.map((entry, i) => ({
      filename: `${i + 1}.json`,
      mimeType: "application/json",
      content: JSON.stringify(
        buildNftMetadata({ collectionName: symbol, tokenNumber: i + 1, description: "t", imageUri: entry.uri }),
      ),
    })),
  );
  const collectionMeta = await storage.uploadJson(
    "collection.json",
    buildCollectionMetadata({
      name: symbol,
      symbol,
      description: "t",
      imageUri: image.uri,
      maxSupply: count,
      mintPrice: 1,
      creator: "alice",
    }),
  );
  return {
    collectionImageUri: image.uri,
    collectionMetadataUri: collectionMeta.uri,
    assetRootUri: dir.uri,
    metadataRootUri: metaDir.uri,
    reusableAssets: false,
    items: dir.entries.map((entry, i) => ({
      tokenNumber: i + 1,
      filename: entry.filename,
      mimeType: entry.mimeType,
      size: entry.size,
      imageUri: entry.uri,
      metadataUri: metaDir.entries[i]!.uri,
      cid: entry.cid,
    })),
  };
}

async function run() {
  await seedDatabase({ force: true });
  const storage = getStorageProvider();

  await test("CIDs are deterministic and content-addressed", async () => {
    const a = await storage.uploadFile({ filename: "a.png", mimeType: "image/png", content: bytes("hello") });
    const b = await storage.uploadFile({ filename: "b.png", mimeType: "image/png", content: bytes("hello") });
    const c = await storage.uploadFile({ filename: "a.png", mimeType: "image/png", content: bytes("world") });
    assert(a.cid === b.cid, "identical content must produce identical CIDs");
    assert(a.cid !== c.cid, "different content must produce different CIDs");
    assert(a.uri === `ipfs://${a.cid}`, "uri must be ipfs://<cid>");
    assert(/^bafybei[a-z2-7]+$/.test(a.cid), `CID must look real, got ${a.cid}`);
  });

  await test("metadata JSON uploads produce stable references", async () => {
    const meta = buildNftMetadata({ collectionName: "Test", tokenNumber: 1, description: "d", imageUri: "ipfs://bafybeitest" });
    const one = await storage.uploadJson("1.json", meta);
    const two = await storage.uploadJson("1.json", meta);
    assert(one.cid === two.cid, "same metadata must pin to the same CID");
    assert(one.mimeType === "application/json", "metadata must be JSON");
  });

  await test("validation rejects bad type, size and duplicates", async () => {
    assert(!validateCollectionAsset({ name: "art.exe", type: "application/x-msdownload", size: 10 }).ok, "bad type passed");
    assert(!validateNftAssets([{ name: "1.png", type: "image/png", size: 900_000_000 }]).ok, "oversized file passed");
    const dupes = validateNftAssets([
      { name: "1.png", type: "image/png", size: 10 },
      { name: "1.png", type: "image/png", size: 10 },
    ]);
    assert(!dupes.ok, "duplicate filenames passed");
  });

  await test("supply coverage requires one asset per token unless reusable", async () => {
    assert(!validateSupplyCoverage(3, 10, false).ok, "short asset set must fail");
    assert(validateSupplyCoverage(3, 10, true).ok, "reusable mode must pass");
  });

  await test("collection cannot be prepared without every CID", async () => {
    const bundle = await buildBundle("NOCID", 2);
    let failed = false;
    try {
      await prepareCollection({
        creator: "alice",
        name: "No CID",
        symbol: "NOCID",
        description: "d",
        maxSupply: 2,
        mintPrice: 1,
        creatorFee: 85,
        platformFee: 5,
        rarities: DEFAULT_RARITIES,
        assets: { ...bundle, collectionImageUri: "" },
      });
    } catch {
      failed = true;
    }
    assert(failed, "prepareCollection accepted a missing CID");
    assert((await nftCollectionsRepository.findOne({ symbol: "NOCID" })) === null, "a collection row leaked");
  });

  await test("prepared collection stays PENDING until the worker confirms", async () => {
    const bundle = await buildBundle("ASTX", 3);
    await usersRepository.ensure({ username: "alice" });
    await usersRepository.adjustBalance("alice", 1000);
    const prepared = await prepareCollection({
      creator: "alice",
      name: "Asset Test",
      symbol: "ASTX",
      description: "d",
      maxSupply: 3,
      mintPrice: 1,
      creatorFee: 85,
      platformFee: 5,
      rarities: DEFAULT_RARITIES,
      assets: bundle,
    });
    const pending = await nftCollectionsRepository.findById(prepared.collectionId);
    assert(pending?.creationState === "PENDING", `expected PENDING, got ${pending?.creationState}`);
    assert(prepared.creationCost === 0.3, `expected 3 x 0.1 HIVE, got ${prepared.creationCost}`);
    assert((await nftAssetsRepository.countByCollection(prepared.collectionId)) === 3, "assets were not indexed");

    await transactionsPendingRepository.enqueue({
      type: "CREATE_COLLECTION",
      requestId: `req_${Math.random().toString(36).slice(2)}`,
      userId: "alice",
      hiveAccount: "alice",
      collectionId: prepared.collectionId,
      amount: prepared.creationCost,
      payload: prepared.payload,
    });
    await getWorker().drain(5);
    const active = await nftCollectionsRepository.findById(prepared.collectionId);
    assert(active?.creationState === "ACTIVE", `expected ACTIVE, got ${active?.creationState}`);
    assert(active?.assetRootUri === bundle.assetRootUri, "asset root was not persisted");

    // Mint reuses the uploaded asset instead of creating a new file.
    await transactionsPendingRepository.enqueue({
      type: "MINT_NFT",
      requestId: `req_${Math.random().toString(36).slice(2)}`,
      userId: "alice",
      hiveAccount: "alice",
      collectionId: prepared.collectionId,
      payload: { collectionId: prepared.collectionId, quantity: 1 },
    });
    await getWorker().drain(5);
    const minted = (await nftsRepository.find({ collectionId: prepared.collectionId }))[0];
    assert(!!minted, "no NFT was minted");
    assert(
      bundle.items.some((i) => i.imageUri === minted!.imageUri),
      `minted NFT did not reuse a collection asset (${minted!.imageUri})`,
    );
  });

  const failures = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.error ? ` — ${r.error}` : ""}`);
  }
  console.log(`\n${results.length - failures.length}/${results.length} passed`);
  if (failures.length) process.exit(1);
}

void run();
