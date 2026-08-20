import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Hexagon, Menu, X } from "lucide-react";

import { NavSearch } from "@/components/NavSearch";
import { WalletButton } from "@/components/WalletButton";
import { cn } from "@/lib/utils";

const links = [{ to: "/collections", label: "Collections" }] as const;

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl gradient-ember text-primary-foreground">
            <Hexagon className="size-5" strokeWidth={2.5} />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">HiveMint</span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeProps={{ className: "text-foreground bg-surface-raised" }}
              inactiveProps={{ className: "text-muted-foreground" }}
              className="rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <NavSearch className="ml-auto hidden w-full max-w-sm md:block" />

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link
            to="/creator/collections/new"
            className="hidden rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium transition-colors hover:border-border-strong sm:inline-flex"
          >
            Create Collection
          </Link>
          <WalletButton />
          <button
            className="rounded-lg border border-border p-2 lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      <nav className={cn("border-t border-border lg:hidden", open ? "block" : "hidden")}>
        <div className="mx-auto grid max-w-[1400px] gap-1 px-4 py-3">
          {[...links, { to: "/creator/collections/new", label: "Create Collection" } as const].map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              activeProps={{ className: "bg-surface-raised text-foreground" }}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
