import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, X } from "lucide-react";

import { hive } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";

interface NavSearchProps {
  className?: string;
  onNavigate?: () => void;
}

export function NavSearch({ className, onNavigate }: NavSearchProps) {
  const collections = useAppStore((s) => s.collections);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return collections
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.symbol.toLowerCase().includes(q) ||
          c.creator.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [collections, query]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(id: string) {
    setOpen(false);
    setQuery("");
    onNavigate?.();
    navigate({ to: "/collections/$id", params: { id } });
  }

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            if (results[active]) go(results[active].id);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        type="search"
        placeholder="Search collections…"
        aria-label="Search collections"
        className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-border-strong"
      />
      {query && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setQuery("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}

      {open && query.trim() && (
        <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border border-border bg-background/95 shadow-xl backdrop-blur-xl">
          {results.length ? (
            results.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(c.id)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                  i === active ? "bg-surface-raised" : "hover:bg-surface",
                )}
              >
                <img src={c.image} alt="" className="size-9 shrink-0 rounded-lg object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.symbol} · @{c.creator}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{hive(c.floorPrice)}</span>
              </button>
            ))
          ) : (
            <p className="px-3 py-4 text-sm text-muted-foreground">No collections match “{query}”.</p>
          )}
        </div>
      )}
    </div>
  );
}
