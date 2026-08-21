import { useMemo, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { ActivityFeed } from "@/components/ActivityFeed";
import { CollectionHeader } from "@/components/CollectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { MintModal } from "@/components/MintModal";
import { NFTCard } from "@/components/NFTCard";
import { RarityChart } from "@/components/RarityChart";
import { FilterPills } from "@/components/MarketplaceFilters";
import { Button } from "@/components/ui/button";
import { RARITIES } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

const RARITY_FILTERS = ["All", ...RARITIES] as const;
const STATUS_FILTERS = ["All items", "For sale", "Not listed"] as const;

export const Route = createFileRoute("/collections/$id")({
  head: () => ({
    meta: [
      { title: "Collection — HiveMint" },
      { name: "description", content: "Collection details, rarity breakdown, minted items and activity." },
      { property: "og:title", content: "Collection — HiveMint" },
      { property: "og:description", content: "Mint and explore a Hive NFT collection." },
    ],
  }),
  component: CollectionDetail,
});

function CollectionDetail() {
  const { id } = Route.useParams();
  const collection = useAppStore((s) => s.collections.find((c) => c.id === id));
  const nfts = useAppStore((s) => s.nfts);
  const listings = useAppStore((s) => s.listings);
  const activities = useAppStore((s) => s.activities);
  const [rarity, setRarity] = useState<(typeof RARITY_FILTERS)[number]>("All");
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("All items");
  const [mintOpen, setMintOpen] = useState(false);

  const items = useMemo(
    () =>
      nfts
        .filter((n) => {
          if (n.collectionId !== id) return false;
          if (rarity !== "All" && n.rarity !== rarity) return false;
          const listed = listings.some((l) => l.nftId === n.id);
          if (status === "For sale" && !listed) return false;
          if (status === "Not listed" && listed) return false;
          return true;
        })
        .sort((a, b) => a.mintNumber - b.mintNumber),
    [nfts, id, rarity, status, listings],
  );

  const allItems = useMemo(() => nfts.filter((n) => n.collectionId === id), [nfts, id]);

  const forSaleCount = useMemo(
    () => nfts.filter((n) => n.collectionId === id && listings.some((l) => l.nftId === n.id)).length,
    [nfts, listings, id],
  );

  const collectionActivity = useMemo(
    () => activities.filter((a) => a.collectionId === id).slice(0, 10),
    [activities, id],
  );

  if (!collection) {
    return (
      <EmptyState
        title="Collection not found"
        description="This collection may have been removed."
        action={
          <Button asChild variant="outline">
            <Link to="/collections">Back to collections</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-10">
      <CollectionHeader collection={collection} onMint={() => setMintOpen(true)} />

      <section className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="surface-card p-6">
          <h2 className="font-display text-lg font-semibold">Trait distribution</h2>
          <RarityChart layers={collection.traitLayers ?? []} nfts={allItems} className="mt-4" />
        </div>
        <div className="surface-card p-5">
          <h2 className="font-display text-lg font-semibold">Collection activity</h2>
          <ActivityFeed activities={collectionActivity} className="mt-2" />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">Items ({items.length})</h2>
            <p className="text-xs text-muted-foreground">{forSaleCount} listed for sale</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FilterPills options={STATUS_FILTERS} value={status} onChange={setStatus} />
            <FilterPills options={RARITY_FILTERS} value={rarity} onChange={setRarity} />
          </div>
        </div>
        {items.length ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {items.map((n) => (
              <NFTCard key={n.id} nft={n} listing={listings.find((l) => l.nftId === n.id)} />
            ))}
          </div>
        ) : (
          <EmptyState title="No items yet" description="Be the first to mint from this collection." />
        )}
      </section>

      <MintModal collection={collection} open={mintOpen} onOpenChange={setMintOpen} />
    </div>
  );
}
