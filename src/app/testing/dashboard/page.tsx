"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trophy, FlameKindling } from "lucide-react";
import { useTestingStore } from "@/lib/store/testing-store";
import { SessionCard } from "@/components/testing/SessionCard";
import { NewSessionDialog } from "@/components/testing/NewSessionDialog";

function formatHrs(ms: number): string {
  const d = Math.floor(ms / (1000 * 60 * 60 * 24));
  const h = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (d > 0) return `${d}d ${h}h ${m}min`;
  return `${h}h ${m}min`;
}

export default function TestingDashboard() {
  const sessions = useTestingStore((s) => s.sessions);
  const deleteSession = useTestingStore((s) => s.deleteSession);
  const duplicateSession = useTestingStore((s) => s.duplicateSession);
  const renameSession = useTestingStore((s) => s.renameSession);
  const router = useRouter();
  const [newOpen, setNewOpen] = useState(false);

  const stats = useMemo(() => {
    const total = sessions.reduce(
      (acc, s) => ({
        totalTrades: acc.totalTrades + s.totalTrades,
        wins: acc.wins + s.wins,
        losses: acc.losses + s.losses,
        realizedPnL: acc.realizedPnL + s.realizedPnL,
      }),
      { totalTrades: 0, wins: 0, losses: 0, realizedPnL: 0 },
    );
    const winRate =
      total.totalTrades > 0 ? (total.wins / total.totalTrades) * 100 : 0;
    return { ...total, winRate };
  }, [sessions]);

  function handleRename(id: string) {
    const cur = sessions.find((s) => s.id === id);
    if (!cur) return;
    const name = window.prompt("Nuevo nombre:", cur.name);
    if (name && name.trim()) renameSession(id, name.trim());
  }
  async function handleDuplicate(id: string) {
    const cur = sessions.find((s) => s.id === id);
    if (!cur) return;
    const newName = window.prompt("Nombre de la copia:", `${cur.name} (copia)`);
    if (!newName) return;
    await duplicateSession(id, newName.trim());
  }
  async function handleDelete(id: string) {
    const cur = sessions.find((s) => s.id === id);
    if (!cur) return;
    if (
      !window.confirm(
        `¿Borrar "${cur.name}"? Se perderán los trades y journal de esta sesión.`,
      )
    )
      return;
    await deleteSession(id);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-tv-text">Testing</h1>
          <p className="text-[12px] text-tv-text-muted">
            Backtesting de estrategias con simulador de órdenes y journal.
          </p>
        </div>
        <button
          onClick={() => setNewOpen(true)}
          className="flex items-center gap-1.5 rounded-full bg-tv-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-tv-blue/90"
        >
          <Plus className="h-4 w-4" />
          Nueva sesión
        </button>
      </header>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Sesiones" value={String(sessions.length)} />
        <StatCard label="Trades totales" value={String(stats.totalTrades)} />
        <StatCard
          label="Win rate"
          value={`${stats.winRate.toFixed(1)}%`}
          icon={<Trophy className="h-4 w-4 text-tv-text-muted" />}
        />
        <StatCard
          label="PnL total"
          value={`${stats.realizedPnL >= 0 ? "+" : ""}$${stats.realizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          valueClass={
            stats.realizedPnL > 0
              ? "text-tv-green"
              : stats.realizedPnL < 0
                ? "text-tv-red"
                : "text-tv-text"
          }
          icon={<FlameKindling className="h-4 w-4 text-tv-text-muted" />}
        />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-tv-text">Sesiones recientes</h2>
        {sessions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-tv-border p-8 text-center">
            <p className="text-sm text-tv-text-muted">
              Aún no tenés sesiones de backtest. Creá la primera para empezar.
            </p>
            <button
              onClick={() => setNewOpen(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-tv-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-tv-blue/90"
            >
              <Plus className="h-4 w-4" />
              Crear sesión
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {sessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                onPlay={() => router.push(`/testing/sessions/${s.id}/chart`)}
                onRename={() => handleRename(s.id)}
                onDuplicate={() => handleDuplicate(s.id)}
                onDelete={() => handleDelete(s.id)}
              />
            ))}
          </div>
        )}
      </section>

      <NewSessionDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(id) => router.push(`/testing/sessions/${id}/chart`)}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  valueClass,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-tv-border bg-tv-panel/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-tv-text-muted">
          {label}
        </span>
        {icon}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${valueClass ?? "text-tv-text"}`}>
        {value}
      </div>
    </div>
  );
}
