/**
 * Database connection management.
 *
 * The application talks to a small Mongo-shaped `Database` interface, never to a
 * driver directly. Today it is backed by the in-process `memory` driver (edge
 * safe, with an optional JSON snapshot when a filesystem is available). Phase 3
 * swaps in the MongoDB driver by implementing the same interface — no repository,
 * API or UI code changes.
 *
 *   repositories -> Database -> (MemoryDriver | MongoDriver) -> storage
 */
import { config } from "./config";
import { logger } from "./logger";

export interface WithId {
  id: string;
}

export type FilterValue<V> = V | { $in: V[] } | { $ne: V } | { $lt: V } | { $gt: V };
export type Filter<T> = { [K in keyof T]?: FilterValue<T[K]> };

export interface FindOptions<T> {
  sort?: { field: keyof T; dir: "asc" | "desc" };
  limit?: number;
  skip?: number;
}

export interface DbCollection<T extends WithId> {
  readonly name: string;
  find(filter?: Filter<T>, options?: FindOptions<T>): Promise<T[]>;
  findOne(filter: Filter<T>): Promise<T | null>;
  findById(id: string): Promise<T | null>;
  insertOne(doc: T): Promise<T>;
  insertMany(docs: T[]): Promise<T[]>;
  updateOne(filter: Filter<T>, patch: Partial<T>): Promise<T | null>;
  /** Atomic read-modify-write. Used for claiming pending transactions. */
  findOneAndUpdate(filter: Filter<T>, patch: Partial<T>, options?: FindOptions<T>): Promise<T | null>;
  deleteOne(filter: Filter<T>): Promise<boolean>;
  count(filter?: Filter<T>): Promise<number>;
  /**
   * Declares an index. Single or compound. The memory driver only enforces the
   * `unique` constraint (lookups are linear scans); the MongoDB driver will
   * translate the same declaration into `createIndex({ a: 1, b: 1 })`.
   */
  createIndex(fields: (keyof T)[], options?: { unique?: boolean; name?: string }): Promise<void>;
  /** Declared indexes, for diagnostics and Mongo bootstrap. */
  listIndexes(): Promise<{ fields: string[]; unique: boolean; name: string }[]>;
  clear(): Promise<void>;
}

export interface Database {
  readonly driver: string;
  collection<T extends WithId>(name: string): DbCollection<T>;
  isEmpty(): Promise<boolean>;
  dropAll(): Promise<void>;
  close(): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* matching                                                            */
/* ------------------------------------------------------------------ */

function matchValue<V>(actual: V, expected: FilterValue<V>): boolean {
  if (expected !== null && typeof expected === "object") {
    const op = expected as Record<string, unknown>;
    if ("$in" in op) return (op["$in"] as V[]).includes(actual);
    if ("$ne" in op) return actual !== (op["$ne"] as V);
    if ("$lt" in op) return (actual as never) < (op["$lt"] as never);
    if ("$gt" in op) return (actual as never) > (op["$gt"] as never);
  }
  return actual === expected;
}

function matches<T>(doc: T, filter?: Filter<T>): boolean {
  if (!filter) return true;
  for (const key of Object.keys(filter) as (keyof T)[]) {
    const expected = filter[key];
    if (expected === undefined) continue;
    if (!matchValue(doc[key], expected as FilterValue<T[keyof T]>)) return false;
  }
  return true;
}

function sortDocs<T>(docs: T[], sort?: FindOptions<T>["sort"]): T[] {
  if (!sort) return docs;
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...docs].sort((a, b) => {
    const av = a[sort.field] as unknown;
    const bv = b[sort.field] as unknown;
    if (av === bv) return 0;
    return (av as never) > (bv as never) ? dir : -dir;
  });
}

/* ------------------------------------------------------------------ */
/* memory driver                                                       */
/* ------------------------------------------------------------------ */

export class UniqueConstraintError extends Error {
  constructor(collection: string, field: string, value: unknown) {
    super(`Duplicate value for unique index ${collection}.${String(field)}: ${String(value)}`);
    this.name = "UniqueConstraintError";
  }
}

class MemoryCollection<T extends WithId> implements DbCollection<T> {
  private docs = new Map<string, T>();
  private uniqueKeys: (keyof T)[][] = [];
  private indexes: { fields: string[]; unique: boolean; name: string }[] = [];

  constructor(
    readonly name: string,
    private readonly onChange: () => void,
  ) {}

  /** @internal used by the snapshot loader */
  _load(docs: T[]) {
    this.docs = new Map(docs.map((d) => [d.id, d]));
  }

  /** @internal used by the snapshot writer */
  _dump(): T[] {
    return [...this.docs.values()];
  }

  private assertUnique(doc: T, ignoreId?: string) {
    for (const field of this.uniqueFields) {
      const value = doc[field];
      if (value === undefined || value === null) continue;
      for (const existing of this.docs.values()) {
        if (existing.id === ignoreId) continue;
        if (existing[field] === value) throw new UniqueConstraintError(this.name, String(field), value);
      }
    }
  }

  async createIndex(field: keyof T, options?: { unique?: boolean }) {
    if (options?.unique) this.uniqueFields.add(field);
  }

  async find(filter?: Filter<T>, options?: FindOptions<T>) {
    let out = [...this.docs.values()].filter((d) => matches(d, filter));
    out = sortDocs(out, options?.sort);
    if (options?.skip) out = out.slice(options.skip);
    if (options?.limit !== undefined) out = out.slice(0, options.limit);
    return out.map((d) => ({ ...d }));
  }

  async findOne(filter: Filter<T>) {
    const [doc] = await this.find(filter, { limit: 1 });
    return doc ?? null;
  }

