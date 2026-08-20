import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { ActivityFeed } from "@/components/ActivityFeed";
import { FilterPills } from "@/components/MarketplaceFilters";
import { StatCard } from "@/components/StatCard";
import { hive, num } from "@/lib/format";
import { useAppStore } from "@/store/useAppStore";

const FILTERS = ["All", "Minted", "Listed", "Sold", "Transferred", "Collection Created"] as const;

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Activity — HiveMint" },
      { name: "description", content: "Live feed of mints, listings, sales and transfers across HiveMint." },
      { property: "og:title", content: "Activity — HiveMint" },
      { property: "og:description", content: "Every mint, listing, sale and transfer on HiveMint." },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const activities = useAppStore((s) => s.activities);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const rows = useMemo(
    () => (filter === "All" ? activities : activities.filter((a) => a.type === filter)),
    [activities, filter],
  );

  const sales = activities.filter((a) => a.type === "Sold");
  const salesVolume = sales.reduce((s, a) => s + (a.amount ?? 0), 0);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold sm:text-4xl">Activity</h1>
        <p className="mt-2 text-muted-foreground">Everything happening across HiveMint.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Events" value={num(activities.length)} />
        <StatCard label="Sales" value={num(sales.length)} />
        <StatCard label="Sales volume" value={hive(salesVolume)} />
      </div>

      <FilterPills options={FILTERS} value={filter} onChange={setFilter} />

      <div className="surface-card px-5 py-2">
        <ActivityFeed activities={rows} limit={60} />
      </div>
    </div>
  );
}
