import { generateArtwork, hashString, mulberry32 } from "./art";
import type {
  Activity,
  Collection,
  Listing,
  NFT,
  Rarity,
  RarityConfig,
  Transaction,
  User,
} from "./types";

export const CURRENT_USER: User = {
  username: "alice",
  displayName: "Alice",
  avatarSeed: "alice",
};

export const USERS = ["alice", "bob", "charlie", "david", "eve"];

export const DEFAULT_RARITIES: RarityConfig[] = [
  { rarity: "Common", weight: 70 },
  { rarity: "Rare", weight: 20 },
  { rarity: "Epic", weight: 8 },
  { rarity: "Legendary", weight: 2 },
];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

interface CollectionSeed {
  name: string;
  symbol: string;
  creator: string;
  description: string;
  maxSupply: number;
  minted: number;
  mintPrice: number;
  floorPrice: number;
  volume: number;
  holders: number;
  createdDaysAgo: number;
  trendingScore: number;
  nouns: string[];
}

const COLLECTION_SEEDS: CollectionSeed[] = [
  {
    name: "CryptoCore Genesis",
    symbol: "CCG",
    creator: "alice",
    description:
      "The founding collection of the CryptoCore universe. 5,000 hand-tuned mining rigs, engineers and reactors powering the Hive economy.",
    maxSupply: 5000,
    minted: 4218,
    mintPrice: 5,
    floorPrice: 12.5,
    volume: 21480,
    holders: 1382,
    createdDaysAgo: 92,
    trendingScore: 98,
    nouns: ["Miner", "Reactor", "Engineer", "Node", "Core"],
  },
  {
    name: "Lucky Frogs",
    symbol: "FROG",
    creator: "bob",
    description:
      "3,000 amphibious optimists hopping across the Hive chain. Each frog carries its own luck rating and swamp lineage.",
    maxSupply: 3000,
    minted: 3000,
    mintPrice: 2.5,
    floorPrice: 6.25,
    volume: 11240,
    holders: 942,
    createdDaysAgo: 74,
    trendingScore: 71,
    nouns: ["Frog", "Toad", "Tadpole", "Croaker"],
  },
  {
    name: "Pixel Warriors",
    symbol: "PXWR",
    creator: "charlie",
    description:
      "A 4,000 piece pixel-art battle roster. Warriors are generated from 120 traits across weapons, armor and battle scars.",
    maxSupply: 4000,
    minted: 2611,
    mintPrice: 3.5,
    floorPrice: 8,
    volume: 9310,
    holders: 810,
    createdDaysAgo: 58,
    trendingScore: 86,
    nouns: ["Warrior", "Ranger", "Paladin", "Berserker"],
  },
  {
    name: "Hive Legends",
    symbol: "HLGD",
    creator: "alice",
    description:
      "Portraits of the Hive ecosystem's most storied characters, rendered as collectible on-chain cards.",
    maxSupply: 2000,
    minted: 1440,
    mintPrice: 8,
    floorPrice: 18.4,
    volume: 15220,
    holders: 604,
    createdDaysAgo: 41,
    trendingScore: 92,
    nouns: ["Legend", "Oracle", "Witness", "Founder"],
  },
  {
    name: "Cyber Hive",
    symbol: "CYBH",
    creator: "david",
    description:
      "Neon drone swarms and synthetic hives. A cyber-industrial series with animated rarity tiers.",
    maxSupply: 3500,
    minted: 1180,
    mintPrice: 4,
    floorPrice: 5.75,
    volume: 6120,
    holders: 431,
    createdDaysAgo: 27,
    trendingScore: 79,
    nouns: ["Drone", "Beast", "Sentinel", "Swarm"],
  },
  {
    name: "Genesis Beasts",
    symbol: "GBST",
    creator: "eve",
    description:
      "Mythical creatures forged in the first block. Genesis Beasts unlock in-game utility across partner Hive games.",
    maxSupply: 2500,
    minted: 2500,
    mintPrice: 6,
    floorPrice: 14.2,
    volume: 13980,
    holders: 722,
    createdDaysAgo: 65,
    trendingScore: 83,
    nouns: ["Beast", "Wyrm", "Griffin", "Titan"],
  },
  {
    name: "Solar Nomads",
    symbol: "SOLN",
    creator: "charlie",
    description:
      "Wanderers of the solar belt. A quiet, painterly collection focused on landscape and light.",
    maxSupply: 1500,
    minted: 612,
    mintPrice: 3,
    floorPrice: 4.1,
    volume: 2480,
    holders: 288,
    createdDaysAgo: 15,
    trendingScore: 64,
    nouns: ["Nomad", "Voyager", "Drifter", "Pilgrim"],
  },
  {
    name: "Block Botanica",
    symbol: "BOTA",
    creator: "bob",
    description:
      "Generative flora grown from block hashes. Every plant is a snapshot of the chain at mint time.",
    maxSupply: 1800,
    minted: 340,
    mintPrice: 2,
    floorPrice: 2.6,
    volume: 1410,
    holders: 196,
    createdDaysAgo: 6,
    trendingScore: 58,
    nouns: ["Bloom", "Fern", "Sprout", "Thorn"],
  },
];

