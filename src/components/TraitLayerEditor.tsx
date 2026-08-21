import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateInventory } from "@/lib/traits/generator";
import { buildGenerationSummary } from "@/lib/traits/frequency";
import { maxCombinations, validateTraitConfig } from "@/lib/traits/validation";
import { normalizedProbabilities } from "@/lib/traits/weighted-random";
import type { TraitLayerConfig } from "@/lib/traits/types";
import { cn } from "@/lib/utils";

const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

const PREVIEW_CAP = 200;

interface Props {
  layers: TraitLayerConfig[];
  onChange: (layers: TraitLayerConfig[]) => void;
  supply: number;
  className?: string;
}

/**
 * Layer / value / weight configuration. Rarity is never configured here — it
 * is derived from the generated collection's rarity ranks.
 */
export function TraitLayerEditor({ layers, onChange, supply, className }: Props) {
  const [preview, setPreview] = useState<ReturnType<typeof buildGenerationSummary> | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const issues = useMemo(() => validateTraitConfig(layers, supply), [layers, supply]);
  const capacity = useMemo(() => maxCombinations(layers), [layers]);

  const updateLayer = (id: string, patch: Partial<TraitLayerConfig>) =>
    onChange(layers.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const addLayer = () =>
    onChange([
      ...layers,
      {
        id: uid("layer"),
        name: `Layer ${layers.length + 1}`,
        order: layers.length,
        enabled: true,
        values: [
          { id: uid("val"), name: "None", weight: 50, enabled: true },
          { id: uid("val"), name: "Variant A", weight: 50, enabled: true },
        ],
      },
    ]);

  const runPreview = () => {
    try {
      const count = Math.max(1, Math.min(supply || 1, PREVIEW_CAP));
      const inventory = generateInventory({ layers, count, seedKey: `preview-${count}-${capacity}` });
      setPreview(buildGenerationSummary(layers, inventory.tokens, inventory.maxCombinations));
      setPreviewError(null);
    } catch (e) {
      setPreview(null);
      setPreviewError(e instanceof Error ? e.message : "Generation failed");
    }
  };

  return (
    <div className={cn("space-y-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Trait layers &amp; weights</h2>
          <p className="text-xs text-muted-foreground">
            {capacity.toLocaleString()} unique combinations possible · supply {supply.toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addLayer}>
            <Plus className="size-4" /> Layer
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={runPreview}>
            Preview generation
          </Button>
        </div>
      </div>

      {issues.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {issues.map((issue, i) => (
            <li key={i}>{issue.message}</li>
          ))}
        </ul>
      )}

      <div className="space-y-4">
        {layers.map((layer) => {
          const probabilities = normalizedProbabilities(layer.values);
          return (
            <div key={layer.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center gap-2">
                <Input
                  value={layer.name}
                  aria-label="Layer name"
                  onChange={(e) => updateLayer(layer.id, { name: e.target.value })}
                  className="max-w-56"
                />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={layer.enabled}
                    onChange={(e) => updateLayer(layer.id, { enabled: e.target.checked })}
                  />
                  Enabled
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ml-auto"
                  aria-label={`Remove ${layer.name}`}
                  onClick={() => onChange(layers.filter((l) => l.id !== layer.id))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              <ul className="mt-3 space-y-2">
                {layer.values.map((value) => (
                  <li key={value.id} className="flex items-center gap-2">
                    <Input
                      value={value.name}
                      aria-label="Trait value name"
                      onChange={(e) =>
                        updateLayer(layer.id, {
                          values: layer.values.map((v) => (v.id === value.id ? { ...v, name: e.target.value } : v)),
                        })
                      }
                    />
                    <Input
                      inputMode="numeric"
                      aria-label="Weight"
                      className="w-24"
                      value={String(value.weight)}
                      onChange={(e) =>
                        updateLayer(layer.id, {
                          values: layer.values.map((v) =>
                            v.id === value.id ? { ...v, weight: Number(e.target.value) || 0 } : v,
                          ),
                        })
                      }
                    />
                    <span className="w-14 text-right text-xs text-muted-foreground">
                      {((probabilities.get(value.id) ?? 0) * 100).toFixed(1)}%
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${value.name}`}
                      onClick={() =>
                        updateLayer(layer.id, { values: layer.values.filter((v) => v.id !== value.id) })
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() =>
                  updateLayer(layer.id, {
                    values: [
                      ...layer.values,
                      { id: uid("val"), name: `Value ${layer.values.length + 1}`, weight: 10, enabled: true },
                    ],
                  })
                }
              >
                <Plus className="size-4" /> Value
              </Button>
            </div>
          );
        })}
      </div>

      {previewError && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {previewError}
        </p>
      )}

      {preview && (
        <div className="space-y-3 rounded-xl border border-border bg-surface-raised p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Sampled" value={preview.totalTokens.toLocaleString()} />
            <Stat label="Unique" value={preview.uniqueCombinations.toLocaleString()} />
            <Stat label="Avg score" value={preview.averageRarityScore.toFixed(1)} />
            <Stat label="Top score" value={preview.highestRarityScore.toFixed(1)} />
          </div>
          <ul className="max-h-64 space-y-1 overflow-auto text-xs">
            {preview.frequencies.map((f) => (
              <li key={f.traitValueId} className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  {f.layerName} · {f.traitValueName}
                </span>
                <span>
                  {(f.actualFrequency * 100).toFixed(1)}%{" "}
                  <span className="text-muted-foreground">
                    (target {(f.configuredProbability * 100).toFixed(1)}%)
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display text-lg font-semibold">{value}</p>
    </div>
  );
}
