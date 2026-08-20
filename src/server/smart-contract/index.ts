import { MockBlockchainService } from "./mock-blockchain.service";
import type { BlockchainService } from "./blockchain.service";

/**
 * Blockchain service factory.
 *
 * Phase 3:
 *   if (config.blockchainDriver === "hive") return new HiveBlockchainService(dhiveClient)
 */
let instance: BlockchainService | null = null;

export function getBlockchainService(): BlockchainService {
  if (!instance) instance = new MockBlockchainService();
  return instance;
}

/** Test/di hook. */
export function setBlockchainService(service: BlockchainService) {
  instance = service;
}

export type { BlockchainService } from "./blockchain.service";
export { MockBlockchainService } from "./mock-blockchain.service";
export { SmartContractWorker, getWorker } from "./worker";
