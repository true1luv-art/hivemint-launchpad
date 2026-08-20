import { useEffect, useMemo, useState } from "react";
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
import { collectionCreationCost, config } from "@/lib/config/config";
import { AssetUploader, type PickedFile } from "@/components/AssetUploader";
import { Progress } from "@/components/ui/progress";
import {
  uploadCollectionAssets,
  validateUploadInput,
  type CollectionAssetBundle,
  type UploadState,
} from "@/lib/storage/collection-upload";
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
  const [coverFile, setCoverFile] = useState<PickedFile | null>(null);
  const [assetFiles, setAssetFiles] = useState<PickedFile[]>([]);
  const [reusableAssets, setReusableAssets] = useState(true);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [bundle, setBundle] = useState<CollectionAssetBundle | null>(null);

  // Object URLs must be released when the picked files change.
  useEffect(
    () => () => {
      if (coverFile) URL.revokeObjectURL(coverFile.previewUrl);
    },
    [coverFile],
  );
  useEffect(
    () => () => {
      assetFiles.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    },
    [assetFiles],
  );

  const image = useMemo(
    () => generateArtwork(`preview-${symbol}-${name}-${imageSeed}`, "Epic"),
    [symbol, name, imageSeed],
  );

  const supply = Number(maxSupply) || 0;
  const creationCost = collectionCreationCost(supply);
  const assetIssues = useMemo(() => {
    if (!coverFile || assetFiles.length === 0) return [];
    return validateUploadInput({
      name,
      symbol,
      description,
      creator: "alice",
      maxSupply: supply,
      mintPrice: Number(mintPrice) || 0,
      reusableAssets,
      collectionImage: coverFile.file,
      nftAssets: assetFiles.map((f) => f.file),
    });
  }, [coverFile, assetFiles, name, symbol, description, supply, mintPrice, reusableAssets]);

  const rarityTotal = rarities.reduce((s, r) => s + r.weight, 0);
  const valid =
    name.trim().length > 1 &&
    symbol.trim().length > 1 &&
    Number(maxSupply) > 0 &&
    Number(mintPrice) > 0 &&
    rarityTotal === 100 &&
    !!coverFile &&
    assetFiles.length > 0 &&
    assetIssues.length === 0;

  const setWeight = (rarity: Rarity, weight: number) =>
    setRarities((rs) => rs.map((r) => (r.rarity === rarity ? { ...r, weight } : r)));

  const submit = async () => {
    if (!valid || !coverFile) {
      toast.error("Check the form", {
        description:
          assetIssues[0]?.message ?? "Upload the collection artwork and NFT assets, and make rarity total 100%.",
      });
      return;
    }
    if (balance < creationCost) {
      toast.error("Insufficient HIVE balance", {
        description: `Deploying ${num(supply)} NFTs costs ${hive(creationCost)}.`,
      });
      return;
    }
    setState("pending");
    try {
      // 1. Assets first — no transaction exists until every CID is pinned.
      const uploaded =
        bundle ??
        (await uploadCollectionAssets(
          {
            name: name.trim(),
            symbol: symbol.trim().toUpperCase(),
            description: description.trim(),
            creator: "alice",
            maxSupply: supply,
            mintPrice: Number(mintPrice),
            reusableAssets,
            collectionImage: coverFile.file,
            nftAssets: assetFiles.map((f) => f.file),
          },
          setUpload,
        ));
      setBundle(uploaded);

      // 2. Then deploy, carrying ipfs:// references only.
      const collection = await createCollection({
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        description: description.trim(),
        image: coverFile.previewUrl,
        maxSupply: supply,
        mintPrice: Number(mintPrice),
        creatorFee: Number(creatorFee),
        platformFee: Number(platformFee),
        rarities,
        metadataBaseUri: uploaded.metadataRootUri,
        creationCost,
        assets: {
          collectionImageUri: uploaded.collectionImageUri,
          collectionMetadataUri: uploaded.collectionMetadataUri,
          assetRootUri: uploaded.assetRootUri,
          metadataRootUri: uploaded.metadataRootUri,
          assetCount: uploaded.items.length,
          reusableAssets: uploaded.reusableAssets,
        },
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
        </section>

        <section className="surface-card space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Collection assets</h2>
            <span className="text-xs text-muted-foreground">Stored on IPFS (mock)</span>
          </div>

          <AssetUploader
            label="Collection artwork"
            hint={`PNG, JPG, WEBP or GIF · up to ${(config.storage.maxCollectionAssetSize / 1024 / 1024).toFixed(0)}MB`}
            accept={config.storage.supportedImageTypes.join(",")}
            files={coverFile ? [coverFile] : []}
            disabled={state === "pending"}
            onPick={(files) => {
              const file = files[0];
              if (!file) return;
              setBundle(null);
              setCoverFile({ file, previewUrl: URL.createObjectURL(file) });
            }}
            onRemove={() => setCoverFile(null)}
          />

          <AssetUploader
            label="NFT assets"
            hint={`Name files 1.png, 2.png … to control token numbers · up to ${config.storage.maxNftAssets} files`}
            accept={config.storage.supportedImageTypes.join(",")}
            multiple
            files={assetFiles}
            disabled={state === "pending"}
            onPick={(files) => {
              setBundle(null);
              setAssetFiles((prev) => [
                ...prev,
                ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
              ]);
            }}
            onRemove={(index) => setAssetFiles((prev) => prev.filter((_, i) => i !== index))}
          />

          <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={reusableAssets}
              onChange={(e) => setReusableAssets(e.target.checked)}
            />
            <span>
              Reuse assets across mints
              <span className="block text-xs text-muted-foreground">
                Off: you must upload one asset per token ({num(supply)} files).
              </span>
            </span>
          </label>

          <div className="rounded-lg border border-border p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Assets ready</span>
              <span className="font-medium">
                {assetFiles.length} / {reusableAssets ? assetFiles.length : num(supply)}
              </span>
            </div>
            {upload ? (
              <div className="mt-3 space-y-2">
                <Progress value={upload.total ? (upload.completed / upload.total) * 100 : 0} />
                <p className="text-xs text-muted-foreground">
                  {upload.stage === "done" ? "Pinned to IPFS" : `${upload.stage} · ${upload.filename}`} (
                  {upload.completed}/{upload.total})
                </p>
              </div>
            ) : null}
            {bundle ? (
              <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">{bundle.assetRootUri}</p>
            ) : null}
            {assetIssues.length ? (
              <ul className="mt-2 space-y-1 text-xs text-destructive">
                {assetIssues.slice(0, 4).map((issue, i) => (
                  <li key={i}>
                    {issue.filename}: {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
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
          <img
            src={coverFile?.previewUrl ?? image}
            alt="Collection preview artwork"
            className="aspect-square w-full object-cover"
          />
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
            <span className="text-muted-foreground">
              Deployment fee · {num(supply)} × {config.fees.nftCreationCostPerMint} HIVE
            </span>
            <span className="font-medium">{hive(creationCost)}</span>
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
