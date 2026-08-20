export interface TraitLayerDocument {
  id: string;
  collectionId: string;
  name: string;
  /** Deterministic composition order, ascending. */
  order: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
