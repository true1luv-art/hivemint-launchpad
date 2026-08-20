export type ActivityDocumentType =
  | "Minted"
  | "Listed"
  | "Sold"
  | "Transferred"
  | "Collection Created"
  | "Delisted";

export interface ActivityDocument {
  id: string;
  type: ActivityDocumentType;
  actor: string;
  target?: string | undefined;
  nftId?: string | undefined;
  collectionId?: string | undefined;
  label: string;
  amount?: number | undefined;
  transactionId?: string | undefined;
  hiveTransactionId?: string | undefined;
  createdAt: string;
}

export type CreateActivityInput = Omit<ActivityDocument, "id" | "createdAt"> & {
  createdAt?: string | undefined;
};
