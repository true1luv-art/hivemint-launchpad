/**
 * Storage provider registry.
 *
 * Application code imports `getStorageProvider()` and the `StorageProvider`
 * type — never `MockIPFSProvider` directly. Phase 3 swaps the factory body for
 * `new PinataProvider(...)` and nothing else changes.
 */
import { MockIPFSProvider } from "./mock-ipfs";
import type { StorageProvider } from "./types";

interface StorageGlobal {
  __hivemint_storage?: StorageProvider | undefined;
}
const store = globalThis as unknown as StorageGlobal;

export function getStorageProvider(): StorageProvider {
  if (!store.__hivemint_storage) store.__hivemint_storage = new MockIPFSProvider();
  return store.__hivemint_storage;
}

/** Test / DI hook. */
export function setStorageProvider(provider: StorageProvider): void {
  store.__hivemint_storage = provider;
}

export type { StorageProvider };
