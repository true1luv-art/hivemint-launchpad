import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { EmptyState } from "@/components/EmptyState";
import { ListingModal } from "@/components/ListingModal";
import { MarketplaceFilters } from "@/components/MarketplaceFilters";
import { NFTCard } from "@/components/NFTCard";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { hive, num } from "@/lib/format";
import type { NFT } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

const FILTERS = ["All", "Owned", "Listed"] as const;
const SORTS = ["Newest", "Value: high to low", "Name"] as const;

export const Route = createFileRoute("/nfts/")({
  head: () => ({
    meta: [
      { title: "My NFTs — HiveMint" },
      { name: "description", content: "Your Hive NFT portfolio: owned items, active listings and estimated value." },
      { property: "og:title", content: "My NFTs — HiveMint" },
      { property: "og:description", content: "Manage and list your Hive NFT collection." },
    ],
  }),
  component: MyNfts,
});

function MyNfts() {
  const user = useAppStore((s) => s.user);
  const nfts = useAppStore((s) => s.nfts);
  const listings = useAppStore((s) => s.listings);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [sort, setSort] = useState<(typeof SORTS)[number]>("Newest");
  const [query, setQuery] = useState("");
  const [listTarget, setListTarget] = useState<NFT | null>(null);

  const owned = useMemo(
    () => nfts.filter((n) => user && n.owner === user.username),
    [nfts, user],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = owned.filter(
      (n) =>
        (filter === "All" || n.status === filter) &&
        (!q || n.name.toLowerCase().includes(q) || n.collectionName.toLowerCase().includes(q)),
    );
    return [...list].sort((a, b) => {
      if (sort === "Value: high to low") return b.estimatedValue - a.estimatedValue;
      if (sort === "Name") return a.name.localeCompare(b.name);
      return +new Date(b.createdAt) - +new Date(a.createdAt);
    });
  }, [owned, filter, sort, query]);

  const value = owned.reduce((s, n) => s + n.estimatedValue, 0);
  const listedCount = owned.filter((n) => n.status === "Listed").length;

  if (!user) {
    return (
      <EmptyState
        title="Connect your wallet"
        description="Connect a Hive account to view your NFT portfolio."
      />
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">My NFTs</h1>
          <p className="mt-2 text-muted-foreground">Portfolio for @{user.username}</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/collections">Mint more</Link>
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="NFTs owned" value={num(owned.length)} />
        <StatCard label="Estimated value" value={hive(value)} />
        <StatCard label="Listed" value={num(listedCount)} />
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
        searchPlaceholder="Search your NFTs"
      />

      {rows.length ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {rows.map((n) => (
            <NFTCard
              key={n.id}
              nft={n}
              listing={listings.find((l) => l.nftId === n.id)}
              action={
                n.status === "Listed"
                  ? undefined
                  : { label: "List for sale", onClick: () => setListTarget(n), variant: "outline" }
              }
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nothing here yet"
          description="Mint an NFT from a collection to start your portfolio."
          action={
            <Button asChild>
              <Link to="/collections">Browse collections</Link>
            </Button>
          }
        />
      )}

      {listTarget ? (
        <ListingModal
          nft={listTarget}
          open={Boolean(listTarget)}
          onOpenChange={(v) => !v && setListTarget(null)}
        />
      ) : null}
    </div>
  );
}
