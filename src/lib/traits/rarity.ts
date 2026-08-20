/**
 * Rarity derivation. One source of truth for the formula — never inline
 * `1 / probability` anywhere else.
 */
import type { GeneratedTrait, RarityClass } from "./types";

/** Rarity score = sum of 1 / probability for every selected trait. */
export function calculateRarityScore(traits: GeneratedTrait[]): number {
  const score = traits.reduce((sum, trait) => {
    if (!trait.probability || trait.probability <= 0) return sum;
    return sum + 1 / trait.probability;
  }, 0);
  return Number(score.toFixed(4));
}

/** Contribution of a single trait, exposed for UI breakdowns. */
export function traitRarityContribution(trait: GeneratedTrait): number {
  if (!trait.probability || trait.probability <= 0) return 0;
  return Number((1 / trait.probability).toFixed(4));
}

/** Class thresholds — display only, derived from the collection-wide rank. */
export const RARITY_CLASS_THRESHOLDS: { rarityClass: RarityClass; topPercent: number }[] = [
  { rarityClass: "Legendary", topPercent: 0.01 },
  { rarityClass: "Epic", topPercent: 0.05 },
  { rarityClass: "Rare", topPercent: 0.15 },
];

/** Top 1% Legendary, top 5% Epic, top 15% Rare, remainder Common. */
export function calculateRarityClass(rank: number, total: number): RarityClass {
  if (total <= 0 || rank <= 0) return "Common";
  for (const { rarityClass, topPercent } of RARITY_CLASS_THRESHOLDS) {
    const cutoff = Math.max(1, Math.ceil(total * topPercent));
    if (rank <= cutoff) return rarityClass;
  }
  return "Common";
}

export interface RankableToken {
  id: string;
  rarityScore: number;
}

export interface RankResult {
  id: string;
  rarityRank: number;
  rarityClass: RarityClass;
}

/**
 * Ranks the WHOLE collection: highest score is rank 1. Ties are broken by id so
 * ranking is deterministic and stable across processes.
 */
export function assignRarityRanks(tokens: RankableToken[]): RankResult[] {
  const sorted = [...tokens].sort((a, b) => b.rarityScore - a.rarityScore || a.id.localeCompare(b.id));
  const total = sorted.length;
  return sorted.map((token, index) => ({
    id: token.id,
    rarityRank: index + 1,
    rarityClass: calculateRarityClass(index + 1, total),
  }));
}

/** Convenience map form: id -> rank/class. */
export function rankMap(tokens: RankableToken[]): Map<string, RankResult> {
  return new Map(assignRarityRanks(tokens).map((r) => [r.id, r]));
}
