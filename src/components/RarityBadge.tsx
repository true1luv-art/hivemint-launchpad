import { cn } from "@/lib/utils";
import type { Rarity } from "@/lib/types";

const styles: Record<Rarity, string> = {
  Common: "text-rarity-common border-rarity-common/30 bg-rarity-common/10",
  Rare: "text-rarity-rare border-rarity-rare/30 bg-rarity-rare/10",
  Epic: "text-rarity-epic border-rarity-epic/30 bg-rarity-epic/10",
  Legendary: "text-rarity-legendary border-rarity-legendary/35 bg-rarity-legendary/12",
};

export function RarityBadge({ rarity, className }: { rarity: Rarity; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide uppercase",
        styles[rarity],
        className,
      )}
    >
      {rarity}
    </span>
  );
}
