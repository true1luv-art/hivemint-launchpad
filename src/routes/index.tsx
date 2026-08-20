import { createFileRoute, Link } from "@tanstack/react-router";
import { Boxes, Coins, Layers, Sparkles, Tag, TrendingUp } from "lucide-react";

import { CollectionCard } from "@/components/CollectionCard";
import { NFTCard } from "@/components/NFTCard";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { hive, num } from "@/lib/format";
import { useAppStore } from "@/store/useAppStore";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HiveMint — Hive NFT Launchpad & Marketplace" },
      {
        name: "description",
        content:
          "Launch NFT collections, mint with HIVE and trade on the native Hive marketplace. Track volume, listings and creator earnings in one dashboard.",
      },
      { property: "og:title", content: "HiveMint — Hive NFT Launchpad & Marketplace" },
      {
        property: "og:description",
        content: "Create collections. Mint NFTs. Trade on Hive.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const collections = useAppStore((s) => s.collections);
  const nfts = useAppStore((s) => s.nfts);
  const listings = useAppStore((s) => s.listings);

  const minted = collections.reduce((s, c) => s + c.minted, 0);
  const volume = collections.reduce((s, c) => s + c.volume, 0);
  const trending = [...collections].sort((a, b) => b.trendingScore - a.trendingScore).slice(0, 3);
  const recentMints = [...nfts]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 4);


  return (
    <div className="space-y-10">
      <section className="surface-card hero-bg relative overflow-hidden px-6 py-14 sm:px-10 lg:py-20">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" /> Built on Hive Engine NFTs
          </span>
          <h1 className="mt-5 font-display text-4xl leading-[1.05] font-bold sm:text-6xl">
            Hive NFT <span className="text-gradient">Launchpad</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Create collections. Mint NFTs. Trade on Hive.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/collections">Explore Collections</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/creator/collections/new">Create Collection</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Collections" value={num(collections.length)} icon={Layers} hint="Live on HiveMint" />
        <StatCard label="NFTs Minted" value={num(18_492 + Math.max(0, minted - 15_901))} icon={Boxes} hint="All-time primary mints" />
        <StatCard label="HIVE Volume" value={hive(volume, 0)} icon={Coins} hint="Primary + secondary" />
        <StatCard label="Active Listings" value={num(1_284 - 24 + listings.length)} icon={Tag} hint="Open marketplace orders" />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">
            <TrendingUp className="mr-2 inline size-5 text-primary" />
            Trending Collections
          </h2>
          <Link to="/collections" className="text-sm text-muted-foreground hover:text-foreground">
            View all
          </Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {trending.map((c) => (
            <CollectionCard key={c.id} collection={c} />
          ))}
        </div>
      </section>


      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Recent Mints</h2>
          <Link to="/marketplace" className="text-sm text-muted-foreground hover:text-foreground">
            Marketplace
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {recentMints.map((n) => (
            <NFTCard key={n.id} nft={n} />
          ))}
        </div>
      </section>
    </div>
  );
}
