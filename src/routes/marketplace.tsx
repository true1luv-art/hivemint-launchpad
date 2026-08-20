import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { EmptyState } from "@/components/EmptyState";
import { MarketplaceFilters } from "@/components/MarketplaceFilters";
import { NFTCard } from "@/components/NFTCard";
import { PurchaseModal } from "@/components/PurchaseModal";
import { StatCard } from "@/components/StatCard";
import { hive, num } from "@/lib/format";
import type { Listing, NFT } from "@/lib/types";
import { RARITIES } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

const FILTERS = ["All", ...RARITIES] as const;
const SORTS = ["Recently listed", "Price: low to high", "Price: high to low", "Rarity"] as const;
const RANK: Record<string, number> = { Legendary: 4, Epic: 3, Rare: 2, Common: 1 };

export const Route = createFileRoute("/marketplace")({
  head: () => ({
    meta: [
      { title: "Marketplace — Buy Hive NFTs | HiveMint" },
      {
        name: "description",
        content: "Browse live HIVE-denominated NFT listings, filter by rarity and buy instantly.",
      },
      { property: "og:title", content: "Marketplace — Buy Hive NFTs | HiveMint" },
      { property: "og:description", content: "Live NFT listings priced in HIVE." },
    ],
  }),
  component: Marketplace,
});

function Marketplace() {
  const listings = useAppStore((s) => s.listings);
  const nfts = useAppStore((s) => s.nfts);
  const user = useAppStore((s) => s.user);

  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [sort, setSort] = useState<(typeof SORTS)[number]>("Recently listed");
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<{ nft: NFT; listing: Listing } | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const joined = listings
      .map((l) => ({ listing: l, nft: nfts.find((n) => n.id === l.nftId) }))
      .filter((r): r is { listing: Listing; nft: NFT } => Boolean(r.nft))
      .filter(
        (r) =>
          (filter === "All" || r.nft.rarity === filter) &&
          (!q ||
            r.nft.name.toLowerCase().includes(q) ||
            r.nft.collectionName.toLowerCase().includes(q)),
      );

    return joined.sort((a, b) => {
      if (sort === "Price: low to high") return a.listing.price - b.listing.price;
      if (sort === "Price: high to low") return b.listing.price - a.listing.price;
      if (sort === "Rarity") return (RANK[b.nft.rarity] ?? 0) - (RANK[a.nft.rarity] ?? 0);
      return +new Date(b.listing.listedAt) - +new Date(a.listing.listedAt);
    });
  }, [listings, nfts, filter, sort, query]);

  const floor = rows.length ? Math.min(...rows.map((r) => r.listing.price)) : 0;
  const total = rows.reduce((s, r) => s + r.listing.price, 0);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold sm:text-4xl">Marketplace</h1>
        <p className="mt-2 text-muted-foreground">Buy and sell Hive NFTs, settled in HIVE.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active listings" value={num(rows.length)} />
        <StatCard label="Floor price" value={hive(floor)} />
        <StatCard label="Listed value" value={hive(total, 0)} />
      </div>

      <MarketplaceFilters
        filters={FILTERS}
        filter={filter}
        onFilterChange={setFilter}
        sorts={SORTS}
        sort={sort}
        onSortChange={setSort}
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search listings"
      />

      {rows.length ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {rows.map(({ nft, listing }) => (
            <NFTCard
              key={listing.id}
              nft={nft}
              listing={listing}
              action={
                nft.owner === user?.username
                  ? undefined
                  : { label: `Buy for ${hive(listing.price)}`, onClick: () => setTarget({ nft, listing }) }
              }
            />
          ))}
        </div>
      ) : (
        <EmptyState title="No listings match" description="Adjust your filters to see more NFTs." />
      )}

      {target ? (
        <PurchaseModal
          nft={target.nft}
          listing={target.listing}
          open={Boolean(target)}
          onOpenChange={(v) => !v && setTarget(null)}
        />
      ) : null}
    </div>
  );
}
