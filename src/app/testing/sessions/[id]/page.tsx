"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Play } from "lucide-react";
import { useTestingStore } from "@/lib/store/testing-store";
import { getInstrument } from "@/lib/instruments";
import { EquityCurve } from "@/components/testing/EquityCurve";
import type { SessionRules } from "@/lib/testing/rules";
import {
  computeKPIs,
  equityCurve,
  performanceByMonth,
  performanceByWeekday,
  performanceBySession,
} from "@/lib/testing/metrics";
import { cn } from "@/lib/utils";

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
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function durationLabel(ms: number): string {
  const min = ms / 60_000;
  if (min < 60) return `${Math.round(min)}m`;
  if (min < 60 * 24) return `${(min / 60).toFixed(1)}h`;
  return `${(min / (60 * 24)).toFixed(1)}d`;
}

export default function SessionDetail({ params }: Props) {
  const { id } = use(params);
  const session = useTestingStore((s) => s.sessions.find((x) => x.id === id));
  const detail = useTestingStore((s) => s.activeDetail);
  const activeId = useTestingStore((s) => s.activeSessionId);
  const setActive = useTestingStore((s) => s.setActiveSession);

  useEffect(() => {
    if (session && activeId !== session.id) {
      setActive(session.id);
    }
  }, [session, activeId, setActive]);

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
  const trades = detail?.trades ?? [];
  const kpis = computeKPIs(trades, session.initialBalance);
  const eqPoints = equityCurve(trades, session.initialBalance);
  const monthly = performanceByMonth(trades);
  const weekday = performanceByWeekday(trades);
  const sessions = performanceBySession(trades);

  const pnlClass =
    kpis.totalRealized > 0 ? "text-tv-green" : kpis.totalRealized < 0 ? "text-tv-red" : "text-tv-text";

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
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

      {/* KPIs row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Stat label="Balance" value={money(session.currentBalance)} />
        <Stat
          label="PnL realizado"
          value={`${kpis.totalRealized >= 0 ? "+" : ""}${money(kpis.totalRealized)}`}
          className={pnlClass}
        />
        <Stat label="Trades" value={String(kpis.totalTrades)} />
        <Stat
          label="Win rate"
          value={kpis.totalTrades > 0 ? `${kpis.winRate.toFixed(1)}%` : "—"}
        />
        <Stat
          label="Profit factor"
          value={
            !Number.isFinite(kpis.profitFactor)
              ? "∞"
              : kpis.profitFactor > 0
                ? kpis.profitFactor.toFixed(2)
                : "—"
          }
        />
        <Stat
          label="Expectancy"
          value={kpis.totalTrades > 0 ? `${kpis.expectancy >= 0 ? "+" : ""}${money(kpis.expectancy)}` : "—"}
          className={kpis.expectancy >= 0 ? "text-tv-green" : "text-tv-red"}
        />
      </div>

      {/* Equity curve + Métricas secundarias */}
      <div className="grid gap-3 lg:grid-cols-3">
        <section className="lg:col-span-2 rounded-lg border border-tv-border bg-tv-panel/40 p-4">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-tv-text-muted">
            Equity Curve
          </h2>
          <div className="h-[200px]">
            <EquityCurve
              points={eqPoints}
              initialBalance={session.initialBalance}
              width={800}
              height={200}
            />
          </div>
        </section>

        <section className="rounded-lg border border-tv-border bg-tv-panel/40 p-4">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-tv-text-muted">
            Más métricas
          </h2>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
            <Row label="Avg PnL" value={money(kpis.avgPnL)} className={kpis.avgPnL >= 0 ? "text-tv-green" : "text-tv-red"} />
            <Row label="Best win" value={`+${money(kpis.bestWin)}`} className="text-tv-green" />
            <Row label="Worst loss" value={money(kpis.worstLoss)} className="text-tv-red" />
            <Row label="Avg win" value={`+${money(kpis.avgWin)}`} className="text-tv-green" />
            <Row label="Avg loss" value={`-${money(kpis.avgLoss)}`} className="text-tv-red" />
            <Row label="Avg RR" value={kpis.avgRR > 0 ? `${kpis.avgRR.toFixed(2)}R` : "—"} />
            <Row label="Max RR" value={kpis.maxRR > 0 ? `${kpis.maxRR.toFixed(2)}R` : "—"} />
            <Row label="Max DD" value={`-${money(kpis.maxDrawdown)} (${kpis.maxDrawdownPct.toFixed(1)}%)`} className="text-tv-red" />
            <Row label="Max W streak" value={String(kpis.maxConsecutiveWins)} className="text-tv-green" />
            <Row label="Max L streak" value={String(kpis.maxConsecutiveLosses)} className="text-tv-red" />
            <Row label="Avg duration" value={kpis.avgDurationMs > 0 ? durationLabel(kpis.avgDurationMs) : "—"} />
            <Row label="Commission" value={money(kpis.totalCommission)} />
          </dl>
        </section>
      </div>

      {/* §16 — reglas diarias + checklist pre-trade */}
      <RulesEditor sessionId={id} />

      {/* Performance by month + Performance by weekday */}
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-lg border border-tv-border bg-tv-panel/40 p-4">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-tv-text-muted">
            Performance por mes
          </h2>
          {monthly.length === 0 ? (
            <p className="text-center text-[12px] text-tv-text-muted">Sin trades cerrados</p>
          ) : (
            <PerformanceBars
              data={monthly.map((m) => ({
                label: m.yearMonth,
                value: m.totalPnL,
                hint: `${m.totalTrades} trades · ${m.winRate.toFixed(0)}% win`,
              }))}
            />
          )}
        </section>
        <section className="rounded-lg border border-tv-border bg-tv-panel/40 p-4">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-tv-text-muted">
            Performance por día de la semana
          </h2>
          {weekday.every((w) => w.totalTrades === 0) ? (
            <p className="text-center text-[12px] text-tv-text-muted">Sin trades cerrados</p>
          ) : (
            <PerformanceBars
              data={weekday.map((w) => ({
                label: w.weekdayLabel,
                value: w.totalPnL,
                hint: `${w.totalTrades} trades · ${w.winRate.toFixed(0)}% win`,
              }))}
            />
          )}
        </section>
      </div>

      {/* Performance by session (Asia / London / NY / Out) */}
      <section className="rounded-lg border border-tv-border bg-tv-panel/40 p-4">
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-tv-text-muted">
          Performance por sesión de trading (NY time)
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {sessions.map((s) => (
            <div key={s.session} className="rounded border border-tv-border bg-tv-bg/30 p-3">
              <div className="text-[10px] uppercase tracking-wider text-tv-text-muted">
                {s.label}
              </div>
              <div
                className={cn(
                  "mt-1 font-mono text-lg",
                  s.totalPnL >= 0 ? "text-tv-green" : "text-tv-red",
                )}
              >
                {s.totalPnL >= 0 ? "+" : ""}
                {money(s.totalPnL)}
              </div>
              <div className="mt-0.5 text-[10px] text-tv-text-muted">
                {s.totalTrades} trades · {s.winRate.toFixed(0)}% win · {s.avgRR.toFixed(2)}R avg
              </div>
            </div>
          ))}
        </div>
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
      <div className="text-[10px] uppercase tracking-wider text-tv-text-muted">
        {label}
      </div>
      <div className={`mt-1 font-mono text-lg font-semibold ${className ?? "text-tv-text"}`}>
        {value}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <>
      <dt className="text-tv-text-muted">{label}</dt>
      <dd className={cn("text-right font-mono", className ?? "text-tv-text")}>
        {value}
      </dd>
    </>
  );
}

