import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Rocket, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { AssetUploader, type PickedFile } from "@/components/AssetUploader";
import { ImportDropzone } from "@/components/import/ImportDropzone";
import { ValidationReport } from "@/components/import/ValidationReport";
import { TraitAnalysis } from "@/components/import/TraitAnalysis";
import { ImportPreviewGrid } from "@/components/import/ImportPreviewGrid";
import { TransactionStatus, type TxState } from "@/components/TransactionStatus";
import { generateArtwork } from "@/lib/art";
import { hive, num } from "@/lib/format";
import { DEFAULT_RARITIES } from "@/lib/mock-data";
import { collectionCreationCost, config } from "@/lib/config/config";
import { buildImportReport, parseMetadataFiles, uploadImportedCollection } from "@/lib/import";
import { traitLayersFromImport } from "@/lib/import/derive";
import type { ImportReport } from "@/lib/import/types";
import type { UploadState } from "@/lib/import/pipeline";
import type { NFT, Rarity } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/lib/utils";

const STEPS = ["Details", "Upload", "Review", "Deploy"] as const;
type Step = 0 | 1 | 2 | 3;

const PREVIEW_SAMPLE = 24;
const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
const legacyRarity = (label: string): Rarity =>
  label === "Legendary" || label === "Epic" || label === "Rare" ? label : "Common";

/**
 * Collection IMPORT wizard.
 *
 * The platform never generates NFTs: the creator brings a finished collection
 * (metadata JSON + images) and this flow validates, matches, analyses and
 * indexes it, then pins it and registers the collection.
 */