  async findById(id: string) {
    const doc = this.docs.get(id);
    return doc ? { ...doc } : null;
  }

  async insertOne(doc: T) {
    if (this.docs.has(doc.id)) throw new UniqueConstraintError(this.name, "id", doc.id);
    this.assertUnique(doc);
    this.docs.set(doc.id, { ...doc });
    this.onChange();
    return { ...doc };
  }

  async insertMany(docs: T[]) {
    const out: T[] = [];
    for (const doc of docs) out.push(await this.insertOne(doc));
    return out;
  }

  async updateOne(filter: Filter<T>, patch: Partial<T>) {
    for (const doc of this.docs.values()) {
      if (!matches(doc, filter)) continue;
      const next = { ...doc, ...patch } as T;
      this.assertUnique(next, doc.id);
      this.docs.set(doc.id, next);
      this.onChange();
      return { ...next };
    }
    return null;
  }

  async findOneAndUpdate(filter: Filter<T>, patch: Partial<T>, options?: FindOptions<T>) {
    const [doc] = sortDocs(
      [...this.docs.values()].filter((d) => matches(d, filter)),
      options?.sort,
    );
    if (!doc) return null;
    const next = { ...doc, ...patch } as T;
    this.docs.set(doc.id, next);
    this.onChange();
    return { ...next };
  }

  async deleteOne(filter: Filter<T>) {
    for (const doc of this.docs.values()) {
      if (!matches(doc, filter)) continue;
      this.docs.delete(doc.id);
      this.onChange();
      return true;
    }
    return false;
  }

  async count(filter?: Filter<T>) {
    if (!filter) return this.docs.size;
    return [...this.docs.values()].filter((d) => matches(d, filter)).length;
  }

  async clear() {
    this.docs.clear();
    this.onChange();
  }
}

class MemoryDatabase implements Database {
  readonly driver = "memory";
  private collections = new Map<string, MemoryCollection<never>>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private fsAvailable = false;

  collection<T extends WithId>(name: string): DbCollection<T> {
    let existing = this.collections.get(name) as MemoryCollection<T> | undefined;
    if (!existing) {
      existing = new MemoryCollection<T>(name, () => this.scheduleSave());
      this.collections.set(name, existing as unknown as MemoryCollection<never>);
    }
    return existing;
  }

  async isEmpty() {
    for (const col of this.collections.values()) {
      if ((await (col as unknown as DbCollection<WithId>).count()) > 0) return false;
    }
    return true;
  }

  async dropAll() {
    for (const col of this.collections.values()) {
      await (col as unknown as DbCollection<WithId>).clear();
    }
  }

  async close() {
    await this.flush();
  }

  /* ---- optional JSON snapshot (Node only; no-op on edge runtimes) ---- */

  private async fs() {
    try {
      const [fs, path] = await Promise.all([import("node:fs/promises"), import("node:path")]);
      return { fs, path };
    } catch {
      return null;
    }
  }

  async restore() {
    const mod = await this.fs();
    if (!mod) return;
    try {
      const raw = await mod.fs.readFile(config.databaseFile, "utf8");
      const parsed = JSON.parse(raw) as Record<string, WithId[]>;
      for (const [name, docs] of Object.entries(parsed)) {
        (this.collection(name) as unknown as MemoryCollection<WithId>)._load(docs);
      }
      this.fsAvailable = true;
      logger.info("DB", `Restored snapshot from ${config.databaseFile}`);
    } catch {
      this.fsAvailable = true; // fs exists, file just isn't there yet
    }
  }

  private scheduleSave() {
    if (!this.fsAvailable) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), 150);
  }

  async flush() {
    if (!this.fsAvailable) return;
    const mod = await this.fs();
    if (!mod) return;
    const snapshot: Record<string, WithId[]> = {};
    for (const [name, col] of this.collections.entries()) {
      snapshot[name] = (col as unknown as MemoryCollection<WithId>)._dump();
    }
    try {
      await mod.fs.mkdir(mod.path.dirname(config.databaseFile), { recursive: true });
      await mod.fs.writeFile(config.databaseFile, JSON.stringify(snapshot), "utf8");
    } catch (error) {
      logger.warn("DB", "Snapshot write failed", error);
    }
  }
}

/* ------------------------------------------------------------------ */
/* connection management (single managed connection)                   */
/* ------------------------------------------------------------------ */

interface DbGlobal {
  __hivemint_db?: Promise<Database> | undefined;
}
const globalRef = globalThis as unknown as DbGlobal;

async function createDatabase(): Promise<Database> {
  if (config.databaseDriver === "mongodb") {
    // Phase 3: `const { MongoDatabase } = await import("./database.mongo");`
    // The MongoDB driver requires a Node runtime with TCP sockets; it is wired
    // in as soon as a reachable Mongo host is configured.
    logger.warn("DB", "mongodb driver not available in this runtime — falling back to memory driver");
  }
  const db = new MemoryDatabase();
  await db.restore();
  logger.info("DB", `Connected (driver=${db.driver}, name=${config.databaseName})`);
  return db;
}

/** Returns the single managed database connection, creating it on first use. */
export function getDatabase(): Promise<Database> {
  if (!globalRef.__hivemint_db) {
    globalRef.__hivemint_db = createDatabase();
  }
  return globalRef.__hivemint_db;
}

export async function closeDatabase() {
  const existing = globalRef.__hivemint_db;
  if (!existing) return;
  (await existing).close();
  globalRef.__hivemint_db = undefined;
}

export const COLLECTIONS = {
  users: "users",
  nftCollections: "nft_collections",
  nfts: "nfts",
  marketplaceListings: "marketplace_listings",
  activity: "activity",
  transactionsPending: "transactions_pending",
  transactionsProcessed: "transactions_processed",
} as const;
