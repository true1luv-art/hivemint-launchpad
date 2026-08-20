/**
 * Standalone smart-contract worker process.
 *
 *   npm run server:smart-contract
 *
 * Runs the transaction pipeline as an independent Node process, exactly as it
 * will run next to the eventual Next.js app. It shares nothing with the web
 * runtime except the database: it claims pending transactions with a lease,
 * so running it alongside the inline drain in the API is safe.
 *
 * No React, no Zustand, no browser APIs are reachable from this entrypoint.
 */
import { config } from "@/lib/config/config";
import { logger } from "@/lib/config/logger";
import { getDatabase } from "@/lib/config/database";
import { ensureSeeded } from "@/server/seed/seed";
import { getWorker } from "./worker";

async function main() {
  logger.info("SMART-CONTRACT", "Starting worker process", {
    driver: config.databaseDriver,
    database: config.databaseName,
    pollIntervalMs: config.smartContractInterval,
  });

  await ensureSeeded();
  const worker = getWorker();
  worker.start();
  logger.info("SMART-CONTRACT", `Worker ${worker.id} watching transactions_pending`);

  const shutdown = async (signal: string) => {
    logger.info("SMART-CONTRACT", `Received ${signal}, stopping worker`);
    worker.stop();
    const db = await getDatabase();
    await db.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main().catch((error) => {
  logger.error("SMART-CONTRACT", "Worker crashed", error);
  process.exit(1);
});
