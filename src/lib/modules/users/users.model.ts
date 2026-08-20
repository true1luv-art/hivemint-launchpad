import { newId, nowIso } from "../../config/repository";
import type { IndexSpec } from "../../config/repository";
import type { CreateUserInput, UserDocument } from "./users.types";

export const USERS_COLLECTION = "users";

export const USERS_INDEXES: IndexSpec<UserDocument>[] = [
  { fields: ["id"], unique: true },
  { fields: ["username"], unique: true },
];

export function createUserDocument(input: CreateUserInput): UserDocument {
  const timestamp = nowIso();
  return {
    id: newId("usr"),
    username: input.username,
    displayName: input.displayName ?? input.username.charAt(0).toUpperCase() + input.username.slice(1),
    avatarSeed: input.username,
    hiveBalance: input.hiveBalance ?? 0,
    role: input.role ?? "user",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
