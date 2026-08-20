import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Coins, Layers, Plus, Sparkles, Users } from "lucide-react";

import { ActivityFeed } from "@/components/ActivityFeed";
import { CollectionCard } from "@/components/CollectionCard";
import { EmptyState } from "@/components/EmptyState";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { hive, num } from "@/lib/format";
import { useAppStore } from "@/store/useAppStore";

export const Route = createFileRoute("/creator/")({
  head: () => ({
    meta: [
      { title: "Creator Dashboard — HiveMint" },
      { name: "description", content: "Track your collections, mint revenue, royalties and holders on HiveMint." },
      { property: "og:title", content: "Creator Dashboard — HiveMint" },
      { property: "og:description", content: "Launch and manage NFT collections on Hive." },
    ],
  }),
  component: CreatorDashboard,
});

function CreatorDashboard() {
  const user = useAppStore((s) => s.user);
  const collections = useAppStore((s) => s.collections);
  const activities = useAppStore((s) => s.activities);

  const mine = useMemo(
    () => collections.filter((c) => user && c.creator === user.username),
    [collections, user],
  );

  const minted = mine.reduce((s, c) => s + c.minted, 0);
  const revenue = mine.reduce((s, c) => s + c.minted * c.mintPrice * (c.creatorFee / 100), 0);
  const holders = mine.reduce((s, c) => s + c.holders, 0);
  const ids = new Set(mine.map((c) => c.id));
  const feed = activities.filter((a) => a.collectionId && ids.has(a.collectionId)).slice(0, 10);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">Creator Dashboard</h1>
          <p className="mt-2 text-muted-foreground">Manage the collections you launched on HiveMint.</p>
        </div>
        <Button asChild size="lg" className="gap-2">
          <Link to="/creator/collections/new">
            <Plus className="size-4" /> Create Collection
          </Link>
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Collections" value={num(mine.length)} icon={Layers} />
        <StatCard label="Items minted" value={num(minted)} icon={Sparkles} />
        <StatCard label="Creator revenue" value={hive(revenue, 0)} icon={Coins} />
        <StatCard label="Holders" value={num(holders)} icon={Users} />
      </div>

      <section className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <h2 className="font-display text-xl font-semibold">Your collections</h2>
          {mine.length ? (
            <div className="grid gap-5 sm:grid-cols-2">
              {mine.map((c) => (
                <CollectionCard key={c.id} collection={c} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No collections yet"
              description="Launch your first NFT collection on Hive."
              action={
                <Button asChild>
                  <Link to="/creator/collections/new">Create Collection</Link>
                </Button>
              }
            />
          )}
        </div>

        <div className="surface-card p-5">
          <h2 className="font-display text-lg font-semibold">Collection activity</h2>
          <ActivityFeed activities={feed} className="mt-2" />
        </div>
      </section>
    </div>
  );
}
