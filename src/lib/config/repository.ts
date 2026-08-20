import type { Database, DbCollection, Filter, FindOptions, WithId } from "./database";
import { getDatabase } from "./database";

export interface IndexSpec<T> {
  field: keyof T;
  unique?: boolean;
}

/**
 * Base repository. Each module extends this with its own domain queries so that
 * no single "god" database service exists.
 */
export class BaseRepository<T extends WithId> {
  private ready: Promise<DbCollection<T>> | null = null;

  constructor(
    protected readonly collectionName: string,
    protected readonly indexes: IndexSpec<T>[] = [],
  ) {}

  protected async collection(): Promise<DbCollection<T>> {
    if (!this.ready) {
      this.ready = (async () => {
        const db: Database = await getDatabase();
        const col = db.collection<T>(this.collectionName);
        for (const index of this.indexes) {
          await col.createIndex(index.field, { unique: index.unique ?? false });
        }
        return col;
      })();
    }
    return this.ready;
  }

  async find(filter?: Filter<T>, options?: FindOptions<T>) {
    return (await this.collection()).find(filter, options);
  }

  async findOne(filter: Filter<T>) {
    return (await this.collection()).findOne(filter);
  }

  async findById(id: string) {
    return (await this.collection()).findById(id);
  }

  async insert(doc: T) {
    return (await this.collection()).insertOne(doc);
  }

  async insertMany(docs: T[]) {
    return (await this.collection()).insertMany(docs);
  }

  async update(filter: Filter<T>, patch: Partial<T>) {
    return (await this.collection()).updateOne(filter, patch);
  }

  async updateById(id: string, patch: Partial<T>) {
    return (await this.collection()).updateOne({ id } as Filter<T>, patch);
  }

  async findOneAndUpdate(filter: Filter<T>, patch: Partial<T>, options?: FindOptions<T>) {
    return (await this.collection()).findOneAndUpdate(filter, patch, options);
  }

  async deleteById(id: string) {
    return (await this.collection()).deleteOne({ id } as Filter<T>);
  }

  async count(filter?: Filter<T>) {
    return (await this.collection()).count(filter);
  }

  async clear() {
    return (await this.collection()).clear();
  }
}

export const nowIso = () => new Date().toISOString();

export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}${rand}`;
}
