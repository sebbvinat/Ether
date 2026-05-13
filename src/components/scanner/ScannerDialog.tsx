"use client";

import { useEffect, useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchTickers24h, fetchExchangeSymbols } from "@/lib/binance/rest";
import { useChartStore } from "@/lib/store/chart-store";
import { formatPrice, formatPct, formatVolume } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface Row {
  symbol: string;
  base: string;
  price: number;
  pct: number;
  volume: number;
}

type SortKey = "pct" | "volume" | "price" | "symbol";

export function ScannerDialog({ open, onOpenChange }: Props) {
  const setSymbol = useChartStore((s) => s.setSymbol);
  const addToWatchlist = useChartStore((s) => s.addToWatchlist);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("pct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const symbols = await fetchExchangeSymbols();
      const usdtSymbols = symbols.map((s) => s.symbol);
      // Binance limits arr length. Split in chunks.
      const chunks: string[][] = [];
      for (let i = 0; i < usdtSymbols.length; i += 100) {
        chunks.push(usdtSymbols.slice(i, i + 100));
      }
      const all = await Promise.all(chunks.map((c) => fetchTickers24h(c)));
      const tickers = all.flat();
      const baseMap = new Map(symbols.map((s) => [s.symbol, s.baseAsset]));
      const newRows: Row[] = tickers.map((t) => ({
        symbol: t.symbol,
        base: baseMap.get(t.symbol) ?? t.symbol,
        price: t.lastPrice,
        pct: t.priceChangePercent,
        volume: t.quoteVolume,
      }));
      setRows(newRows);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) load();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    let out = rows;
    if (q) {
      out = out.filter(
        (r) => r.symbol.includes(q) || r.base.includes(q),
      );
    }
    out = [...out].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === "string" && typeof vb === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      const na = Number(va);
      const nb = Number(vb);
      return sortDir === "asc" ? na - nb : nb - na;
    });
    return out.slice(0, 200);
  }, [rows, query, sortKey, sortDir]);

  function setSort(k: SortKey) {
    if (k === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir(k === "symbol" ? "asc" : "desc");
    }
  }

  function pick(s: string) {
    setSymbol(s);
    addToWatchlist(s);
    onOpenChange(false);
  }

  const gainers = rows.filter((r) => r.pct > 0).length;
  const losers = rows.filter((r) => r.pct < 0).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="flex items-center justify-between gap-2 text-sm font-medium">
            <span>Scanner — Binance USDT</span>
            <span className="flex items-center gap-2 text-[11px] text-tv-text-muted">
              <span className="flex items-center gap-1 text-tv-green">
                <TrendingUp className="h-3 w-3" />
                {gainers}
              </span>
              <span className="flex items-center gap-1 text-tv-red">
                <TrendingDown className="h-3 w-3" />
                {losers}
              </span>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="border-b border-tv-border p-3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-tv-text-muted" />
            <Input
              autoFocus
              placeholder="Filtrar (BTC, ETH…)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="bg-tv-bg pl-7"
            />
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 border-b border-tv-border px-4 py-1.5 text-[10px] uppercase tracking-wider text-tv-text-dim">
          <HeaderBtn label="Símbolo" sortKey="symbol" current={sortKey} dir={sortDir} onClick={() => setSort("symbol")} align="left" />
          <HeaderBtn label="Precio" sortKey="price" current={sortKey} dir={sortDir} onClick={() => setSort("price")} />
          <HeaderBtn label="24h %" sortKey="pct" current={sortKey} dir={sortDir} onClick={() => setSort("pct")} />
          <HeaderBtn label="24h Vol" sortKey="volume" current={sortKey} dir={sortDir} onClick={() => setSort("volume")} />
        </div>

        {error && (
          <div className="bg-tv-red/10 px-4 py-2 text-[11px] text-tv-red">
            ⚠ {error}
          </div>
        )}

        <ScrollArea className="h-[450px]">
          {loading && rows.length === 0 && (
            <div className="p-4 text-center text-xs text-tv-text-muted">
              Cargando…
            </div>
          )}
          {!loading && filtered.length === 0 && rows.length > 0 && (
            <div className="p-4 text-center text-xs text-tv-text-muted">
              Sin resultados
            </div>
          )}
          {filtered.map((r) => (
            <button
              key={r.symbol}
              onClick={() => pick(r.symbol)}
              className="grid w-full grid-cols-[1fr_auto_auto_auto] gap-2 border-b border-tv-border px-4 py-1.5 text-left text-xs hover:bg-tv-panel-hover"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-tv-text">{r.base}</span>
                <span className="text-[10px] text-tv-text-dim">USDT</span>
              </div>
              <span className="text-right tabular-nums text-tv-text">
                {formatPrice(r.price)}
              </span>
              <span
                className={cn(
                  "min-w-[60px] text-right tabular-nums",
                  r.pct >= 0 ? "text-tv-green" : "text-tv-red",
                )}
              >
                {formatPct(r.pct)}
              </span>
              <span className="min-w-[70px] text-right tabular-nums text-tv-text-muted">
                {formatVolume(r.volume)}
              </span>
            </button>
          ))}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function HeaderBtn({
  label,
  sortKey,
  current,
  dir,
  onClick,
  align,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right";
}) {
  const isActive = sortKey === current;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-0.5 hover:text-tv-text",
        align === "left" ? "" : "justify-end",
        isActive ? "text-tv-text" : "",
      )}
    >
      {label}
      {isActive && <span>{dir === "asc" ? "↑" : "↓"}</span>}
    </button>
  );
}
