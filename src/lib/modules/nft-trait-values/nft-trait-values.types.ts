export interface TraitValueDocument {
  id: string;
  collectionId: string;
  layerId: string;
  name: string;
  /** Relative weight — never required to total 100. */
  weight: number;
  enabled: boolean;
  assetId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  createdAt: string;
  updatedAt: string;
}
