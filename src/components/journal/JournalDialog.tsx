"use client";

import { useState } from "react";
import { Book, Plus, Trash2, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChartStore } from "@/lib/store/chart-store";
import { getInstrument } from "@/lib/instruments";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function JournalDialog({ open, onOpenChange }: Props) {
  const symbol = useChartStore((s) => s.symbol);
  const journal = useChartStore((s) => s.journal);
  const addEntry = useChartStore((s) => s.addJournalEntry);
  const removeEntry = useChartStore((s) => s.removeJournalEntry);
  const updateEntry = useChartStore((s) => s.updateJournalEntry);

  const [side, setSide] = useState<"long" | "short">("long");
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [size, setSize] = useState("");
  const [notes, setNotes] = useState("");

  function submit() {
    const ep = parseFloat(entryPrice);
    if (!isFinite(ep) || ep <= 0) return;
    addEntry({
      symbol,
      side,
      entryPrice: ep,
      exitPrice: exitPrice ? parseFloat(exitPrice) : undefined,
      size: size ? parseFloat(size) : undefined,
      openedAt: Date.now(),
      closedAt: exitPrice ? Date.now() : undefined,
      notes: notes.trim() || undefined,
    });
    setEntryPrice("");
    setExitPrice("");
    setSize("");
    setNotes("");
  }

  function closeAt(id: string) {
    const price = window.prompt("Precio de salida:");
    if (!price) return;
    const p = parseFloat(price);
    if (!isFinite(p)) return;
    updateEntry(id, { exitPrice: p, closedAt: Date.now() });
  }

  function pnl(e: { side: "long" | "short"; entryPrice: number; exitPrice?: number; size?: number }): {
    abs: number;
    pct: number;
  } | null {
    if (e.exitPrice === undefined) return null;
    const move = e.side === "long" ? e.exitPrice - e.entryPrice : e.entryPrice - e.exitPrice;
    const pct = (move / e.entryPrice) * 100;
    const abs = e.size ? move * e.size : move;
    return { abs, pct };
  }

  // Stats
  const closed = journal.filter((j) => j.exitPrice !== undefined);
  const openTrades = journal.filter((j) => j.exitPrice === undefined);
  const totalPct = closed.reduce((acc, e) => acc + (pnl(e)?.pct ?? 0), 0);
  const wins = closed.filter((e) => (pnl(e)?.pct ?? 0) > 0).length;
  const winRate = closed.length ? (wins / closed.length) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="flex items-center justify-between gap-2 text-sm font-medium">
            <span className="flex items-center gap-2">
              <Book className="h-4 w-4" />
              Trading Journal
            </span>
            <span className="flex items-center gap-3 text-[10px] uppercase text-tv-text-muted">
              <span>{openTrades.length} abiertos</span>
              <span>{closed.length} cerrados</span>
              <span>Win rate: {winRate.toFixed(0)}%</span>
              <span className={totalPct >= 0 ? "text-tv-green" : "text-tv-red"}>
                Σ {totalPct >= 0 ? "+" : ""}
                {totalPct.toFixed(2)}%
              </span>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 border-b border-tv-border p-3">
          <div className="text-[11px] uppercase tracking-wider text-tv-text-muted">
            Nuevo trade en{" "}
            <span className="text-tv-text">{getInstrument(symbol).displayName}</span>
          </div>
          <div className="flex gap-2 rounded bg-tv-bg p-0.5">
            <button
              onClick={() => setSide("long")}
              className={cn(
                "flex-1 rounded py-1 text-xs",
                side === "long"
                  ? "bg-tv-green/20 text-tv-green"
                  : "text-tv-text-muted",
              )}
            >
              LONG
            </button>
            <button
              onClick={() => setSide("short")}
              className={cn(
                "flex-1 rounded py-1 text-xs",
                side === "short"
                  ? "bg-tv-red/20 text-tv-red"
                  : "text-tv-text-muted",
              )}
            >
              SHORT
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input
              type="number"
              step="any"
              placeholder="Entrada *"
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              className="bg-tv-bg"
            />
            <Input
              type="number"
              step="any"
              placeholder="Salida (opc)"
              value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)}
              className="bg-tv-bg"
            />
            <Input
              type="number"
              step="any"
              placeholder="Tamaño (opc)"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="bg-tv-bg"
            />
          </div>
          <Input
            placeholder="Setup / razón / observaciones"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="bg-tv-bg"
          />
          <button
            onClick={submit}
            disabled={!entryPrice}
            className="flex w-full items-center justify-center gap-1 rounded bg-tv-blue py-1.5 text-xs font-semibold text-white hover:bg-tv-blue/90 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Registrar trade
          </button>
        </div>

        <ScrollArea className="h-[400px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-tv-panel">
              <tr className="border-b border-tv-border text-[10px] uppercase text-tv-text-muted">
                <th className="px-3 py-1.5 text-left">Símbolo</th>
                <th className="px-3 py-1.5 text-left">Side</th>
                <th className="px-3 py-1.5 text-right">Entrada</th>
                <th className="px-3 py-1.5 text-right">Salida</th>
                <th className="px-3 py-1.5 text-right">PNL %</th>
                <th className="px-3 py-1.5 text-left">Notas</th>
                <th className="px-3 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {journal.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-tv-text-muted">
                    Sin trades registrados
                  </td>
                </tr>
              )}
              {journal
                .slice()
                .reverse()
                .map((e) => {
                  const p = pnl(e);
                  return (
                    <tr
                      key={e.id}
                      className="group border-b border-tv-border hover:bg-tv-panel-hover"
                    >
                      <td className="px-3 py-1.5 font-medium text-tv-text">
                        {getInstrument(e.symbol).displayName}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-1.5 font-semibold uppercase",
                          e.side === "long" ? "text-tv-green" : "text-tv-red",
                        )}
                      >
                        {e.side}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {e.entryPrice.toFixed(2)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {e.exitPrice !== undefined ? (
                          e.exitPrice.toFixed(2)
                        ) : (
                          <button
                            onClick={() => closeAt(e.id)}
                            className="text-tv-blue underline-offset-2 hover:underline"
                          >
                            cerrar
                          </button>
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right tabular-nums",
                          p && p.pct >= 0 ? "text-tv-green" : "text-tv-red",
                        )}
                      >
                        {p ? `${p.pct >= 0 ? "+" : ""}${p.pct.toFixed(2)}%` : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-tv-text-muted">
                        {e.notes ?? ""}
                      </td>
                      <td className="px-3 py-1.5">
                        <button
                          onClick={() => removeEntry(e.id)}
                          className="opacity-0 transition-opacity hover:text-tv-red group-hover:opacity-100"
                          aria-label="Borrar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
