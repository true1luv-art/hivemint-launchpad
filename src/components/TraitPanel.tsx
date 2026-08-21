import { traitRarityContribution } from "@/lib/traits";
import type { NFT } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Per-trait rarity, plus the token's rarity score and collection-wide rank. */
export function TraitPanel({ nft, className }: { nft: NFT; className?: string }) {
  const traits = nft.traits ?? [];

  return (
    <section className={cn("surface-card p-6", className)}>
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-display text-lg font-semibold">Traits &amp; rarity</h2>
        <div className="text-right">
          <p className="text-xs tracking-wider text-muted-foreground uppercase">Rarity score</p>
          <p className="font-display text-2xl font-semibold tabular-nums">{nft.rarityScore?.toFixed(2) ?? "—"}</p>
          {nft.rarityRank ? (
            <p className="text-xs text-muted-foreground">
              Rank #{nft.rarityRank} of {nft.rarityRankTotal}
            </p>
          ) : null}
        </div>
      </div>

      {traits.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">This token has no generated traits.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {traits.map((trait) => (
            <li
              key={trait.layerId}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-[11px] tracking-wider text-muted-foreground uppercase">{trait.layerName}</p>
                <p className="truncate text-sm font-medium">{trait.traitValueName}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm tabular-nums">{(trait.probability * 100).toFixed(1)}%</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  +{traitRarityContribution(trait).toFixed(2)} score
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
