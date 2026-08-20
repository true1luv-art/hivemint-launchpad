/**
 * Central application configuration.
 *
 * RULE: nothing else in the application reads `process.env` directly.
 * Every environment value is read here once, validated, and exposed typed.
 */

type NodeEnv = "development" | "test" | "production";
type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

function env(key: string): string | undefined {
  // `process` is not defined in every runtime (browser bundles), so guard.
  if (typeof process === "undefined" || !process.env) return undefined;
  const value = process.env[key];
  return value === undefined || value === "" ? undefined : value;
}

function num(key: string, fallback: number): number {
  const raw = env(key);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(key: string, fallback: boolean): boolean {
  const raw = env(key);
  if (raw === undefined) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

export interface AppConfig {
  nodeEnv: NodeEnv;
  logLevel: LogLevel;
  /** Mongo connection string. Used by the Mongo storage driver (Phase 3). */
  databaseUrl: string;
  databaseName: string;
  /**
   * Storage driver.
   * - `memory`  : in-process store (edge/serverless safe, optional file snapshot)
   * - `mongodb` : MongoDB driver, enabled once a reachable Mongo host exists
   */
  databaseDriver: "memory" | "mongodb";
  /** Where the memory driver snapshots data when a filesystem is available. */
  databaseFile: string;
  apiPort: number;
  /** Smart-contract worker poll interval, ms. */
  smartContractInterval: number;
  /** Max processing attempts before a pending transaction is failed permanently. */
  smartContractMaxAttempts: number;
  /** Simulated blockchain latency, ms. */
  blockchainLatency: number;
  /** Seed the database automatically when it is empty (development only). */
  autoSeed: boolean;
  /** Development user used until Hive Keychain auth lands in Phase 3. */
  devUser: string;
  /** Mock Keychain behaviour. `reject` simulates a user declining the prompt. */
  keychain: {
    /** "approve" | "reject" — default authorization outcome of MockKeychain. */
    defaultOutcome: "approve" | "reject";
    /** Simulated signing latency, ms. */
    latency: number;
  };
  /** Asset storage (Mock IPFS in Phase 2.5B, Pinata/Kubo/Filebase in Phase 3). */
  storage: {
    provider: "mock-ipfs";
    /** Simulated per-upload latency, ms. */
    uploadLatency: number;
    /** 0..1 — simulated per-upload failure rate, used to exercise retries. */
    failureRate: number;
    /** Max size of a single NFT asset file, bytes. */
    maxAssetFileSize: number;
    /** Max size of the collection artwork, bytes. */
    maxCollectionAssetSize: number;
    /** Max number of NFT asset files per collection. */
    maxNftAssets: number;
    /** Accepted image mime types. */
    supportedImageTypes: string[];
    /** Accepted file extensions (lowercase, with dot). */
    supportedExtensions: string[];
  };
  fees: {
    /**
     * Cost, in HIVE, charged per mintable slot when a collection is deployed.
     * creationCost = maxSupply x NFT_CREATION_COST_PER_MINT
     */
    nftCreationCostPerMint: number;
    nftCreationCurrency: "HIVE";
    /** Platform cut of every mint, in percent (e.g. 5 = 5%). */
    platformMintFeePercent: number;
    /** Platform cut of every marketplace sale, in percent. */
    marketplaceFeePercent: number;
    platformAccount: string;
    marketAccount: string;
  };
}

export const config: AppConfig = {
  nodeEnv: (env("NODE_ENV") as NodeEnv | undefined) ?? "development",
  logLevel: (env("LOG_LEVEL") as LogLevel | undefined) ?? "info",
  databaseUrl: env("DATABASE_URL") ?? "mongodb://127.0.0.1:27017",
  databaseName: env("DATABASE_NAME") ?? "hivemint",
  databaseDriver: (env("DATABASE_DRIVER") as AppConfig["databaseDriver"] | undefined) ?? "memory",
  databaseFile: env("DATABASE_FILE") ?? ".data/hivemint.json",
  apiPort: num("API_PORT", 4000),
  smartContractInterval: num("SMART_CONTRACT_POLL_INTERVAL_MS", num("SMART_CONTRACT_INTERVAL", 1500)),
  smartContractMaxAttempts: num("SMART_CONTRACT_MAX_ATTEMPTS", 3),
  blockchainLatency: num("BLOCKCHAIN_LATENCY", 400),
  autoSeed: bool("AUTO_SEED", true),
  devUser: env("DEV_USER") ?? "alice",
  keychain: {
    defaultOutcome: (env("KEYCHAIN_DEFAULT_OUTCOME") as "approve" | "reject" | undefined) ?? "approve",
    latency: num("KEYCHAIN_LATENCY", 120),
  },
  storage: {
    provider: "mock-ipfs",
    uploadLatency: num("STORAGE_UPLOAD_LATENCY", 25),
    failureRate: num("STORAGE_FAILURE_RATE", 0),
    maxAssetFileSize: num("MAX_ASSET_FILE_SIZE", 10 * 1024 * 1024),
    maxCollectionAssetSize: num("MAX_COLLECTION_ASSET_SIZE", 15 * 1024 * 1024),
    maxNftAssets: num("MAX_NFT_ASSETS", 10_000),
    supportedImageTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    supportedExtensions: [".png", ".jpg", ".jpeg", ".webp", ".gif"],
  },
  fees: {
    nftCreationCostPerMint: num("NFT_CREATION_COST_PER_MINT", 0.1),
    nftCreationCurrency: "HIVE",
    platformMintFeePercent: num("PLATFORM_MINT_FEE_PERCENT", 5),
    marketplaceFeePercent: num("MARKETPLACE_FEE_PERCENT", 2.5),
    platformAccount: env("PLATFORM_ACCOUNT") ?? "hivemint",
    marketAccount: env("MARKET_ACCOUNT") ?? "hivemint-market",
  },
};

export const isProduction = config.nodeEnv === "production";

const round3 = (value: number) => Number(value.toFixed(3));

/** Collection deployment cost: maxSupply x NFT_CREATION_COST_PER_MINT. */
export function collectionCreationCost(maxSupply: number): number {
  return round3(maxSupply * config.fees.nftCreationCostPerMint);
}

/** Splits a mint payment into the platform cut and the creator payout. */
export function splitMintPayment(mintPrice: number): {
  mintPrice: number;
  platformFee: number;
  creatorShare: number;
  total: number;
} {
  const platformFee = round3(mintPrice * (config.fees.platformMintFeePercent / 100));
  return {
    mintPrice: round3(mintPrice),
    platformFee,
    creatorShare: round3(mintPrice - platformFee),
    total: round3(mintPrice),
  };
}

/** Splits a marketplace sale into the marketplace fee and the seller payout. */
export function splitSalePayment(price: number): {
  price: number;
  fee: number;
  sellerProceeds: number;
  total: number;
} {
  const fee = round3(price * (config.fees.marketplaceFeePercent / 100));
  return { price: round3(price), fee, sellerProceeds: round3(price - fee), total: round3(price + fee) };
}

