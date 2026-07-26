"use client";

/**
 * Wave 19 — Panel inferior del chart de Testing con 3 tabs:
 * Open positions · Pending orders · Closed trades.
 *
 * Cada tab es una tabla con columnas relevantes y acciones (Close,
 * Cancel, ver Journal). Patrón visual: similar al BottomPanel del
 * chart en vivo, pero standalone (no usa el sistema de tabs global).
 */

import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, X } from "lucide-react";
import {
  useTestingStore,
  type Position,
  type Order,
  type Trade,
} from "@/lib/store/testing-store";
import { JournalDialog } from "./JournalDialog";
import { cn } from "@/lib/utils";

type Tab = "open" | "pending" | "closed";

interface Props {
  /** Precio actual para mostrar PnL no realizado live en posiciones. */
  lastPrice: number;
  /** Momento del replay. Los cierres se sellan con ESTE tiempo, no con el
   *  reloj: un cierre a mano durante el replay pasó en el momento del replay,
   *  y de ahí sale el agrupamiento por día de las analíticas y de §16. */
  currentTimeMs: number;
}

export function PositionsPanel({ lastPrice, currentTimeMs }: Props) {
  const detail = useTestingStore((s) => s.activeDetail);
  const closePosition = useTestingStore((s) => s.closePositionManual);
  const closePartial = useTestingStore((s) => s.closePositionPartial);
  const cancelOrder = useTestingStore((s) => s.cancelOrderById);
  const updateLevels = useTestingStore((s) => s.updatePositionLevels);
  const updateOrderLevels = useTestingStore((s) => s.updateOrderLevels);
  const [tab, setTab] = useState<Tab>("open");
  const [journalTrade, setJournalTrade] = useState<Trade | null>(null);

  const positions = detail?.positions ?? [];
  const orders = (detail?.orders ?? []).filter((o) => o.status === "pending");
  const trades = detail?.trades ?? [];
  const journals = detail?.journals ?? {};

  return (
    <div className="flex h-full flex-col bg-tv-panel/20">
      {/* Tabs */}
      <div className="flex items-center border-b border-tv-border">
        <TabBtn label="Open Positions" count={positions.length} active={tab === "open"} onClick={() => setTab("open")} />
        <TabBtn label="Pending Orders" count={orders.length} active={tab === "pending"} onClick={() => setTab("pending")} />
        <TabBtn label="Closed Positions" count={trades.length} active={tab === "closed"} onClick={() => setTab("closed")} />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {tab === "open" && (
          <OpenTable
            positions={positions}
            lastPrice={lastPrice}
            currentTimeMs={currentTimeMs}
            onClose={closePosition}
            onPartial={(id, fraction) => closePartial(id, fraction, lastPrice, currentTimeMs)}
            onBreakeven={(id, entry) => updateLevels(id, { sl: entry })}
            onEditLevels={(id, patch) => updateLevels(id, patch)}
          />
        )}
        {tab === "pending" && (
          <PendingTable
            orders={orders}
            onCancel={cancelOrder}
            onEditLevels={(id, patch) => updateOrderLevels(id, patch)}
          />
        )}
        {tab === "closed" && (
          <ClosedTable
            trades={trades}
            hasJournal={(id) => Boolean(journals[id])}
            onOpenJournal={(t) => setJournalTrade(t)}
          />
        )}
      </div>

      <JournalDialog
        open={journalTrade !== null}
        onOpenChange={(v) => !v && setJournalTrade(null)}
        trade={journalTrade}
      />
    </div>
  );
}

function TabBtn({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "border-b-2 px-3 py-1.5 text-[11px] font-medium",
        active
          ? "border-tv-blue text-tv-text"
          : "border-transparent text-tv-text-muted hover:text-tv-text",
      )}
    >
      {label}{" "}
      <span className="text-tv-text-muted">
        ({count})
      </span>
    </button>
  );
}

