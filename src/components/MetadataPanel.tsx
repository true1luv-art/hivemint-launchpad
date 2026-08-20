import { RarityBadge } from "@/components/RarityBadge";
import { hive, num, shortDate } from "@/lib/format";
import type { NFT } from "@/lib/types";

export function MetadataPanel({ nft }: { nft: NFT }) {
  return (
    <div className="space-y-6">
      <section className="surface-card p-5">
        <h2 className="font-display text-lg font-semibold">Metadata</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <Row label="Name" value={nft.name} />
          <Row label="Mint" value={`#${nft.mintNumber}`} />
          <Row label="Max supply" value={num(nft.maxSupply)} />
          <Row label="Metadata URI" value={nft.metadataUri} mono />
          <div>
            <dt className="text-muted-foreground">Description</dt>
            <dd className="mt-1 leading-relaxed text-muted-foreground">{nft.description}</dd>
          </div>
        </dl>

        <h3 className="mt-6 text-xs font-medium tracking-widest text-muted-foreground uppercase">Attributes</h3>
        <ul className="mt-3 grid grid-cols-2 gap-3">
          {nft.attributes.map((a) => (
            <li key={a.trait} className="rounded-lg border border-border bg-surface px-3 py-2">
              <p className="text-[11px] tracking-wider text-muted-foreground uppercase">{a.trait}</p>
              <p className="mt-0.5 font-display text-sm font-semibold">{String(a.value)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="surface-card p-5">
        <h2 className="font-display text-lg font-semibold">Blockchain</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <Row label="Network" value="Hive" />
          <Row label="NFT standard" value="Hive Engine NFT" />
          <Row label="Collection" value={nft.collectionName} />
          <Row label="Token ID" value={String(nft.tokenId)} mono />
          <Row label="Minted" value={shortDate(nft.createdAt)} />
          <Row label="Estimated value" value={hive(nft.estimatedValue)} />
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Rarity</dt>
            <dd>
              <RarityBadge rarity={nft.rarity} />
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={mono ? "truncate font-mono text-xs" : "text-right font-medium"}>{value}</dd>
    </div>
  );
}
