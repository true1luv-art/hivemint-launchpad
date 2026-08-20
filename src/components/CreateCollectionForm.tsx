import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RarityChart } from "@/components/RarityChart";
import { TransactionStatus, type TxState } from "@/components/TransactionStatus";
import { generateArtwork } from "@/lib/art";
import { hive, num } from "@/lib/format";
import { DEFAULT_RARITIES } from "@/lib/mock-data";
import type { Rarity, RarityConfig } from "@/lib/types";
import { COLLECTION_CREATION_FEE } from "@/services";
import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/lib/utils";

export function CreateCollectionForm() {
  const navigate = useNavigate();
  const createCollection = useAppStore((s) => s.createCollection);
  const balance = useAppStore((s) => (s.user ? (s.balances[s.user.username] ?? 0) : 0));

  const [name, setName] = useState("Ember Sentinels");
  const [symbol, setSymbol] = useState("EMBS");
  const [description, setDescription] = useState(
    "A guardian series forged in the Hive furnace. Each sentinel protects a shard of the chain.",
  );
  const [maxSupply, setMaxSupply] = useState("2500");
  const [mintPrice, setMintPrice] = useState("4.00");
  const [creatorFee, setCreatorFee] = useState("85");
  const [platformFee, setPlatformFee] = useState("5");
  const [metadataBaseUri, setMetadataBaseUri] = useState("https://meta.hivemint.app/embs/");
  const [rarities, setRarities] = useState<RarityConfig[]>(DEFAULT_RARITIES.map((r) => ({ ...r })));
  const [state, setState] = useState<TxState>("idle");
  const [imageSeed, setImageSeed] = useState(1);

  const image = useMemo(
    () => generateArtwork(`preview-${symbol}-${name}-${imageSeed}`, "Epic"),
    [symbol, name, imageSeed],
  );

  const rarityTotal = rarities.reduce((s, r) => s + r.weight, 0);
  const valid =
    name.trim().length > 1 &&
    symbol.trim().length > 1 &&
    Number(maxSupply) > 0 &&
    Number(mintPrice) > 0 &&
    rarityTotal === 100;

  const setWeight = (rarity: Rarity, weight: number) =>
    setRarities((rs) => rs.map((r) => (r.rarity === rarity ? { ...r, weight } : r)));

  const submit = async () => {
    if (!valid) {
      toast.error("Check the form", { description: "Rarity weights must total exactly 100%." });
      return;
    }
    if (balance < COLLECTION_CREATION_FEE) {
      toast.error("Insufficient HIVE balance");
      return;
    }
    setState("pending");
    try {
      const collection = await createCollection({
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        description: description.trim(),
        image,
        maxSupply: Number(maxSupply),
        mintPrice: Number(mintPrice),
        creatorFee: Number(creatorFee),
        platformFee: Number(platformFee),
        rarities,
        metadataBaseUri: metadataBaseUri.trim(),
      });
      setState("success");
      toast.success("Collection created", { description: `${collection.name} is live` });
      setTimeout(() => navigate({ to: "/collections/$id", params: { id: collection.id } }), 900);
    } catch (e) {
      setState("error");
      toast.error(e instanceof Error ? e.message : "Creation failed");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <section className="surface-card space-y-4 p-6">
          <h2 className="font-display text-lg font-semibold">Collection details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Collection name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Symbol">
              <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} maxLength={6} />
            </Field>
          </div>
          <Field label="Description">
            <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Collection image" hint="Generated artwork placeholder — upload arrives with storage.">
            <Button variant="outline" type="button" onClick={() => setImageSeed((s) => s + 1)}>
              Regenerate artwork
            </Button>
          </Field>
        </section>

        <section className="surface-card space-y-4 p-6">
          <h2 className="font-display text-lg font-semibold">Economics</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Total supply">
              <Input inputMode="numeric" value={maxSupply} onChange={(e) => setMaxSupply(e.target.value)} />
            </Field>
            <Field label="Mint price (HIVE)">
              <Input inputMode="decimal" value={mintPrice} onChange={(e) => setMintPrice(e.target.value)} />
            </Field>
            <Field label="Creator fee (%)">
              <Input inputMode="numeric" value={creatorFee} onChange={(e) => setCreatorFee(e.target.value)} />
            </Field>
            <Field label="Platform fee (%)">
              <Input inputMode="numeric" value={platformFee} onChange={(e) => setPlatformFee(e.target.value)} />
            </Field>
          </div>
          <Field label="Metadata base URI">
            <Input value={metadataBaseUri} onChange={(e) => setMetadataBaseUri(e.target.value)} />
          </Field>
        </section>

        <section className="surface-card space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Rarity configuration</h2>
            <span
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                rarityTotal === 100
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-destructive/40 bg-destructive/10 text-destructive",
              )}
            >
              Total = {rarityTotal}%
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {rarities.map((r) => (
              <Field key={r.rarity} label={r.rarity}>
                <Input
                  inputMode="numeric"
                  value={String(r.weight)}
                  onChange={(e) => setWeight(r.rarity, Number(e.target.value) || 0)}
                />
              </Field>
            ))}
          </div>
          <RarityChart rarities={rarities} />
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <section className="surface-card overflow-hidden">
          <img src={image} alt="Collection preview artwork" className="aspect-square w-full object-cover" />
          <div className="space-y-3 p-5">
            <div>
              <p className="text-xs text-muted-foreground">Live preview</p>
              <h3 className="font-display text-xl font-semibold">{name || "Untitled collection"}</h3>
              <p className="text-xs text-muted-foreground">by @alice · {symbol || "—"}</p>
            </div>
            <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Supply</dt>
                <dd className="font-display font-semibold">{num(Number(maxSupply) || 0)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Mint price</dt>
                <dd className="font-display font-semibold">{hive(Number(mintPrice) || 0)}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="surface-card space-y-3 p-5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Deployment fee</span>
            <span className="font-medium">{hive(COLLECTION_CREATION_FEE)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Your balance</span>
            <span className="font-medium">{hive(balance)}</span>
          </div>
          <TransactionStatus state={state} successLabel="Collection deployed" />
          <Button onClick={submit} disabled={state === "pending" || !valid} size="lg" className="w-full gap-2">
            {state === "pending" ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
            {state === "pending" ? "Deploying…" : "Create Collection"}
          </Button>
        </section>
      </aside>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
