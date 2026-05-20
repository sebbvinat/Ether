"use client";

import { useEffect, useState } from "react";
import { Plus, X, MoreHorizontal, ChevronDown, ChevronRight } from "lucide-react";
import { subscribeQuotes } from "@/lib/data";
import { getInstrument } from "@/lib/instruments";
import { useChartStore } from "@/lib/store/chart-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatPrice, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Row {
  symbol: string;
  price: number;
  pct: number;
}

export function Watchlist() {
  const watchlists = useChartStore((s) => s.watchlists);
  const activeWatchlistId = useChartStore((s) => s.activeWatchlistId);
  const setActiveWatchlist = useChartStore((s) => s.setActiveWatchlist);
  const createWatchlist = useChartStore((s) => s.createWatchlist);
  const deleteWatchlist = useChartStore((s) => s.deleteWatchlist);
  const renameWatchlist = useChartStore((s) => s.renameWatchlist);
  const addSection = useChartStore((s) => s.addWatchlistSection);
  const renameSection = useChartStore((s) => s.renameWatchlistSection);
  const removeSection = useChartStore((s) => s.removeWatchlistSection);
  const watchlist = useChartStore((s) => s.watchlist);
  const symbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const removeFromWatchlist = useChartStore((s) => s.removeFromWatchlist);
  const openSymbolDialog = useChartStore((s) => s.setSymbolDialogOpen);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [flash, setFlash] = useState<Record<string, "up" | "down" | null>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const active = watchlists.find((w) => w.id === activeWatchlistId);
  const sections = active?.sections ?? [];

  // All symbols subscribed (flat + sections)
  const allSymbols = Array.from(
    new Set([...(watchlist ?? []), ...sections.flatMap((s) => s.symbols)]),
  );

  useEffect(() => {
    if (allSymbols.length === 0) {
      setRows({});
      return;
    }
    const unsub = subscribeQuotes(allSymbols, (tick) => {
      setRows((prev) => {
        const prevRow = prev[tick.symbol];
        if (prevRow) {
          if (tick.close > prevRow.price) {
            setFlash((f) => ({ ...f, [tick.symbol]: "up" }));
            setTimeout(
              () => setFlash((f) => ({ ...f, [tick.symbol]: null })),
              300,
            );
          } else if (tick.close < prevRow.price) {
            setFlash((f) => ({ ...f, [tick.symbol]: "down" }));
            setTimeout(
              () => setFlash((f) => ({ ...f, [tick.symbol]: null })),
              300,
            );
          }
        }
        return {
          ...prev,
          [tick.symbol]: {
            symbol: tick.symbol,
            price: tick.close,
            pct: tick.pct,
          },
        };
      });
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSymbols.join(",")]);

  function newWatchlist() {
    const name = window.prompt("Nombre de la nueva watchlist:");
    if (!name) return;
    createWatchlist(`wl-${Date.now()}`, name.trim());
  }

  function renameCurrent() {
    const current = watchlists.find((w) => w.id === activeWatchlistId);
    if (!current) return;
    const name = window.prompt("Nuevo nombre:", current.name);
    if (!name) return;
    renameWatchlist(activeWatchlistId, name.trim());
  }

  function deleteCurrent() {
    if (watchlists.length <= 1) {
      window.alert("No podés borrar la única watchlist");
      return;
    }
    const current = watchlists.find((w) => w.id === activeWatchlistId);
    if (!current) return;
    if (!window.confirm(`Borrar "${current.name}"?`)) return;
    deleteWatchlist(activeWatchlistId);
  }

  function newSection() {
    const name = window.prompt("Nombre de la sección (ej: Crypto, Stocks, FX):");
    if (!name || !name.trim()) return;
    addSection(name.trim());
  }

  function renameSectionPrompt(sectionId: string, currentName: string) {
    const name = window.prompt("Nuevo nombre:", currentName);
    if (!name || !name.trim()) return;
    renameSection(sectionId, name.trim());
  }

  function deleteSection(sectionId: string, name: string) {
    if (!window.confirm(`Borrar sección "${name}"?`)) return;
    removeSection(sectionId);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-tv-border px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-tv-text-muted">
          Watchlist
        </h2>
        <div className="relative flex items-center gap-1">
          <button
            onClick={() => openSymbolDialog(true)}
            className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
            title="Agregar símbolo"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
            aria-label="Más"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-10"
                aria-label="Cerrar"
              />
              <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded border border-tv-border bg-tv-panel p-1 shadow-lg">
                <MenuItem
                  label="Nueva sección"
                  onClick={() => {
                    setMenuOpen(false);
                    newSection();
                  }}
                />
                <div className="my-1 border-t border-tv-border" />
                <MenuItem
                  label="Nueva watchlist"
                  onClick={() => {
                    setMenuOpen(false);
                    newWatchlist();
                  }}
                />
                <MenuItem
                  label="Renombrar actual"
                  onClick={() => {
                    setMenuOpen(false);
                    renameCurrent();
                  }}
                />
                <MenuItem
                  label="Borrar actual"
                  onClick={() => {
                    setMenuOpen(false);
                    deleteCurrent();
                  }}
                  danger
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 overflow-x-auto border-b border-tv-border bg-tv-bg">
        {watchlists.map((w) => (
          <button
            key={w.id}
            onClick={() => setActiveWatchlist(w.id)}
            className={cn(
              "shrink-0 whitespace-nowrap border-b-2 px-3 py-1.5 text-[11px] font-medium",
              w.id === activeWatchlistId
                ? "border-tv-blue text-tv-text"
                : "border-transparent text-tv-text-muted hover:text-tv-text",
            )}
          >
            {w.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-tv-border px-3 py-1.5 text-[10px] uppercase tracking-wider text-tv-text-dim">
        <span>Símbolo</span>
        <span className="text-right">Precio</span>
        <span className="text-right">%</span>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          {/* Default section (flat watchlist) */}
          {(watchlist?.length ?? 0) > 0 && sections.length === 0 && (
            <SymbolList
              symbols={watchlist}
              rows={rows}
              flash={flash}
              activeSymbol={symbol}
              onPick={setSymbol}
              onRemove={removeFromWatchlist}
            />
          )}
          {(watchlist?.length ?? 0) > 0 && sections.length > 0 && (
            <SectionGroup
              label="(Sin sección)"
              symbols={watchlist}
              rows={rows}
              flash={flash}
              activeSymbol={symbol}
              onPick={setSymbol}
              onRemove={removeFromWatchlist}
              collapsed={!!collapsed["_default_"]}
              onToggle={() =>
                setCollapsed((c) => ({ ...c, _default_: !c._default_ }))
              }
            />
          )}
          {sections.map((sec) => (
            <SectionGroup
              key={sec.id}
              label={sec.name}
              symbols={sec.symbols}
              rows={rows}
              flash={flash}
              activeSymbol={symbol}
              onPick={setSymbol}
              onRemove={removeFromWatchlist}
              collapsed={!!collapsed[sec.id]}
              onToggle={() =>
                setCollapsed((c) => ({ ...c, [sec.id]: !c[sec.id] }))
              }
              onRename={() => renameSectionPrompt(sec.id, sec.name)}
              onDelete={() => deleteSection(sec.id, sec.name)}
            />
          ))}
          {allSymbols.length === 0 && (
            <div className="p-4 text-center text-xs text-tv-text-muted">
              Vacío. Tocá + para agregar símbolos.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function SectionGroup({
  label,
  symbols,
  rows,
  flash,
  activeSymbol,
  onPick,
  onRemove,
  collapsed,
  onToggle,
  onRename,
  onDelete,
}: {
  label: string;
  symbols: string[];
  rows: Record<string, Row>;
  flash: Record<string, "up" | "down" | null>;
  activeSymbol: string;
  onPick: (s: string) => void;
  onRemove: (s: string) => void;
  collapsed: boolean;
  onToggle: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  if (symbols.length === 0 && !onRename) return null;
  return (
    <div>
      <div className="group flex items-center justify-between border-b border-tv-border bg-tv-bg px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
        <button
          onClick={onToggle}
          className="flex items-center gap-1 hover:text-tv-text"
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          <span>
            {label} ({symbols.length})
          </span>
        </button>
        {(onRename || onDelete) && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {onRename && (
              <button
                onClick={onRename}
                className="rounded p-0.5 hover:text-tv-text"
                title="Renombrar sección"
              >
                ✏
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="rounded p-0.5 hover:text-tv-red"
                title="Borrar sección"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>
      {!collapsed && (
        <SymbolList
          symbols={symbols}
          rows={rows}
          flash={flash}
          activeSymbol={activeSymbol}
          onPick={onPick}
          onRemove={onRemove}
        />
      )}
    </div>
  );
}

function SymbolList({
  symbols,
  rows,
  flash,
  activeSymbol,
  onPick,
  onRemove,
}: {
  symbols: string[];
  rows: Record<string, Row>;
  flash: Record<string, "up" | "down" | null>;
  activeSymbol: string;
  onPick: (s: string) => void;
  onRemove: (s: string) => void;
}) {
  return (
    <>
      {symbols.map((s) => {
        const row = rows[s];
        const isActive = s === activeSymbol;
        const f = flash[s];
        const inst = getInstrument(s);
        const label =
          inst.type === "index" ? inst.displayName : s.replace("USDT", "");
        const tag = inst.type === "index" ? "IDX" : "USDT";
        return (
          <div
            key={s}
            onClick={() => onPick(s)}
            className={cn(
              "group grid cursor-pointer grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-1.5 text-xs transition-colors",
              "hover:bg-tv-panel-hover",
              isActive && "bg-tv-panel-hover",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-tv-text">{label}</span>
              <span className="text-[10px] text-tv-text-dim">{tag}</span>
            </div>
            <span
              className={cn(
                "text-right font-mono text-[11px] tabular-nums transition-colors",
                f === "up" && "text-tv-green",
                f === "down" && "text-tv-red",
                !f && "text-tv-text",
              )}
            >
              {row ? formatPrice(row.price) : "—"}
            </span>
            <div className="flex items-center justify-end gap-1">
              <span
                className={cn(
                  "font-mono text-[11px] tabular-nums",
                  row
                    ? row.pct >= 0
                      ? "text-tv-green"
                      : "text-tv-red"
                    : "text-tv-text-muted",
                )}
              >
                {row ? formatPct(row.pct) : "—"}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(s);
                }}
                className="invisible rounded p-0.5 text-tv-text-muted hover:bg-tv-bg hover:text-tv-red group-hover:visible"
                aria-label={`Quitar ${s}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full rounded px-2 py-1 text-left text-xs hover:bg-tv-panel-hover",
        danger ? "text-tv-red" : "text-tv-text",
      )}
    >
      {label}
    </button>
  );
}
