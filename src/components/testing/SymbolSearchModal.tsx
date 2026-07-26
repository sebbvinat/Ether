"use client";

/**
 * §14 — buscador de símbolos estilo TradingView.
 *
 * Reemplaza el input libre donde había que saber de memoria que el Nasdaq es
 * "^IXIC". Busca en dos lados a la vez: la lista de pares de Binance (que ya
 * viene cacheada) y el search de Yahoo para índices, acciones y forex.
 *
 * Se maneja entero con el teclado: escribir filtra, ↑/↓ mueve, Enter elige,
 * Esc cierra. Con el input vacío muestra los últimos elegidos.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { fetchExchangeSymbols } from "@/lib/binance/rest";
import { cn } from "@/lib/utils";

export interface SymbolResult {
  symbol: string;
  name: string;
  /** De dónde salen las velas de este símbolo. */
  provider: "binance" | "yahoo";
  /** Etiqueta corta del mercado, para el badge de la derecha. */
  exchange: string;
  category: Category;
}

type Category = "crypto" | "index" | "stock" | "forex" | "other";

const CATEGORIES: { key: Category | "all"; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "crypto", label: "Crypto" },
  { key: "index", label: "Índices" },
  { key: "stock", label: "Acciones" },
  { key: "forex", label: "Forex" },
];

const RECENTS_KEY = "ether-recent-symbols";
const MAX_RECENTS = 8;

function loadRecents(): SymbolResult[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as SymbolResult[]) : [];
  } catch {
    return [];
  }
}

function saveRecent(r: SymbolResult) {
  try {
    const next = [r, ...loadRecents().filter((x) => x.symbol !== r.symbol)].slice(
      0,
      MAX_RECENTS,
    );
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // localStorage lleno o bloqueado: los recientes son un lujo, no rompen nada.
  }
}

/** Yahoo devuelve `quoteType` en inglés; lo mapeamos a nuestras categorías. */
function categoryOf(quoteType: string | undefined): Category {
  switch ((quoteType ?? "").toUpperCase()) {
    case "INDEX":
      return "index";
    case "EQUITY":
    case "ETF":
      return "stock";
    case "CURRENCY":
      return "forex";
    case "CRYPTOCURRENCY":
      return "crypto";
    default:
      return "other";
  }
}

interface YahooQuoteHit {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchDisp?: string;
  quoteType?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (result: SymbolResult) => void;
}

export function SymbolSearchModal({ open, onOpenChange, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [binance, setBinance] = useState<string[]>([]);
  const [yahoo, setYahoo] = useState<SymbolResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [recents, setRecents] = useState<SymbolResult[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Al abrir: foco en el input, estado limpio y recientes frescos.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCategory("all");
    setYahoo([]);
    setCursor(0);
    setRecents(loadRecents());
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  // La lista de pares de Binance ya viene cacheada en memoria tras la primera
  // vez, así que pedirla al abrir no cuesta nada.
  useEffect(() => {
    if (!open || binance.length > 0) return;
    fetchExchangeSymbols("spot")
      .then((syms) => setBinance(syms.map((s) => s.symbol)))
      .catch(() => setBinance([]));
  }, [open, binance.length]);

  // Yahoo con debounce: sin esto se dispara una request por tecla.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setYahoo([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/yahoo/search?q=${encodeURIComponent(q)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((json: { quotes?: YahooQuoteHit[] }) => {
          setYahoo(
            (json.quotes ?? [])
              .filter((h): h is YahooQuoteHit & { symbol: string } => !!h.symbol)
              .map((h) => ({
                symbol: h.symbol,
                name: h.longname ?? h.shortname ?? h.symbol,
                provider: "yahoo" as const,
                exchange: h.exchDisp ?? "Yahoo",
                category: categoryOf(h.quoteType),
              })),
          );
        })
        .catch(() => setYahoo([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, open]);

  const results = useMemo<SymbolResult[]>(() => {
    const q = query.trim().toUpperCase();
    if (!q) return recents;

    const cryptoHits: SymbolResult[] = binance
      .filter((s) => s.includes(q))
      // Los que EMPIEZAN con lo escrito van primero: buscar "btc" debe poner
      // BTCUSDT arriba, no WBTCUSDT.
      .sort((a, b) => {
        const ap = a.startsWith(q) ? 0 : 1;
        const bp = b.startsWith(q) ? 0 : 1;
        return ap - bp || a.length - b.length || a.localeCompare(b);
      })
      .slice(0, 12)
      .map((s) => ({
        symbol: s,
        name: s.replace(/USDT$/, " / USDT"),
        provider: "binance" as const,
        exchange: "Binance",
        category: "crypto" as const,
      }));

    const all = [...cryptoHits, ...yahoo];
    return category === "all" ? all : all.filter((r) => r.category === category);
  }, [query, binance, yahoo, category, recents]);

  // Si la lista se acorta, el cursor no puede quedar apuntando a la nada.
  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, results.length - 1)));
  }, [results.length]);

  const choose = useCallback(
    (r: SymbolResult) => {
      saveRecent(r);
      onSelect(r);
      onOpenChange(false);
    },
    [onSelect, onOpenChange],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[cursor];
      if (hit) choose(hit);
    }
  };

  // Mantener la fila seleccionada a la vista cuando se navega con el teclado.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[10vh]"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="flex max-h-[70vh] w-[min(560px,92vw)] flex-col overflow-hidden rounded-lg border border-tv-border bg-tv-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 border-b border-tv-border px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-tv-text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            placeholder="Buscar símbolo — btc, nasdaq, aapl, eurusd…"
            className="flex-1 bg-transparent text-sm text-tv-text outline-none placeholder:text-tv-text-muted"
          />
          <button
            onClick={() => onOpenChange(false)}
            aria-label="Cerrar"
            className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-tv-border px-3 py-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={cn(
                "rounded px-2 py-0.5 text-[11px]",
                category === c.key
                  ? "bg-tv-blue/15 text-tv-blue"
                  : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto">
          {!query.trim() && recents.length > 0 && (
            <div className="px-3 pt-2 text-[9px] font-semibold uppercase tracking-wider text-tv-text-muted">
              Recientes
            </div>
          )}
          {results.length === 0 && (
            <div className="px-3 py-6 text-center text-[12px] text-tv-text-muted">
              {loading
                ? "Buscando…"
                : query.trim()
                  ? "Sin resultados."
                  : "Escribí para buscar un símbolo."}
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.provider}:${r.symbol}`}
              data-idx={i}
              onMouseEnter={() => setCursor(i)}
              onClick={() => choose(r)}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-1.5 text-left",
                i === cursor ? "bg-tv-blue/10" : "hover:bg-tv-panel-hover",
              )}
            >
              <span className="w-28 shrink-0 truncate font-mono text-[12px] font-semibold text-tv-text">
                {r.symbol}
              </span>
              <span className="flex-1 truncate text-[11px] text-tv-text-muted">
                {r.name}
              </span>
              <span className="shrink-0 rounded bg-tv-bg/60 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-tv-text-muted">
                {r.exchange}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-tv-border px-3 py-1.5 text-[10px] text-tv-text-muted">
          <span>↑↓ navegar</span>
          <span>Enter elegir</span>
          <span>Esc cerrar</span>
        </div>
      </div>
    </div>
  );
}