export function CreateCollectionForm() {
  const navigate = useNavigate();
  const createCollection = useAppStore((s) => s.createCollection);
  const balance = useAppStore((s) => (s.user ? (s.balances[s.user.username] ?? 0) : 0));

  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState("Ember Sentinels");
  const [symbol, setSymbol] = useState("EMBS");
  const [description, setDescription] = useState(
    "A guardian series forged in the Hive furnace. Each sentinel protects a shard of the chain.",
  );
  const [mintPrice, setMintPrice] = useState("4.00");
  const [creatorFee, setCreatorFee] = useState("85");
  const [platformFee, setPlatformFee] = useState("5");
  const [coverFile, setCoverFile] = useState<PickedFile | null>(null);

  const [metadataFiles, setMetadataFiles] = useState<File[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [useImportOrder, setUseImportOrder] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  const [state, setState] = useState<TxState>("idle");
  const [upload, setUpload] = useState<UploadState | null>(null);
  const previewUrls = useRef<string[]>([]);

  useEffect(
    () => () => {
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  useEffect(
    () => () => {
      if (coverFile) URL.revokeObjectURL(coverFile.previewUrl);
    },
    [coverFile],
  );

  const supply = report?.statistics.totalNfts ?? 0;
  const creationCost = collectionCreationCost(supply);
  const fallbackImage = useMemo(() => generateArtwork(`preview-${symbol}-${name}`, "Epic"), [symbol, name]);

  const detailsValid = name.trim().length > 1 && symbol.trim().length > 1 && Number(mintPrice) > 0 && !!coverFile;

  const analyze = async () => {
    setAnalyzing(true);
    try {
      const parsed = await parseMetadataFiles(metadataFiles);
      const images = imageFiles.map((file) => ({ name: file.name }));
      const base = buildImportReport({
        records: parsed.records,
        images,
        maxSupply: parsed.records.length,
        parseIssues: parsed.issues,
        useImportOrder,
      });

      // Previews only for the sample the review step actually renders.
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrls.current = [];
      const byName = new Map(imageFiles.map((f) => [f.name, f]));
      const sample = [...base.nfts].sort((a, b) => a.rarityRank - b.rarityRank).slice(0, PREVIEW_SAMPLE);
      for (const nft of sample) {
        const file = nft.matchedFilename ? byName.get(nft.matchedFilename) : undefined;
        if (!file) continue;
        const url = URL.createObjectURL(file);
        previewUrls.current.push(url);
        nft.previewUrl = url;
      }

      setReport({ ...base });
      setStep(2);
      if (!base.ready) toast.error("Import has errors", { description: "Fix them and analyse again." });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not analyse the package");
    } finally {
      setAnalyzing(false);
    }
  };

  const deploy = async () => {
    if (!report?.ready || !coverFile) return;
    if (balance < creationCost) {
      toast.error("Insufficient HIVE balance", {
        description: `Importing ${num(supply)} NFTs costs ${hive(creationCost)}.`,
      });
      return;
    }
    setState("pending");
    try {
      const byName = new Map(imageFiles.map((f) => [f.name, f]));
      const bundle = await uploadImportedCollection(
        {
          name: name.trim(),
          symbol: symbol.trim().toUpperCase(),
          description: description.trim(),
          creator: "alice",
          maxSupply: supply,
          mintPrice: Number(mintPrice),
          collectionImage: coverFile.file,
          imageFiles: byName,
          nfts: report.nfts,
        },
        setUpload,
      );

      const uriByToken = new Map(bundle.items.map((item) => [item.tokenId, item]));
      const importedNfts: NFT[] = report.nfts.map((nft) => {
        const ref = uriByToken.get(nft.tokenId);
        return {
          id: uid("nft"),
          collectionId: "",
          collectionName: name.trim(),
          tokenId: nft.tokenId,
          name: nft.name,
          description: nft.description || description.trim(),
          image: nft.previewUrl ?? ref?.imageUri ?? fallbackImage,
          rarity: legacyRarity(nft.rarityClass),
          rarityClass: legacyRarity(nft.rarityClass),
          traits: nft.attributes.map((attribute) => ({
            layerId: attribute.trait_type,
            layerName: attribute.trait_type,
            traitValueId: `${attribute.trait_type}:${attribute.value}`,
            traitValueName: String(attribute.value),
            weight: 0,
            probability: 0,
          })),
          rarityScore: nft.rarityScore,
          rarityRank: nft.rarityRank,
          rarityRankTotal: report.nfts.length,
          mintNumber: nft.tokenId,
          maxSupply: supply,
          owner: "",
          attributes: nft.attributes.map((attribute) => ({ trait: attribute.trait_type, value: attribute.value })),
          metadataUri: ref?.metadataUri ?? "",
          estimatedValue: Number(mintPrice),
          createdAt: new Date().toISOString(),
          status: "Owned",
        };
      });

      const collection = await createCollection({
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        description: description.trim(),
        image: coverFile.previewUrl,
        maxSupply: supply,
        mintPrice: Number(mintPrice),
        creatorFee: Number(creatorFee),
        platformFee: Number(platformFee),
        rarities: DEFAULT_RARITIES.map((r) => ({ ...r })),
        traitLayers: traitLayersFromImport(report),
        metadataBaseUri: bundle.metadataRootUri,
        creationCost,
        importedNfts,
        assets: {
          collectionImageUri: bundle.collectionImageUri,
          collectionMetadataUri: bundle.collectionMetadataUri,
          assetRootUri: bundle.assetRootUri,
          metadataRootUri: bundle.metadataRootUri,
          assetCount: bundle.items.length,
          reusableAssets: false,
        },
      });

      setState("success");
      toast.success("Collection imported", { description: `${num(supply)} NFTs indexed` });
      setTimeout(() => navigate({ to: "/collections/$id", params: { id: collection.id } }), 900);
    } catch (e) {
      setState("error");
      toast.error(e instanceof Error ? e.message : "Import failed");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <ol className="flex flex-wrap gap-2">
          {STEPS.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => index <= step && setStep(index as Step)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  index === step
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground",
                )}
              >
                {index + 1}. {label}
              </button>
            </li>
          ))}
        </ol>

        {step === 0 && (
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
            <div className="grid gap-4 sm:grid-cols-3">
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
            <AssetUploader
              label="Collection artwork"
              hint="Cover image for the collection — separate from the NFT images"
              accept={config.storage.supportedImageTypes.join(",")}
              files={coverFile ? [coverFile] : []}
              onPick={(files) => {
                const file = files[0];
                if (!file) return;
                setCoverFile({ file, previewUrl: URL.createObjectURL(file) });
              }}
              onRemove={() => setCoverFile(null)}
            />
            <Button className="w-full" disabled={!detailsValid} onClick={() => setStep(1)}>
              Continue to upload
            </Button>
          </section>
        )}

        {step === 1 && (
          <section className="surface-card space-y-5 p-6">
            <div>
              <h2 className="font-display text-lg font-semibold">Import your collection</h2>
              <p className="text-xs text-muted-foreground">
                Upload the metadata and images you already generated (NFTexport.io, HashLips, custom scripts).
                Supply is taken from the metadata — nothing is generated here.
              </p>
            </div>

            <ImportDropzone
              label="Metadata"
              hint="One JSON per NFT, or a single JSON array"
              accept=".json,application/json"
              files={metadataFiles}
              disabled={analyzing}
              onPick={(files) => setMetadataFiles((prev) => [...prev, ...files.filter((f) => /\.json$/i.test(f.name))])}
              onClear={() => setMetadataFiles([])}
            />

            <ImportDropzone
              label="Images"
              hint={`Filenames must match the metadata image references · up to ${num(config.storage.maxNftAssets)} files`}
              accept={config.storage.supportedImageTypes.join(",")}
              files={imageFiles}
              disabled={analyzing}
              onPick={(files) => setImageFiles((prev) => [...prev, ...files])}
              onClear={() => setImageFiles([])}
            />

            <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={useImportOrder}
                onChange={(e) => setUseImportOrder(e.target.checked)}
              />
              <span>
                Assign token IDs by import order
                <span className="block text-xs text-muted-foreground">
                  Use when your metadata has no edition or #number to read.
                </span>
              </span>
            </label>

            <Button
              className="w-full gap-2"
              disabled={analyzing || metadataFiles.length === 0 || imageFiles.length === 0}
              onClick={analyze}
            >
              {analyzing ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              {analyzing ? "Analysing…" : "Validate & analyse"}
            </Button>
          </section>
        )}

        {step === 2 && report && (
          <>
            <section className="surface-card space-y-4 p-6">
              <h2 className="font-display text-lg font-semibold">Validation</h2>
              <ValidationReport report={report} />
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Metric label="Metadata" value={num(report.statistics.totalNfts)} />
                <Metric label="Images" value={num(report.statistics.totalImages)} />
                <Metric label="Matched" value={num(report.statistics.matchedImages)} />
                <Metric label="Unmatched" value={num(report.statistics.missingImages)} />
              </dl>
            </section>

            <section className="surface-card space-y-4 p-6">
              <h2 className="font-display text-lg font-semibold">Trait analysis</h2>
              <TraitAnalysis report={report} />
            </section>

            <section className="surface-card space-y-4 p-6">
              <h2 className="font-display text-lg font-semibold">Preview</h2>
              <ImportPreviewGrid nfts={report.nfts} />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Back to files
                </Button>
                <Button className="flex-1" disabled={!report.ready} onClick={() => setStep(3)}>
                  Continue to deploy
                </Button>
              </div>
            </section>
          </>
        )}

        {step === 3 && report && (
          <section className="surface-card space-y-4 p-6">
            <h2 className="font-display text-lg font-semibold">Deploy</h2>
            <p className="text-sm text-muted-foreground">
              {num(supply)} NFTs will be pinned to IPFS and registered as unminted. Buyers claim one of these
              existing tokens when they mint.
            </p>
            {upload ? (
              <div className="space-y-2">
                <Progress value={upload.total ? (upload.completed / upload.total) * 100 : 0} />
                <p className="text-xs text-muted-foreground">
                  {upload.stage === "done" ? "Pinned to IPFS" : `${upload.stage} · ${upload.filename}`} (
                  {num(upload.completed)}/{num(upload.total)})
                </p>
              </div>
            ) : null}
            <TransactionStatus state={state} successLabel="Collection imported" />
            <Button onClick={deploy} disabled={state === "pending"} size="lg" className="w-full gap-2">
              {state === "pending" ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
              {state === "pending" ? "Importing…" : "Import collection"}
            </Button>
          </section>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <section className="surface-card overflow-hidden">
          <img
            src={coverFile?.previewUrl ?? fallbackImage}
            alt="Collection cover artwork"
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
                <dt className="text-xs text-muted-foreground">Imported supply</dt>
                <dd className="font-display font-semibold">{num(supply)}</dd>
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
              Import fee · {num(supply)} × {config.fees.nftCreationCostPerMint} HIVE
            </span>
            <span className="font-medium">{hive(creationCost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Your balance</span>
            <span className="font-medium">{hive(balance)}</span>
          </div>
        </section>
      </aside>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-display text-lg font-semibold">{value}</dd>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
