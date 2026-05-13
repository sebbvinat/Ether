"use client";

import { useEffect, useState, useMemo } from "react";
import { Search, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchExchangeSymbols } from "@/lib/binance/rest";
import { INDICES, getInstrument, type Instrument } from "@/lib/instruments";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";
import type { SymbolInfo } from "@/lib/binance/types";

interface Props {
  slotId?: string;
  compact?: boolean;
}

export function SymbolSelector({ slotId, compact }: Props = {}) {
  const slots = useChartStore((s) => s.slots);
  const activeSlotId = useChartStore((s) => s.activeSlotId);
  const symbolGlobal = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const addToWatchlist = useChartStore((s) => s.addToWatchlist);
  const openGlobal = useChartStore((s) => s.symbolDialogOpen);
  const setOpenGlobal = useChartStore((s) => s.setSymbolDialogOpen);

  const targetId = slotId ?? activeSlotId;
  const symbol =
    slotId !== undefined
      ? slots.find((s) => s.id === slotId)?.symbol ?? symbolGlobal
      : symbolGlobal;
  const [localOpen, setLocalOpen] = useState(false);
  const open = slotId !== undefined ? localOpen : openGlobal;
  const setOpen = slotId !== undefined ? setLocalOpen : setOpenGlobal;

  const [query, setQuery] = useState("");
  const [allCrypto, setAllCrypto] = useState<SymbolInfo[]>([]);

  useEffect(() => {
    if (open && allCrypto.length === 0) {
      fetchExchangeSymbols().then(setAllCrypto).catch(console.error);
    }
  }, [open, allCrypto.length]);

  const filtered = useMemo<Instrument[]>(() => {
    const q = query.trim().toUpperCase();
    const idx = INDICES.filter(
      (i) =>
        !q ||
        i.symbol.toUpperCase().includes(q) ||
        i.displayName.toUpperCase().includes(q),
    );
    const crypto = allCrypto
      .filter(
        (s) =>
          !q ||
          s.symbol.includes(q) ||
          s.baseAsset.includes(q) ||
          s.quoteAsset.includes(q),
      )
      .slice(0, 100)
      .map<Instrument>((s) => ({
        symbol: s.symbol,
        displayName: `${s.baseAsset}/${s.quoteAsset}`,
        baseAsset: s.baseAsset,
        quoteAsset: s.quoteAsset,
        provider: "binance",
        exchange: "Binance",
        type: "crypto",
      }));
    return [...idx, ...crypto];
  }, [query, allCrypto]);

  const selectedDisplayName = getInstrument(symbol).displayName;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={cn(
          "group flex items-center gap-2 rounded font-semibold hover:bg-tv-panel-hover",
          compact ? "px-1.5 py-0.5 text-[11px]" : "px-3 py-1.5 text-sm",
        )}
      >
        <Search
          className={cn(
            "text-tv-text-muted group-hover:text-tv-text",
            compact ? "h-3 w-3" : "h-3.5 w-3.5",
          )}
        />
        <span className="tabular-nums">{selectedDisplayName}</span>
        <ChevronDown
          className={cn(
            "text-tv-text-muted",
            compact ? "h-3 w-3" : "h-3.5 w-3.5",
          )}
        />
      </DialogTrigger>
      <DialogContent className="max-w-md gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="text-sm font-medium">Buscar símbolo</DialogTitle>
        </DialogHeader>
        <div className="border-b border-tv-border p-3">
          <Input
            autoFocus
            placeholder="S&P, NASDAQ, BTC, ETH…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-tv-bg"
          />
        </div>
        <ScrollArea className="h-[400px]">
          <div className="flex flex-col">
            {filtered.length === 0 && (
              <div className="p-4 text-center text-xs text-tv-text-muted">
                Sin resultados
              </div>
            )}
            {filtered.map((i) => (
              <button
                key={i.symbol}
                onClick={() => {
                  setSymbol(i.symbol, targetId);
                  addToWatchlist(i.symbol);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "flex items-center justify-between border-b border-tv-border px-4 py-2 text-left text-xs hover:bg-tv-panel-hover",
                  i.symbol === symbol && "bg-tv-panel-hover",
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-tv-text">
                    {i.type === "index" ? i.displayName : i.baseAsset}
                  </span>
                  {i.type === "crypto" && (
                    <span className="text-tv-text-muted">/ {i.quoteAsset}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                      i.type === "index"
                        ? "bg-tv-blue/20 text-tv-blue"
                        : "bg-tv-panel-hover text-tv-text-muted",
                    )}
                  >
                    {i.exchange}
                  </span>
                  <span className="text-tv-text-muted">{i.symbol}</span>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
