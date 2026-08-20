import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RarityBadge } from "@/components/RarityBadge";
import { TransactionStatus, type TxState } from "@/components/TransactionStatus";
import { hive } from "@/lib/format";
import type { Collection, NFT } from "@/lib/types";
import { PLATFORM_FEE_RATE } from "@/services";
import { useAppStore } from "@/store/useAppStore";

export function MintModal({
  collection,
  open,
  onOpenChange,
}: {
  collection: Collection;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const mintNFT = useAppStore((s) => s.mintNFT);
  const [state, setState] = useState<TxState>("idle");
  const [minted, setMinted] = useState<{ nft: NFT; txId: string } | null>(null);

  const platformFee = Number((collection.mintPrice * PLATFORM_FEE_RATE).toFixed(2));
  const total = Number((collection.mintPrice + platformFee).toFixed(2));

  const reset = (v: boolean) => {
    onOpenChange(v);
    if (!v) {
      setState("idle");
      setMinted(null);
    }
  };

  const confirm = async () => {
    setState("pending");
    try {
      const result = await mintNFT(collection.id);
      setMinted(result);
      setState("success");
      toast.success("NFT minted", { description: result.nft.name });
    } catch (e) {
      setState("error");
      toast.error(e instanceof Error ? e.message : "Mint failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="sm:max-w-md">
        {state === "success" && minted ? (
          <div className="space-y-5">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">NFT Minted!</DialogTitle>
            </DialogHeader>
            <div className="overflow-hidden rounded-xl border border-border">
              <img src={minted.nft.image} alt={minted.nft.name} className="aspect-square w-full object-cover" />
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-display text-lg font-semibold">{minted.nft.name}</span>
                <RarityBadge rarity={minted.nft.rarity} />
              </div>
              <Row label="Token number" value={`#${minted.nft.tokenId}`} />
              <Row label="Collection" value={collection.name} />
              <Row label="Transaction" value={minted.txId} mono />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild className="flex-1">
                <Link to="/nfts/$id" params={{ id: minted.nft.id }} onClick={() => reset(false)}>
                  View NFT
                </Link>
              </Button>
              <Button asChild variant="outline" className="flex-1">
                <Link to="/nfts" onClick={() => reset(false)}>
                  View My NFTs
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <DialogHeader>
              <DialogTitle className="font-display text-xl">Mint from {collection.name}</DialogTitle>
            </DialogHeader>

            <div className="flex gap-4">
              <img
                src={collection.image}
                alt={collection.name}
                className="size-20 rounded-xl border border-border object-cover"
              />
              <div className="text-sm">
                <p className="text-muted-foreground">Collection</p>
                <p className="font-display text-base font-semibold">{collection.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {collection.maxSupply - collection.minted} of {collection.maxSupply} remaining
                </p>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-border bg-surface p-4 text-sm">
              <Row label="Mint price" value={hive(collection.mintPrice)} />
              <Row label="Platform fee" value={hive(platformFee)} />
              <div className="my-2 border-t border-border" />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-display text-lg font-semibold">{hive(total)}</span>
              </div>
            </div>

            <TransactionStatus
              state={state === "pending" ? "pending" : state === "error" ? "error" : "idle"}
              pendingLabel="Selecting a random NFT and broadcasting…"
              errorLabel="Mint failed"
            />

            <Button onClick={confirm} disabled={state === "pending"} className="w-full gap-2" size="lg">
              {state === "pending" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {state === "pending" ? "Minting…" : "Confirm Mint"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "truncate font-mono text-xs" : "font-medium"}>{value}</span>
    </div>
  );
}
