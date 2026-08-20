export interface UserDocument {
  id: string;
  username: string;
  displayName: string;
  avatarSeed: string;
  /** Indexed HIVE balance. Hive is the source of truth once Phase 3 lands. */
  hiveBalance: number;
  role: "user" | "creator";
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  username: string;
  displayName?: string;
  hiveBalance?: number;
  role?: UserDocument["role"];
}