function OpenTable({
  positions,
  lastPrice,
  currentTimeMs,
  onClose,
  onPartial,
  onBreakeven,
  onEditLevels,
}: {
  positions: Position[];
  lastPrice: number;
  currentTimeMs: number;
  onClose: (id: string, closePrice: number, closedAt: number) => void;
  onPartial: (id: string, fraction: number) => void;
  onBreakeven: (id: string, entry: number) => void;
  onEditLevels: (id: string, patch: { sl?: number; tp?: number }) => void;
}) {
  if (positions.length === 0) {
    return <Empty msg="No hay posiciones abiertas." />;
  }
  return (
    <table className="w-full text-left text-[11px]">
      <thead className="bg-tv-bg/40 text-[10px] uppercase tracking-wider text-tv-text-muted">
        <tr>
          <Th>Side</Th>
          <Th>Size</Th>
          <Th>Entry</Th>
          <Th>SL</Th>
          <Th>TP</Th>
          <Th>Current</Th>
          <Th>Unrealized</Th>
          <Th>Opened</Th>
          <Th />
        </tr>
      </thead>
      <tbody>
        {positions.map((p) => {
          const dir = p.side === "buy" ? 1 : -1;
          const upnl = (lastPrice - p.entry) * p.size * dir;
          return (
            <tr key={p.id} className="border-t border-tv-border/40 hover:bg-tv-panel-hover/30">
              <Td>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium",
                    p.side === "buy"
                      ? "bg-tv-green/15 text-tv-green"
                      : "bg-tv-red/15 text-tv-red",
                  )}
                >
                  {p.side === "buy" ? "Long" : "Short"}
                </span>
              </Td>
              <Td mono>{p.size}</Td>
              <Td mono>{p.entry.toFixed(2)}</Td>
              <Td>
                <EditableCell
                  value={p.sl}
                  onCommit={(sl) => onEditLevels(p.id, { sl })}
                  className="text-tv-red"
                />
              </Td>
              <Td>
                <EditableCell
                  value={p.tp}
                  onCommit={(tp) => onEditLevels(p.id, { tp })}
                  className="text-tv-green"
                />
              </Td>
              <Td mono>{lastPrice.toFixed(2)}</Td>
              <Td mono>
                <span className={upnl >= 0 ? "text-tv-green" : "text-tv-red"}>
                  {upnl >= 0 ? "+" : ""}${upnl.toFixed(2)}
                </span>
              </Td>
              <Td muted>{new Date(p.openedAt).toLocaleString()}</Td>
              <Td>
                <div className="flex items-center gap-1">
                  {/* §4 — BE manual. Sólo tiene sentido en ganancia: mover el
                      stop al entry estando en pérdida lo dispararía enseguida. */}
                  <button
                    onClick={() => onBreakeven(p.id, p.entry)}
                    disabled={upnl <= 0}
                    title={
                      upnl > 0
                        ? "Mover el stop al precio de entrada"
                        : "Disponible cuando el trade esté en ganancia"
                    }
                    className="rounded border border-tv-border px-2 py-0.5 text-[10px] text-tv-text-muted enabled:hover:bg-tv-panel-hover enabled:hover:text-tv-text disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    BE
                  </button>
                  {/* §6 — parciales. Cierran una fracción al último precio y
                      dejan el resto corriendo con el mismo SL/TP. */}
                  {([0.25, 0.5] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => onPartial(p.id, f)}
                      title={`Cerrar el ${f * 100}% de la posición al precio actual`}
                      className="rounded border border-tv-border px-2 py-0.5 text-[10px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
                    >
                      {f * 100}%
                    </button>
                  ))}
                  <button
                    onClick={() => onClose(p.id, lastPrice, currentTimeMs)}
                    className="rounded border border-tv-border px-2 py-0.5 text-[10px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
                  >
                    Close
                  </button>
                </div>
              </Td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PendingTable({
  orders,
  onCancel,
  onEditLevels,
}: {
  orders: Order[];
  onCancel: (id: string) => void;
  onEditLevels: (
    id: string,
    patch: { entryPrice?: number; sl?: number; tp?: number },
  ) => void;
}) {
  if (orders.length === 0) {
    return <Empty msg="No hay órdenes pendientes." />;
  }
  return (
    <table className="w-full text-left text-[11px]">
      <thead className="bg-tv-bg/40 text-[10px] uppercase tracking-wider text-tv-text-muted">
        <tr>
          <Th>Side</Th>
          <Th>Type</Th>
          <Th>Size</Th>
          <Th>Entry</Th>
          <Th>SL</Th>
          <Th>TP</Th>
          <Th>Created</Th>
          <Th>Tags</Th>
          <Th />
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id} className="border-t border-tv-border/40 hover:bg-tv-panel-hover/30">
            <Td>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium",
                  o.side === "buy"
                    ? "bg-tv-green/15 text-tv-green"
                    : "bg-tv-red/15 text-tv-red",
                )}
              >
                {o.side === "buy" ? "Buy" : "Sell"}
              </span>
            </Td>
            <Td>{o.type}</Td>
            <Td mono>{o.size}</Td>
            <Td>
              <EditableCell
                value={o.entryPrice}
                required
                onCommit={(entryPrice) =>
                  entryPrice !== undefined && onEditLevels(o.id, { entryPrice })
                }
                className="text-tv-yellow"
              />
            </Td>
            <Td>
              <EditableCell
                value={o.sl}
                onCommit={(sl) => onEditLevels(o.id, { sl })}
                className="text-tv-red"
              />
            </Td>
            <Td>
              <EditableCell
                value={o.tp}
                onCommit={(tp) => onEditLevels(o.id, { tp })}
                className="text-tv-green"
              />
            </Td>
            <Td muted>{new Date(o.createdAt).toLocaleString()}</Td>
            <Td muted>
              {o.tags.length > 0 ? o.tags.join(", ") : "—"}
            </Td>
            <Td>
              <button
                onClick={() => onCancel(o.id)}
                className="flex items-center gap-0.5 rounded border border-tv-border px-2 py-0.5 text-[10px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-red"
              >
                <X className="h-2.5 w-2.5" />
                Cancel
              </button>
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ClosedTable({
  trades,
  hasJournal,
  onOpenJournal,
}: {
  trades: Trade[];
  hasJournal: (id: string) => boolean;
  onOpenJournal: (t: Trade) => void;
}) {
  if (trades.length === 0) {
    return <Empty msg="Todavía no cerraste ningún trade." />;
  }
  // Last first
  const sorted = [...trades].sort((a, b) => b.closedAt - a.closedAt);
  return (
    <table className="w-full text-left text-[11px]">
      <thead className="bg-tv-bg/40 text-[10px] uppercase tracking-wider text-tv-text-muted">
        <tr>
          <Th>Side</Th>
          <Th>Size</Th>
          <Th>Entry</Th>
          <Th>Close</Th>
          <Th>Reason</Th>
          <Th>R</Th>
          <Th>Realized</Th>
          <Th>Duration</Th>
          <Th>Tags</Th>
          <Th />
        </tr>
      </thead>
      <tbody>
        {sorted.map((t) => {
          const durMs = t.closedAt - t.openedAt;
          const durMin = Math.round(durMs / 60_000);
          const durLabel =
            durMin < 60
              ? `${durMin}m`
              : durMin < 60 * 24
                ? `${(durMin / 60).toFixed(1)}h`
                : `${(durMin / (60 * 24)).toFixed(1)}d`;
          return (
            <tr key={t.id} className="border-t border-tv-border/40 hover:bg-tv-panel-hover/30">
              <Td>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium",
                    t.side === "buy"
                      ? "bg-tv-green/15 text-tv-green"
                      : "bg-tv-red/15 text-tv-red",
                  )}
                >
                  {t.side === "buy" ? "Long" : "Short"}
                </span>
              </Td>
              <Td mono>{t.size}</Td>
              <Td mono>{t.entry.toFixed(2)}</Td>
              <Td mono>{t.closePrice.toFixed(2)}</Td>
              <Td>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px]",
                    t.closeReason === "tp"
                      ? "bg-tv-green/15 text-tv-green"
                      : t.closeReason === "sl"
                        ? "bg-tv-red/15 text-tv-red"
                        : // §6 — el parcial se distingue del cierre total:
                          // la posición puede seguir abierta.
                          t.closeReason === "partial"
                          ? "bg-tv-blue/15 text-tv-blue"
                          : "bg-tv-panel text-tv-text-muted",
                  )}
                >
                  {t.closeReason.toUpperCase()}
                </span>
              </Td>
              <Td mono>
                {t.rMultiple !== undefined ? (
                  <span className={t.rMultiple >= 0 ? "text-tv-green" : "text-tv-red"}>
                    {t.rMultiple >= 0 ? "+" : ""}{t.rMultiple.toFixed(2)}R
                  </span>
                ) : (
                  "—"
                )}
              </Td>
              <Td mono>
                <span className={t.realizedPnL >= 0 ? "text-tv-green" : "text-tv-red"}>
                  {t.realizedPnL >= 0 ? "+" : ""}${t.realizedPnL.toFixed(2)}
                </span>
              </Td>
              <Td muted mono>{durLabel}</Td>
              <Td muted>{t.tags.length > 0 ? t.tags.join(", ") : "—"}</Td>
              <Td>
                <button
                  onClick={() => onOpenJournal(t)}
                  className={cn(
                    "flex items-center gap-0.5 rounded border px-2 py-0.5 text-[10px]",
                    hasJournal(t.id)
                      ? "border-tv-blue/40 bg-tv-blue/10 text-tv-blue hover:bg-tv-blue/20"
                      : "border-tv-border text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
                  )}
                  title={hasJournal(t.id) ? "Editar journal" : "Crear journal"}
                >
                  {hasJournal(t.id) ? (
                    <BookmarkCheck className="h-2.5 w-2.5" />
                  ) : (
                    <Bookmark className="h-2.5 w-2.5" />
                  )}
                  Journal
                </button>
              </Td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * §7 — celda de precio editable in-place. Click para editar, Enter o blur
 * para confirmar, Escape para descartar.
 *
 * Vaciarla borra el nivel (útil para sacar un TP), salvo que sea obligatoria
 * — el precio de entrada de una orden pendiente no puede quedar vacío.
 * Un valor no numérico se descarta en silencio y vuelve al anterior.
 */
function EditableCell({
  value,
  onCommit,
  required = false,
  className,
}: {
  value: number | undefined;
  onCommit: (next: number | undefined) => void;
  required?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  function start() {
    setDraft(value !== undefined ? String(value) : "");
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const raw = draft.trim();
    if (raw === "") {
      // Vaciar quita el nivel; si es obligatorio, se descarta el cambio.
      if (!required && value !== undefined) onCommit(undefined);
      return;
    }
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) return; // inválido → revertir
    if (n !== value) onCommit(n);
  }

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (!editing) {
    return (
      <button
        onClick={start}
        title="Click para editar"
        className={cn(
          "-mx-1 rounded px-1 text-left font-mono hover:bg-tv-panel-hover hover:text-tv-text",
          value === undefined && "text-tv-text-muted",
          className,
        )}
      >
        {value !== undefined ? value.toFixed(2) : "—"}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      type="number"
      step="any"
      value={draft}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setEditing(false); // descartar
        }
        // No dejar que los atajos globales del replay se disparen al tipear.
        e.stopPropagation();
      }}
      className="w-20 rounded border border-tv-blue bg-tv-bg px-1 py-0.5 font-mono text-[11px] text-tv-text"
    />
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-3 py-1.5 font-medium">{children}</th>;
}

function Td({
  children,
  mono,
  muted,
}: {
  children?: React.ReactNode;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-3 py-1.5",
        mono && "font-mono",
        muted && "text-tv-text-muted",
      )}
    >
      {children}
    </td>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="grid h-full place-items-center p-6 text-[12px] text-tv-text-muted">
      {msg}
    </div>
  );
}
