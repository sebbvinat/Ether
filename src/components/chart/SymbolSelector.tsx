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
import {
  INDICES,
  buildYahooInstrument,
  getInstrument,
  type Instrument,
} from "@/lib/instruments";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";
import type { SymbolInfo } from "@/lib/binance/types";

interface YahooSearchQuote {
  symbol: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  exchDisp?: string;
  typeDisp?: string;
  quoteType?: string;
}

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
  const addYahooSymbol = useChartStore((s) => s.addYahooSymbol);
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
  const [yahooResults, setYahooResults] = useState<Instrument[]>([]);
  const [yahooLoading, setYahooLoading] = useState(false);

  useEffect(() => {
    if (open && allCrypto.length === 0) {
      fetchExchangeSymbols().then(setAllCrypto).catch(console.error);
    }
  }, [open, allCrypto.length]);

  // Debounced Yahoo search
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 1) {
      setYahooResults([]);
      return;
    }
    setYahooLoading(true);
    const ctrl = new AbortController();
    const tid = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/yahoo/search?q=${encodeURIComponent(q)}`,
          { signal: ctrl.signal, cache: "no-store" },
        );
        if (!res.ok) {
          setYahooResults([]);
          return;
        }
        const json = (await res.json()) as { quotes?: YahooSearchQuote[] };
        const quotes = (json.quotes ?? []).filter((q) => !!q.symbol);
        // Exclude symbols already in our fixed indices list (avoid duplicates)
        const fixed = new Set(INDICES.map((i) => i.symbol));
        const insts = quotes
          .filter((q) => !fixed.has(q.symbol))
          .slice(0, 15)
          .map(buildYahooInstrument);
        setYahooResults(insts);
      } catch (e) {
        if ((e as Error).name !== "AbortError") console.error(e);
      } finally {
        setYahooLoading(false);
      }
    }, 250);
    return () => {
      ctrl.abort();
      clearTimeout(tid);
    };
  }, [query, open]);

  const filteredCryptoAndIndices = useMemo<Instrument[]>(() => {
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
      .slice(0, 50)
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

  function selectInstrument(inst: Instrument) {
    if (inst.provider === "yahoo" && !INDICES.some((i) => i.symbol === inst.symbol)) {
      addYahooSymbol(inst);
    }
    setSymbol(inst.symbol, targetId);
    addToWatchlist(inst.symbol);
    setOpen(false);
    setQuery("");
  }

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
        <span className="font-mono tabular-nums tracking-tight">
          {selectedDisplayName}
        </span>
        <ChevronDown
          className={cn(
            "text-tv-text-muted",
            compact ? "h-3 w-3" : "h-3.5 w-3.5",
          )}
        />
      </DialogTrigger>
      <DialogContent className="max-w-lg gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="text-sm font-medium">
            Buscar símbolo
          </DialogTitle>
        </DialogHeader>
        <div className="border-b border-tv-border p-3">
          <Input
            autoFocus
            placeholder="AAPL, TSLA, EURUSD, GOLD, BTC, S&P…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-tv-bg"
          />
        </div>
        <ScrollArea className="h-[440px]">
          <div className="flex flex-col">
            {yahooResults.length > 0 && (
              <>
                <SectionHeader
                  label={`Yahoo Finance${yahooLoading ? " · buscando…" : ""}`}
                />
                {yahooResults.map((i) => (
                  <Row
                    key={`yh-${i.symbol}`}
                    inst={i}
                    selected={i.symbol === symbol}
                    onClick={() => selectInstrument(i)}
                  />
                ))}
              </>
            )}
            {filteredCryptoAndIndices.length > 0 && (
              <>
                <SectionHeader label="Indices + Binance" />
                {filteredCryptoAndIndices.map((i) => (
                  <Row
                    key={i.symbol}
                    inst={i}
                    selected={i.symbol === symbol}
                    onClick={() => selectInstrument(i)}
                  />
                ))}
              </>
            )}
            {filteredCryptoAndIndices.length === 0 &&
              yahooResults.length === 0 &&
              !yahooLoading && (
                <div className="p-4 text-center text-xs text-tv-text-muted">
                  Sin resultados
                </div>
              )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-10 border-b border-tv-border bg-tv-panel px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
      {label}
    </div>
  );
}

function Row({
  inst,
  selected,
  onClick,
}: {
  inst: Instrument;
  selected: boolean;
  onClick: () => void;
}) {
  const badgeClass =
    inst.type === "index"
      ? "bg-tv-blue/20 text-tv-blue"
      : "bg-tv-panel-hover text-tv-text-muted";
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center justify-between border-b border-tv-border px-4 py-2 text-left text-xs hover:bg-tv-panel-hover",
        selected && "bg-tv-panel-hover",
      )}
    >
      <div className="flex items-center gap-3">
        <span className="font-semibold text-tv-text">
          {inst.type === "index" ? inst.displayName : inst.baseAsset}
        </span>
        {inst.type === "crypto" && (
          <span className="text-tv-text-muted">/ {inst.quoteAsset}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
            badgeClass,
          )}
        >
          {inst.exchange}
        </span>
        <span className="text-tv-text-muted">{inst.symbol}</span>
      </div>
    </button>
  );
}
