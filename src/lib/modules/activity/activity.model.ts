import { newId, nowIso } from "../../config/repository";
import type { IndexSpec } from "../../config/repository";
import type { ActivityDocument, CreateActivityInput } from "./activity.types";

export const ACTIVITY_COLLECTION = "activity";

export const ACTIVITY_INDEXES: IndexSpec<ActivityDocument>[] = [
  { fields: ["id"], unique: true },
  { fields: ["collectionId", "createdAt"] },
  { fields: ["nftId", "createdAt"] },
  { fields: ["actor", "createdAt"] },
];

export function createActivityDocument(input: CreateActivityInput): ActivityDocument {
  return {
    ...input,
    id: newId("act"),
    createdAt: input.createdAt ?? nowIso(),
  };
}

/** Maps a persisted activity record to the Phase 1 UI shape. */
export function toActivityView(doc: ActivityDocument) {
  return {
    id: doc.id,
    type: doc.type,
    actor: doc.actor,
    target: doc.target,
    nftId: doc.nftId,
    collectionId: doc.collectionId,
    label: doc.label,
    amount: doc.amount,
    txId: doc.hiveTransactionId ?? doc.transactionId,
    createdAt: doc.createdAt,
  };
}