const ADJECTIVES = ["Legendary", "Ancient", "Neon", "Prime", "Shadow", "Golden", "Frozen", "Solar"];
const TYPES = ["Mining Rig", "Companion", "Vehicle", "Artifact", "Guardian", "Relic"];

export function pickRarity(rarities: RarityConfig[], rand: () => number): Rarity {
  const total = rarities.reduce((s, r) => s + r.weight, 0) || 100;
  let roll = rand() * total;
  for (const r of rarities) {
    roll -= r.weight;
    if (roll <= 0) return r.rarity;
  }
  return rarities[0]?.rarity ?? "Common";
}

export function rarityMultiplier(rarity: Rarity): number {
  switch (rarity) {
    case "Legendary":
      return 10;
    case "Epic":
      return 5;
    case "Rare":
      return 2.4;
    default:
      return 1.15;
  }
}

export function buildNFT(params: {
  collection: Collection;
  mintNumber: number;
  owner: string;
  createdAt: string;
  rarity: Rarity;
  seedKey: string;
}): NFT {
  const { collection, mintNumber, owner, createdAt, rarity, seedKey } = params;
  const rand = mulberry32(hashString(seedKey));
  const noun = collection.name.split(" ")[0] ?? "Token";
  const adj = ADJECTIVES[Math.floor(rand() * ADJECTIVES.length)] ?? "Prime";
  const tokenId = mintNumber;
  const power = 20 + Math.floor(rand() * 60) + Math.round(rarityMultiplier(rarity) * 3);
  const value = Number(
    (collection.mintPrice * rarityMultiplier(rarity) * (0.85 + rand() * 0.5)).toFixed(2),
  );
  return {
    id: `${collection.id}-${tokenId}`,
    collectionId: collection.id,
    collectionName: collection.name,
    tokenId,
    name: `${adj} ${noun} #${tokenId}`,
    description: `A ${rarity.toLowerCase()} piece from ${collection.name}. Minted through the HiveMint launchpad and secured as a Hive Engine NFT.`,
    image: generateArtwork(`${collection.id}-${tokenId}`, rarity),
    rarity,
    mintNumber,
    maxSupply: collection.maxSupply,
    owner,
    attributes: [
      { trait: "Rarity", value: rarity },
      { trait: "Power", value: Math.min(99, power) },
      { trait: "Type", value: TYPES[Math.floor(rand() * TYPES.length)] ?? "Artifact" },
      { trait: "Generation", value: 1 },
    ],
    metadataUri: `${collection.metadataBaseUri}${tokenId}.json`,
    estimatedValue: value,
    createdAt,
    status: "Owned",
  };
}

export interface SeedData {
  collections: Collection[];
  nfts: NFT[];
  listings: Listing[];
  activities: Activity[];
  transactions: Transaction[];
}

