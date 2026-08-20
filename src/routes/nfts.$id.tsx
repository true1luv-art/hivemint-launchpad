import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftRight, Loader2, Tag } from "lucide-react";
import { toast } from "sonner";

import { ActivityFeed } from "@/components/ActivityFeed";
import { EmptyState } from "@/components/EmptyState";
import { ListingModal } from "@/components/ListingModal";
import { MetadataPanel } from "@/components/MetadataPanel";
import { PurchaseModal } from "@/components/PurchaseModal";
import { RarityBadge } from "@/components/RarityBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hive } from "@/lib/format";
import { useAppStore } from "@/store/useAppStore";

export const Route = createFileRoute("/nfts/$id")({
  head: () => ({
    meta: [
      { title: "NFT details — HiveMint" },
      { name: "description", content: "NFT metadata, rarity, ownership history and marketplace actions." },
      { property: "og:title", content: "NFT details — HiveMint" },
      { property: "og:description", content: "Inspect a Hive NFT and trade it in HIVE." },
    ],
  }),
  component: NftDetail,
});

function NftDetail() {
  const { id } = Route.useParams();
  const nft = useAppStore((s) => s.nfts.find((n) => n.id === id));
  const listing = useAppStore((s) => s.listings.find((l) => l.nftId === id));
  const activities = useAppStore((s) => s.activities);
  const user = useAppStore((s) => s.user);
  const cancelListing = useAppStore((s) => s.cancelListing);
  const transferNFT = useAppStore((s) => s.transferNFT);

  const [listOpen, setListOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [transferTo, setTransferTo] = useState("");
  const [transferring, setTransferring] = useState(false);

  const history = useMemo(() => activities.filter((a) => a.nftId === id), [activities, id]);

  if (!nft) {
    return (
      <EmptyState
        title="NFT not found"
        description="This token no longer exists in the local prototype state."
        action={
          <Button asChild variant="outline">
            <Link to="/marketplace">Back to marketplace</Link>
          </Button>
        }
      />
    );
  }

  const isOwner = user?.username === nft.owner;

  const doTransfer = async () => {
    if (!transferTo.trim()) return;
    setTransferring(true);
    try {
      await transferNFT(nft.id, transferTo.trim().replace(/^@/, ""));
      toast.success("NFT transferred", { description: `Sent to @${transferTo.replace(/^@/, "")}` });
      setTransferTo("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setTransferring(false);
    }
  };

  return (
    <div className="space-y-8">
      <nav className="text-sm text-muted-foreground">
        <Link to="/collections/$id" params={{ id: nft.collectionId }} className="hover:text-foreground">
          {nft.collectionName}
        </Link>
        <span className="px-2">/</span>
        <span className="text-foreground">{nft.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <div className="surface-card overflow-hidden">
            <img src={nft.image} alt={`${nft.name} artwork`} className="aspect-square w-full object-cover" />
          </div>

          <section className="surface-card p-5">
            <h2 className="font-display text-lg font-semibold">Ownership history</h2>
            <ActivityFeed activities={history} className="mt-2" />
          </section>
        </div>

        <div className="space-y-6">
          <section className="surface-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">{nft.collectionName}</p>
                <h1 className="mt-1 font-display text-3xl font-bold">{nft.name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Owned by <span className="text-foreground">@{nft.owner}</span>
                </p>
              </div>
              <RarityBadge rarity={nft.rarity} />
            </div>

            <div className="mt-6 rounded-xl border border-border bg-surface p-4">
              <p className="text-xs tracking-wider text-muted-foreground uppercase">
                {listing ? "Listed price" : "Estimated value"}
              </p>
              <p className="mt-1 font-display text-3xl font-bold">
                {hive(listing ? listing.price : nft.estimatedValue)}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {!isOwner && listing ? (
                <Button size="lg" className="flex-1" onClick={() => setBuyOpen(true)}>
                  Buy now
                </Button>
              ) : null}
              {isOwner && !listing ? (
                <Button size="lg" className="flex-1 gap-2" onClick={() => setListOpen(true)}>
                  <Tag className="size-4" /> List for sale
                </Button>
              ) : null}
              {isOwner && listing ? (
                <Button
                  size="lg"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    cancelListing(listing.id);
                    toast.success("Listing cancelled");
                  }}
                >
                  Cancel listing
                </Button>
              ) : null}
            </div>

            {isOwner && !listing ? (
              <div className="mt-5 border-t border-border pt-5">
                <p className="text-xs tracking-wider text-muted-foreground uppercase">Transfer</p>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={transferTo}
                    onChange={(e) => setTransferTo(e.target.value)}
                    placeholder="hive username"
                  />
                  <Button
                    variant="outline"
                    onClick={doTransfer}
                    disabled={transferring || !transferTo.trim()}
                    className="gap-2"
                  >
                    {transferring ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ArrowLeftRight className="size-4" />
                    )}
                    Send
                  </Button>
                </div>
              </div>
            ) : null}
          </section>

          <MetadataPanel nft={nft} />
        </div>
      </div>

      <ListingModal nft={nft} open={listOpen} onOpenChange={setListOpen} />
      {listing ? (
        <PurchaseModal nft={nft} listing={listing} open={buyOpen} onOpenChange={setBuyOpen} />
      ) : null}
    </div>
  );
}
