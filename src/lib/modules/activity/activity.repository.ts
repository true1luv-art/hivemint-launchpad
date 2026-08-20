import { BaseRepository } from "../../config/repository";
import { ACTIVITY_COLLECTION, ACTIVITY_INDEXES, createActivityDocument } from "./activity.model";
import type { ActivityDocument, CreateActivityInput } from "./activity.types";

class ActivityRepository extends BaseRepository<ActivityDocument> {
  constructor() {
    super(ACTIVITY_COLLECTION, ACTIVITY_INDEXES);
  }

  record(input: CreateActivityInput) {
    return this.insert(createActivityDocument(input));
  }

  listRecent(limit = 100) {
    return this.find(undefined, { sort: { field: "createdAt", dir: "desc" }, limit });
  }

  listByCollection(collectionId: string, limit = 50) {
    return this.find({ collectionId }, { sort: { field: "createdAt", dir: "desc" }, limit });
  }

  listByNft(nftId: string, limit = 50) {
    return this.find({ nftId }, { sort: { field: "createdAt", dir: "desc" }, limit });
  }

  listByActor(actor: string, limit = 50) {
    return this.find({ actor }, { sort: { field: "createdAt", dir: "desc" }, limit });
  }
}

export const activityRepository = new ActivityRepository();