/** Bars verde/rojo horizontal. */
function PerformanceBars({
  data,
}: {
  data: { label: string; value: number; hint: string }[];
}) {
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <div className="flex flex-col gap-1">
      {data.map((d) => {
        const pct = (Math.abs(d.value) / max) * 100;
        const positive = d.value >= 0;
        return (
          <div key={d.label} className="flex items-center gap-2 text-[11px]">
            <span className="w-14 shrink-0 text-tv-text-muted">{d.label}</span>
            <div className="relative h-4 flex-1 overflow-hidden rounded bg-tv-bg/40">
              <div
                className={cn(
                  "absolute top-0 h-full",
                  positive ? "left-1/2 bg-tv-green/60" : "right-1/2 bg-tv-red/60",
                )}
                style={{ width: `${pct / 2}%` }}
              />
              <div className="absolute top-0 left-1/2 h-full w-px bg-tv-border" />
            </div>
            <span
              className={cn(
                "w-20 shrink-0 text-right font-mono",
                positive ? "text-tv-green" : "text-tv-red",
              )}
              title={d.hint}
            >
              {positive ? "+" : ""}${d.value.toFixed(0)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * §16 — editor de los límites diarios y del checklist pre-trade.
 *
 * Los límites se guardan en la meta (livianos, van a localStorage); el
 * checklist en el detail (IndexedDB), que es donde vive el resto del
 * contenido pesado de la sesión.
 */
function RulesEditor({ sessionId }: { sessionId: string }) {
  const session = useTestingStore((s) => s.sessions.find((x) => x.id === sessionId));
  const detail = useTestingStore((s) => s.activeDetail);
  const setRules = useTestingStore((s) => s.setSessionRules);
  const setChecklist = useTestingStore((s) => s.setChecklistTemplate);
  const setAutoShot = useTestingStore((s) => s.setAutoScreenshot);

  const saved = (detail?.checklistTemplate ?? []).join("\n");
  const [draft, setDraft] = useState(saved);
  // Si el detail termina de cargar (o cambia la sesión), reflejarlo.
  useEffect(() => setDraft(saved), [saved]);

  if (!session) return null;
  const rules = session.rules ?? {};

  const numField = (
    key: keyof SessionRules,
    label: string,
    hint: string,
  ) => (
    <label key={key} className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
        {label}
      </span>
      <input
        type="number"
        min={0}
        step="any"
        value={(rules[key] as number | undefined) ?? ""}
        placeholder="sin límite"
        onChange={(e) => {
          const v = e.target.value.trim();
          const n = parseFloat(v);
          setRules({ [key]: v === "" || !Number.isFinite(n) ? undefined : n });
        }}
        className="w-28 rounded border border-tv-border bg-tv-bg px-2 py-1 font-mono text-[11px] text-tv-text"
      />
      <span className="text-[9px] text-tv-text-dim">{hint}</span>
    </label>
  );

  return (
    <section className="rounded-lg border border-tv-border bg-tv-panel/40 p-4">
      <h2 className="mb-1 text-[12px] font-semibold uppercase tracking-wider text-tv-text-muted">
        Reglas del día
      </h2>
      <p className="mb-3 text-[11px] text-tv-text-muted">
        Se miden sobre el día del cursor de replay en horario de Nueva York, no
        sobre la fecha real. Al topar un límite se bloquean las órdenes nuevas;
        cerrar o ajustar lo abierto siempre se puede.
      </p>

      <div className="flex flex-wrap gap-4">
        {numField("maxTradesPerDay", "Máx trades / día", "vacío = sin tope")}
        {numField("maxDailyLoss", "Pérdida máx / día", "en positivo: 500 = −$500")}
        {numField("profitTarget", "Objetivo / día", "sólo avisa, no bloquea")}
      </div>

      <div className="mt-4 border-t border-tv-border pt-3">
        {/* F1 — capturas del chart en cada trade. */}
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-tv-text">
          <input
            type="checkbox"
            checked={session.autoScreenshot ?? true}
            onChange={(e) => setAutoShot(e.target.checked)}
            className="h-3.5 w-3.5 accent-tv-blue"
          />
          Guardar una captura del chart al entrar y al salir de cada trade
        </label>
        <p className="mb-2 ml-5 text-[10px] text-tv-text-dim">
          Se ven en el journal de cada trade. Pesan ~10-20 KB cada una.
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-tv-text">
          <input
            type="checkbox"
            checked={rules.enforceChecklist ?? false}
            onChange={(e) => setRules({ enforceChecklist: e.target.checked })}
            className="h-3.5 w-3.5 accent-tv-blue"
          />
          Exigir el checklist antes de cada orden
        </label>
        <div className="mt-2">
          <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
            Checklist (un item por línea)
          </span>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() =>
              void setChecklist(
                draft
                  .split("\n")
                  .map((l) => l.trim())
                  .filter(Boolean),
              )
            }
            rows={4}
            placeholder={"¿Está a favor de la tendencia de H4?\n¿El stop está en un nivel, no en un número redondo?\n¿El riesgo es el de siempre?"}
            className="mt-1 w-full rounded border border-tv-border bg-tv-bg px-2 py-1.5 text-[11px] text-tv-text"
          />
        </div>
      </div>
    </section>
  );
}
