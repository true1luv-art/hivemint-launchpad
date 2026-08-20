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
  fees: {
    platformFeeRate: number;
    marketplaceFeeRate: number;
    collectionCreationFee: number;
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
  smartContractInterval: num("SMART_CONTRACT_INTERVAL", 1500),
  smartContractMaxAttempts: num("SMART_CONTRACT_MAX_ATTEMPTS", 3),
  blockchainLatency: num("BLOCKCHAIN_LATENCY", 400),
  autoSeed: bool("AUTO_SEED", true),
  devUser: env("DEV_USER") ?? "alice",
  fees: {
    platformFeeRate: num("PLATFORM_FEE_RATE", 0.05),
    marketplaceFeeRate: num("MARKETPLACE_FEE_RATE", 0.025),
    collectionCreationFee: num("COLLECTION_CREATION_FEE", 25),
  },
};

export const isProduction = config.nodeEnv === "production";
