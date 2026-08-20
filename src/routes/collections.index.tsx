import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { CollectionCard } from "@/components/CollectionCard";
import { EmptyState } from "@/components/EmptyState";
import { MarketplaceFilters } from "@/components/MarketplaceFilters";
import { useAppStore } from "@/store/useAppStore";

const FILTERS = ["All", "Minting", "Sold Out", "Upcoming"] as const;
const SORTS = ["Trending", "Newest", "Floor price", "Volume"] as const;

export const Route = createFileRoute("/collections/")({
  head: () => ({
    meta: [
      { title: "Collections — HiveMint" },
      {
        name: "description",
        content: "Browse every NFT collection launched on HiveMint: floor prices, supply, and mint progress.",
      },
      { property: "og:title", content: "Collections — HiveMint" },
      { property: "og:description", content: "Browse NFT collections launched on Hive." },
    ],
  }),
  component: CollectionsPage,
});

function CollectionsPage() {
  const collections = useAppStore((s) => s.collections);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [sort, setSort] = useState<(typeof SORTS)[number]>("Trending");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = collections.filter(
      (c) =>
        (filter === "All" || c.status === filter) &&
        (!q || c.name.toLowerCase().includes(q) || c.creator.toLowerCase().includes(q)),
    );
    list = [...list].sort((a, b) => {
      if (sort === "Newest") return +new Date(b.createdAt) - +new Date(a.createdAt);
      if (sort === "Floor price") return a.floorPrice - b.floorPrice;
      if (sort === "Volume") return b.volume - a.volume;
      return b.trendingScore - a.trendingScore;
    });
    return list;
  }, [collections, filter, sort, query]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold sm:text-4xl">Collections</h1>
        <p className="mt-2 text-muted-foreground">
          {collections.length} collections launched on HiveMint.
        </p>
      </header>

      <MarketplaceFilters
        filters={FILTERS}
        filter={filter}
        onFilterChange={setFilter}
        sorts={SORTS}
        sort={sort}
        onSortChange={setSort}
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search collections"
      />

      {visible.length ? (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((c) => (
            <CollectionCard key={c.id} collection={c} />
          ))}
        </div>
      ) : (
        <EmptyState title="No collections found" description="Try a different filter or search term." />
      )}
    </div>
  );
}
