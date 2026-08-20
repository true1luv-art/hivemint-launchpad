import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { hive, num, shortDate } from "@/lib/format";
import type { Collection } from "@/lib/types";

export function CollectionHeader({
  collection,
  onMint,
}: {
  collection: Collection;
  onMint: () => void;
}) {
  const pct = Math.round((collection.minted / collection.maxSupply) * 100);
  const soldOut = collection.minted >= collection.maxSupply;

  return (
    <section className="surface-card hero-bg overflow-hidden">
      <div className="grid gap-8 p-6 lg:grid-cols-[minmax(0,380px)_1fr] lg:p-8">
        <div className="overflow-hidden rounded-xl border border-border">
          <img
            src={collection.image}
            alt={`${collection.name} artwork`}
            className="aspect-square w-full object-cover"
          />
        </div>

        <div className="flex flex-col gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 font-mono text-[11px] tracking-wider uppercase">
                {collection.symbol}
              </span>
              <span
                className={
                  soldOut
                    ? "rounded-full border border-border-strong bg-surface px-2.5 py-0.5 text-[11px] uppercase text-muted-foreground"
                    : "rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-[11px] uppercase text-success"
                }
              >
                {collection.status}
              </span>
              <span className="text-xs text-muted-foreground">
                Created {shortDate(collection.createdAt)}
              </span>
            </div>
            <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">{collection.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">by @{collection.creator}</p>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {collection.description}
            </p>
          </div>

          <div>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-muted-foreground">
                {num(collection.minted)} / {num(collection.maxSupply)} minted
              </span>
              <span className="font-medium">{pct}%</span>
            </div>
            <Progress value={pct} className="h-2" />
          </div>

          <dl className="grid grid-cols-2 gap-4 border-t border-border pt-6 sm:grid-cols-4">
            <Stat label="Mint price" value={hive(collection.mintPrice)} />
            <Stat label="Floor" value={hive(collection.floorPrice)} />
            <Stat label="Volume" value={hive(collection.volume, 0)} />
            <Stat label="Holders" value={num(collection.holders)} />
          </dl>

          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={onMint} disabled={soldOut} className="min-w-44 gap-2">
              {soldOut ? "Sold Out" : "MINT NFT"}
            </Button>
            <span className="self-center text-xs text-muted-foreground">
              Creator {collection.creatorFee}% · Platform {collection.platformFee}%
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs tracking-wider text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 font-display text-lg font-semibold">{value}</dd>
    </div>
  );
}
