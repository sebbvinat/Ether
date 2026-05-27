"use client";

/**
 * Wave 19 — Panel inferior del chart de Testing con 3 tabs:
 * Open positions · Pending orders · Closed trades.
 *
 * Cada tab es una tabla con columnas relevantes y acciones (Close,
 * Cancel, ver Journal). Patrón visual: similar al BottomPanel del
 * chart en vivo, pero standalone (no usa el sistema de tabs global).
 */

import { useState } from "react";
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
}

export function PositionsPanel({ lastPrice }: Props) {
  const detail = useTestingStore((s) => s.activeDetail);
  const closePosition = useTestingStore((s) => s.closePositionManual);
  const cancelOrder = useTestingStore((s) => s.cancelOrderById);
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
        {tab === "open" && <OpenTable positions={positions} lastPrice={lastPrice} onClose={closePosition} />}
        {tab === "pending" && <PendingTable orders={orders} onCancel={cancelOrder} />}
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
  onClose,
}: {
  positions: Position[];
  lastPrice: number;
  onClose: (id: string, closePrice: number, closedAt: number) => void;
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
              <Td mono>{p.sl?.toFixed(2) ?? "—"}</Td>
              <Td mono>{p.tp?.toFixed(2) ?? "—"}</Td>
              <Td mono>{lastPrice.toFixed(2)}</Td>
              <Td mono>
                <span className={upnl >= 0 ? "text-tv-green" : "text-tv-red"}>
                  {upnl >= 0 ? "+" : ""}${upnl.toFixed(2)}
                </span>
              </Td>
              <Td muted>{new Date(p.openedAt).toLocaleString()}</Td>
              <Td>
                <button
                  onClick={() => onClose(p.id, lastPrice, Date.now())}
                  className="rounded border border-tv-border px-2 py-0.5 text-[10px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
                >
                  Close
                </button>
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
}: {
  orders: Order[];
  onCancel: (id: string) => void;
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
            <Td mono>{o.entryPrice.toFixed(2)}</Td>
            <Td mono>{o.sl?.toFixed(2) ?? "—"}</Td>
            <Td mono>{o.tp?.toFixed(2) ?? "—"}</Td>
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
