"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Play } from "lucide-react";
import { useTestingStore } from "@/lib/store/testing-store";
import { getInstrument } from "@/lib/instruments";

interface Props {
  params: Promise<{ id: string }>;
}

function fmt(ms: number): string {
  return new Date(ms).toLocaleDateString("es-AR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SessionDetail({ params }: Props) {
  const { id } = use(params);
  const session = useTestingStore((s) => s.sessions.find((x) => x.id === id));

  if (!session) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Link
          href="/testing/sessions"
          className="inline-flex items-center gap-1 text-[12px] text-tv-text-muted hover:text-tv-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a sesiones
        </Link>
        <div className="mt-6 rounded-lg border border-tv-border p-6 text-center text-sm text-tv-text-muted">
          Esa sesión no existe (puede haberse borrado).
        </div>
      </div>
    );
  }

  const inst = getInstrument(session.symbol);
  const pnl = session.realizedPnL;
  const pnlClass = pnl > 0 ? "text-tv-green" : pnl < 0 ? "text-tv-red" : "text-tv-text";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <Link
        href="/testing/sessions"
        className="inline-flex w-fit items-center gap-1 text-[12px] text-tv-text-muted hover:text-tv-text"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver a sesiones
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-tv-text">{session.name}</h1>
          <p className="mt-1 text-[12px] text-tv-text-muted">
            {inst.displayName} · {session.timeframe} · {fmt(session.startDate)} – {fmt(session.endDate)}
          </p>
          {session.description && (
            <p className="mt-2 max-w-xl text-[13px] text-tv-text">{session.description}</p>
          )}
        </div>
        <Link
          href={`/testing/sessions/${session.id}/chart`}
          className="flex items-center gap-1.5 rounded-full bg-tv-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-tv-blue/90"
        >
          <Play className="h-4 w-4" fill="currentColor" />
          Abrir chart
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Balance" value={money(session.currentBalance)} />
        <Stat
          label="PnL realizado"
          value={`${pnl >= 0 ? "+" : ""}${money(pnl)}`}
          className={pnlClass}
        />
        <Stat label="Trades" value={String(session.totalTrades)} />
        <Stat
          label="Win rate"
          value={
            session.totalTrades > 0
              ? `${((session.wins / session.totalTrades) * 100).toFixed(1)}%`
              : "—"
          }
        />
      </div>

      <section className="rounded-lg border border-dashed border-tv-border p-8 text-center">
        <p className="text-sm text-tv-text-muted">
          Equity curve, performance mensual/diaria, win rate por contexto y
          métricas avanzadas llegan en Wave 20.
        </p>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded-lg border border-tv-border bg-tv-panel/40 p-3">
      <div className="text-[11px] uppercase tracking-wider text-tv-text-muted">
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold ${className ?? "text-tv-text"}`}>
        {value}
      </div>
    </div>
  );
}
