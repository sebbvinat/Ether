"use client";

import Link from "next/link";
import {
  Play,
  Pencil,
  BarChart3,
  Copy,
  Trash2,
  FileText,
} from "lucide-react";
import type { SessionMeta } from "@/lib/store/testing-store";
import { getInstrument } from "@/lib/instruments";
import { cn } from "@/lib/utils";

interface Props {
  session: SessionMeta;
  onPlay: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Card de sesión de backtest — fila estilo FXReplay.
 * Click sobre el play va al chart de la sesión; sobre el summary a su detalle.
 */
export function SessionCard({ session, onPlay, onRename, onDuplicate, onDelete }: Props) {
  const inst = getInstrument(session.symbol);
  const remaining = Math.max(0, session.replayTotal - session.replayIndex);
  const pct =
    session.replayTotal > 0
      ? Math.round((session.replayIndex / session.replayTotal) * 100)
      : 0;
  const pnl = session.realizedPnL;
  const pnlClass = pnl > 0 ? "text-tv-green" : pnl < 0 ? "text-tv-red" : "text-tv-text-muted";

  return (
    <div className="flex items-center justify-between rounded-lg border border-tv-border bg-tv-panel/40 px-4 py-3 hover:bg-tv-panel/60">
      <button
        onClick={onPlay}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-tv-blue text-white hover:bg-tv-blue/90"
        title="Abrir chart (sesión)"
      >
        <Play className="h-4 w-4" fill="currentColor" />
      </button>

      <div className="ml-4 min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-tv-text">
            {session.name}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-tv-text-muted">
          <span>
            {formatDate(session.startDate)} – {formatDate(session.endDate)}
          </span>
          <span>·</span>
          <span>{formatMoney(session.currentBalance)}</span>
          <span>·</span>
          <span className={pnlClass}>
            {pnl >= 0 ? "+" : ""}
            {formatMoney(pnl)}
          </span>
          <span>·</span>
          <span>{session.totalTrades} trades</span>
          {session.totalTrades > 0 && (
            <>
              <span>·</span>
              <span>
                {Math.round((session.wins / Math.max(1, session.totalTrades)) * 100)}% WR
              </span>
            </>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="rounded bg-tv-panel px-1.5 py-0.5 font-mono text-[10px] text-tv-text-muted">
            {inst.displayName}
          </span>
          <span className="rounded bg-tv-panel px-1.5 py-0.5 text-[10px] text-tv-text-muted">
            {session.timeframe}
          </span>
          {session.tags.map((t) => (
            <span
              key={t}
              className="rounded bg-tv-blue/15 px-1.5 py-0.5 text-[10px] text-tv-blue"
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="ml-4 hidden w-44 shrink-0 md:block">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-tv-panel">
          <div
            className="h-full bg-tv-green/70"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 text-right text-[10px] text-tv-text-muted">
          Quedan {remaining} velas
        </div>
      </div>

      <div className="ml-4 flex shrink-0 items-center gap-1">
        <ActionBtn title="Renombrar" onClick={onRename}>
          <Pencil className="h-3.5 w-3.5" />
        </ActionBtn>
        <Link
          href={`/testing/sessions/${session.id}`}
          className={cn(
            "grid h-7 w-7 place-items-center rounded text-tv-text-muted",
            "hover:bg-tv-panel-hover hover:text-tv-text",
          )}
          title="Resumen / analytics"
        >
          <BarChart3 className="h-3.5 w-3.5" />
        </Link>
        <Link
          href={`/testing/sessions/${session.id}#trades`}
          className={cn(
            "grid h-7 w-7 place-items-center rounded text-tv-text-muted",
            "hover:bg-tv-panel-hover hover:text-tv-text",
          )}
          title="Trades"
        >
          <FileText className="h-3.5 w-3.5" />
        </Link>
        <ActionBtn title="Duplicar" onClick={onDuplicate}>
          <Copy className="h-3.5 w-3.5" />
        </ActionBtn>
        <ActionBtn title="Borrar" onClick={onDelete} danger>
          <Trash2 className="h-3.5 w-3.5" />
        </ActionBtn>
      </div>
    </div>
  );
}

function ActionBtn({
  title,
  onClick,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "grid h-7 w-7 place-items-center rounded text-tv-text-muted",
        danger
          ? "hover:bg-tv-red/15 hover:text-tv-red"
          : "hover:bg-tv-panel-hover hover:text-tv-text",
      )}
    >
      {children}
    </button>
  );
}
