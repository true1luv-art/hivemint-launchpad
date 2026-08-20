import { BaseRepository, nowIso } from "../../config/repository";
import { USERS_COLLECTION, USERS_INDEXES, createUserDocument } from "./users.model";
import type { CreateUserInput, UserDocument } from "./users.types";

class UsersRepository extends BaseRepository<UserDocument> {
  constructor() {
    super(USERS_COLLECTION, USERS_INDEXES);
  }

  findByUsername(username: string) {
    return this.findOne({ username });
  }

  async ensure(input: CreateUserInput): Promise<UserDocument> {
    const existing = await this.findByUsername(input.username);
    if (existing) return existing;
    return this.insert(createUserDocument(input));
  }

  async adjustBalance(username: string, delta: number): Promise<UserDocument | null> {
    const user = await this.findByUsername(username);
    if (!user) return null;
    const next = Number((user.hiveBalance + delta).toFixed(3));
    return this.update({ username }, { hiveBalance: next, updatedAt: nowIso() });
  }

  listAll() {
    return this.find(undefined, { sort: { field: "username", dir: "asc" } });
  }
}

export const usersRepository = new UsersRepository();
