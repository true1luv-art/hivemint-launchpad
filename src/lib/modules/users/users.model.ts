import { newId, nowIso } from "../../config/repository";
import type { CreateUserInput, UserDocument } from "./users.types";

export const USERS_COLLECTION = "users";

export const USERS_INDEXES = [
  { field: "id" as const, unique: true },
  { field: "username" as const, unique: true },
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