export function createSeedData(): SeedData {
  const collections: Collection[] = COLLECTION_SEEDS.map((s, i) => ({
    id: `col-${i + 1}`,
    name: s.name,
    symbol: s.symbol,
    creator: s.creator,
    description: s.description,
    image: generateArtwork(`collection-${s.symbol}`, i % 2 === 0 ? "Epic" : "Rare"),
    maxSupply: s.maxSupply,
    minted: s.minted,
    mintPrice: s.mintPrice,
    creatorFee: 85,
    platformFee: 5,
    rarities: DEFAULT_RARITIES.map((r) => ({ ...r })),
    status: s.minted >= s.maxSupply ? "Sold Out" : "Minting",
    createdAt: ago(s.createdDaysAgo * DAY),
    floorPrice: s.floorPrice,
    volume: s.volume,
    holders: s.holders,
    trendingScore: s.trendingScore,
    metadataBaseUri: `https://meta.hivemint.app/${s.symbol.toLowerCase()}/`,
  }));

  const nfts: NFT[] = [];
  const rand = mulberry32(20260820);

  collections.forEach((collection, ci) => {
    const perCollection = ci < 4 ? 9 : 7;
    for (let i = 0; i < perCollection; i++) {
      const mintNumber = Math.max(1, Math.floor(rand() * collection.minted) || i + 1);
      const rarity = pickRarity(collection.rarities, rand);
      // Ensure @alice owns a healthy slice of the catalogue.
      const owner =
        i < 3 && ci < 5 ? "alice" : USERS[Math.floor(rand() * USERS.length)] ?? "bob";
      nfts.push(
        buildNFT({
          collection,
          mintNumber,
          owner,
          rarity,
          createdAt: ago(Math.floor(rand() * 40 * DAY) + HOUR),
          seedKey: `${collection.id}-seed-${i}`,
        }),
      );
    }
  });

  // Guarantee the showcase NFT from the brief.
  const ccg = collections[0]!;
  const showcase = buildNFT({
    collection: ccg,
    mintNumber: 1842,
    owner: "alice",
    rarity: "Legendary",
    createdAt: ago(3 * DAY),
    seedKey: "showcase-1842",
  });
  showcase.name = "Legendary Miner #1842";
  showcase.attributes = [
    { trait: "Rarity", value: "Legendary" },
    { trait: "Power", value: 95 },
    { trait: "Type", value: "Mining Rig" },
    { trait: "Generation", value: 1 },
  ];
  showcase.estimatedValue = 52;
  nfts.unshift(showcase);

  // Deduplicate by id (random mint numbers may collide).
  const seen = new Set<string>();
  const uniqueNfts = nfts.filter((n) => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });

  // Listings: sellers list NFTs they own (alice keeps a few unlisted).
  const listings: Listing[] = [];
  uniqueNfts.forEach((nft, i) => {
    const shouldList = nft.owner === "alice" ? i % 7 === 3 : i % 3 !== 0;
    if (!shouldList || listings.length >= 24) return;
    const price = Number((nft.estimatedValue * (0.9 + rand() * 0.55)).toFixed(2));
    listings.push({
      id: `lst-${listings.length + 1}`,
      nftId: nft.id,
      seller: nft.owner,
      price,
      currency: "HIVE",
      listedAt: ago(Math.floor(rand() * 6 * DAY) + 10 * MINUTE),
      featured: listings.length < 4,
    });
    nft.status = "Listed";
  });

  const activities: Activity[] = [];
  const transactions: Transaction[] = [];
  const pushActivity = (a: Activity) => activities.push(a);

  collections.forEach((c, i) => {
    pushActivity({
      id: `act-col-${i}`,
      type: "Collection Created",
      actor: c.creator,
      collectionId: c.id,
      label: `@${c.creator} created ${c.name}`,
      amount: 25,
      txId: `MOCK-HIVE-${c.symbol}00${i}`,
      createdAt: c.createdAt,
    });
  });

  uniqueNfts.slice(0, 22).forEach((nft, i) => {
    pushActivity({
      id: `act-mint-${i}`,
      type: "Minted",
      actor: nft.owner,
      nftId: nft.id,
      collectionId: nft.collectionId,
      label: `@${nft.owner} minted ${nft.name}`,
      amount: collections.find((c) => c.id === nft.collectionId)?.mintPrice ?? 5,
      txId: `MOCK-HIVE-M${(1000 + i).toString(16).toUpperCase()}`,
      createdAt: nft.createdAt,
    });
  });

  listings.slice(0, 14).forEach((l, i) => {
    const nft = uniqueNfts.find((n) => n.id === l.nftId)!;
    pushActivity({
      id: `act-list-${i}`,
      type: "Listed",
      actor: l.seller,
      nftId: l.nftId,
      collectionId: nft.collectionId,
      label: `@${l.seller} listed ${nft.name}`,
      amount: l.price,
      txId: `MOCK-HIVE-L${(2000 + i).toString(16).toUpperCase()}`,
      createdAt: l.listedAt,
    });
  });

  // Historical sales (not tied to open listings).
  uniqueNfts.slice(4, 14).forEach((nft, i) => {
    const price = Number((nft.estimatedValue * 1.1).toFixed(2));
    const buyer = USERS[(i + 1) % USERS.length] ?? "bob";
    pushActivity({
      id: `act-sale-${i}`,
      type: "Sold",
      actor: buyer,
      target: nft.owner,
      nftId: nft.id,
      collectionId: nft.collectionId,
      label: `@${buyer} purchased ${nft.name}`,
      amount: price,
      txId: `MOCK-HIVE-S${(3000 + i).toString(16).toUpperCase()}`,
      createdAt: ago(Math.floor(rand() * 5 * DAY) + 20 * MINUTE),
    });
    transactions.push({
      id: `tx-${i + 1}`,
      txId: `MOCK-HIVE-S${(3000 + i).toString(16).toUpperCase()}`,
      type: "sale",
      from: buyer,
      to: nft.owner,
      amount: price,
      memo: `Secondary sale · ${nft.name}`,
      createdAt: ago(Math.floor(rand() * 5 * DAY) + 20 * MINUTE),
    });
  });

  transactions.push(
    {
      id: "tx-100",
      txId: "MOCK-HIVE-7F82A91C",
      type: "mint",
      from: "alice",
      to: "hivemint",
      amount: 5.25,
      memo: "Mint · CryptoCore Genesis",
      createdAt: ago(3 * DAY),
    },
    {
      id: "tx-101",
      txId: "MOCK-HIVE-2B41D0E8",
      type: "collection_create",
      from: "alice",
      to: "hivemint",
      amount: 25,
      memo: "Collection deployment · Hive Legends",
      createdAt: ago(41 * DAY),
    },
  );

  activities.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  transactions.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  return { collections, nfts: uniqueNfts, listings, activities, transactions };
}
