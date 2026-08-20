import type { RarityConfig } from "@/lib/types";
import { cn } from "@/lib/utils";

const barColor: Record<string, string> = {
  Common: "bg-rarity-common",
  Rare: "bg-rarity-rare",
  Epic: "bg-rarity-epic",
  Legendary: "bg-rarity-legendary",
};

export function RarityChart({ rarities, className }: { rarities: RarityConfig[]; className?: string }) {
  const total = rarities.reduce((s, r) => s + r.weight, 0) || 100;
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-raised">
        {rarities.map((r) => (
          <div
            key={r.rarity}
            className={cn("h-full", barColor[r.rarity])}
            style={{ width: `${(r.weight / total) * 100}%` }}
            title={`${r.rarity} ${r.weight}%`}
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {rarities.map((r) => (
          <li key={r.rarity} className="rounded-lg border border-border bg-surface px-3 py-2">
            <div className="flex items-center gap-2">
              <span className={cn("size-2 rounded-full", barColor[r.rarity])} />
              <span className="text-xs text-muted-foreground">{r.rarity}</span>
            </div>
            <p className="mt-1 font-display text-lg font-semibold">{r.weight}%</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
