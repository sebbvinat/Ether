"use client";

/**
 * Wave 22 — Analytics agregada cross-session.
 *
 * Tres tabs: Performance · Drawdown · Simulation.
 *
 * Performance: KPIs sobre todos los trades (con filtros) + breakdowns por
 * mes/día/sesión/símbolo. Reusa cómputos de `lib/testing/metrics.ts`.
 *
 * Drawdown: equity drawdown chart + max DD stats.
 *
 * Simulation: Montecarlo simulator con inputs editables, renderiza un
 * fan-chart con las N simulaciones superpuestas.
 */

import { useEffect, useMemo, useState } from "react";
import { useTestingStore } from "@/lib/store/testing-store";
import {
  loadAllTrades,
  filterTrades,
  uniqueSymbols,
  uniqueTags,
  type AnalyticsFilters,
  type EnrichedTrade,
} from "@/lib/testing/aggregate";
import {
  computeKPIs,
  equityCurve,
  performanceByMonth,
  performanceByWeekday,
  performanceByHour,
  performanceBySession,
} from "@/lib/testing/metrics";
import { runMontecarlo } from "@/lib/testing/montecarlo";
import { EquityCurve } from "@/components/testing/EquityCurve";
import { cn } from "@/lib/utils";

type Tab = "performance" | "drawdown" | "simulation";

export default function AnalyticsPage() {
  const sessions = useTestingStore((s) => s.sessions);
  const activeDetail = useTestingStore((s) => s.activeDetail);
  const activeId = useTestingStore((s) => s.activeSessionId);
  const [allTrades, setAllTrades] = useState<EnrichedTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("performance");
  const [filters, setFilters] = useState<AnalyticsFilters>({});

  useEffect(() => {
    const cache = activeId && activeDetail ? { [activeId]: activeDetail } : {};
    setLoading(true);
    loadAllTrades(sessions, cache).then((trades) => {
      setAllTrades(trades);
      setLoading(false);
    });
  }, [sessions, activeDetail, activeId]);

  const filtered = useMemo(() => filterTrades(allTrades, filters), [allTrades, filters]);
  const symbols = useMemo(() => uniqueSymbols(allTrades), [allTrades]);
  const tags = useMemo(() => uniqueTags(allTrades), [allTrades]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <div className="grid h-[400px] place-items-center text-[12px] text-tv-text-muted">
          Cargando datos de todas las sesiones…
        </div>
      </div>
    );
  }

  if (allTrades.length === 0) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <h1 className="text-2xl font-semibold text-tv-text">Analytics</h1>
        <div className="mt-6 grid h-[300px] place-items-center rounded-lg border border-dashed border-tv-border bg-tv-panel/20 text-center text-sm text-tv-text-muted">
          Todavía no cerraste ningún trade en ninguna sesión.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-tv-text">Analytics</h1>
          <p className="mt-1 text-[12px] text-tv-text-muted">
            {filtered.length} de {allTrades.length} trades · {sessions.length} sesiones
          </p>
        </div>
        <div className="flex gap-1 rounded border border-tv-border p-0.5">
          {(["performance", "drawdown", "simulation"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded px-3 py-1 text-[11px] font-medium",
                tab === t
                  ? "bg-tv-blue text-white"
                  : "text-tv-text-muted hover:text-tv-text",
              )}
            >
              {t === "performance" ? "Performance" : t === "drawdown" ? "Drawdown" : "Simulation"}
            </button>
          ))}
        </div>
      </header>

      <Filters
        filters={filters}
        setFilters={setFilters}
        sessions={sessions.map((s) => ({ id: s.id, name: s.name }))}
        symbols={symbols}
        tags={tags}
      />

      <div className="mt-4">
        {tab === "performance" && <PerformanceTab trades={filtered} />}
        {tab === "drawdown" && <DrawdownTab trades={filtered} />}
        {tab === "simulation" && <SimulationTab trades={filtered} />}
      </div>
    </div>
  );
}

// ─── Filters ─────────────────────────────────────────────────────────────────

function Filters({
  filters,
  setFilters,
  sessions,
  symbols,
  tags,
}: {
  filters: AnalyticsFilters;
  setFilters: (f: AnalyticsFilters) => void;
  sessions: { id: string; name: string }[];
  symbols: string[];
  tags: string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-tv-border bg-tv-panel/40 p-2 text-[11px]">
      <Toggle
        label="Long"
        active={filters.sides?.includes("buy") ?? false}
        onToggle={() =>
          setFilters({
            ...filters,
            sides: filters.sides?.includes("buy")
              ? filters.sides.filter((s) => s !== "buy")
              : [...(filters.sides ?? []), "buy"],
          })
        }
        color="green"
      />
      <Toggle
        label="Short"
        active={filters.sides?.includes("sell") ?? false}
        onToggle={() =>
          setFilters({
            ...filters,
            sides: filters.sides?.includes("sell")
              ? filters.sides.filter((s) => s !== "sell")
              : [...(filters.sides ?? []), "sell"],
          })
        }
        color="red"
      />
      <div className="mx-1 h-4 w-px bg-tv-border" />
      <Toggle
        label="Wins"
        active={filters.outcomes?.includes("win") ?? false}
        onToggle={() =>
          setFilters({
            ...filters,
            outcomes: filters.outcomes?.includes("win")
              ? filters.outcomes.filter((s) => s !== "win")
              : [...(filters.outcomes ?? []), "win"],
          })
        }
        color="green"
      />
      <Toggle
        label="Losses"
        active={filters.outcomes?.includes("loss") ?? false}
        onToggle={() =>
          setFilters({
            ...filters,
            outcomes: filters.outcomes?.includes("loss")
              ? filters.outcomes.filter((s) => s !== "loss")
              : [...(filters.outcomes ?? []), "loss"],
          })
        }
        color="red"
      />
      <div className="mx-1 h-4 w-px bg-tv-border" />
      {symbols.length > 1 && (
        <SelectFilter
          label="Símbolo"
          options={symbols}
          selected={filters.symbols ?? []}
          onChange={(arr) => setFilters({ ...filters, symbols: arr.length ? arr : undefined })}
        />
      )}
      {sessions.length > 1 && (
        <SelectFilter
          label="Sesión"
          options={sessions.map((s) => s.id)}
          labelMap={Object.fromEntries(sessions.map((s) => [s.id, s.name]))}
          selected={filters.sessions ?? []}
          onChange={(arr) => setFilters({ ...filters, sessions: arr.length ? arr : undefined })}
        />
      )}
      {tags.length > 0 && (
        <SelectFilter
          label="Tags"
          options={tags}
          selected={filters.tags ?? []}
          onChange={(arr) => setFilters({ ...filters, tags: arr.length ? arr : undefined })}
        />
      )}
      <button
        onClick={() => setFilters({})}
        className="ml-auto rounded border border-tv-border px-2 py-1 text-[10px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        Limpiar filtros
      </button>
    </div>
  );
}

function Toggle({
  label,
  active,
  onToggle,
  color,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
  color: "green" | "red";
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "rounded px-2 py-0.5",
        active
          ? color === "green"
            ? "bg-tv-green/15 text-tv-green"
            : "bg-tv-red/15 text-tv-red"
          : "text-tv-text-muted hover:text-tv-text",
      )}
    >
      {label}
    </button>
  );
}

function SelectFilter({
  label,
  options,
  selected,
  onChange,
  labelMap,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  labelMap?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "rounded border border-tv-border px-2 py-0.5",
          selected.length > 0
            ? "bg-tv-blue/15 text-tv-blue"
            : "text-tv-text-muted hover:text-tv-text",
        )}
      >
        {label} {selected.length > 0 && `(${selected.length})`}
      </button>
      {open && (
        <>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10"
          />
          <div className="absolute left-0 top-full z-20 mt-1 max-h-60 min-w-[140px] overflow-auto rounded border border-tv-border bg-tv-panel py-1 shadow-lg">
            {options.map((opt) => (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-2 px-2 py-1 text-[11px] hover:bg-tv-panel-hover"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => {
                    if (selected.includes(opt)) {
                      onChange(selected.filter((x) => x !== opt));
                    } else {
                      onChange([...selected, opt]);
                    }
                  }}
                />
                <span className="text-tv-text">{labelMap?.[opt] ?? opt}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Performance Tab ─────────────────────────────────────────────────────────

function PerformanceTab({ trades }: { trades: EnrichedTrade[] }) {
  const initial = 100_000; // assumimos balance ficticio para equity curve agregada
  const kpis = computeKPIs(trades, initial);
  const eq = equityCurve(trades, initial);
  const monthly = performanceByMonth(trades);
  const weekday = performanceByWeekday(trades);
  const sessions = performanceBySession(trades);
  const byHour = performanceByHour(trades);

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
        <KPI label="Total PnL" value={`${kpis.totalRealized >= 0 ? "+" : ""}$${kpis.totalRealized.toFixed(2)}`} positive={kpis.totalRealized >= 0} />
        <KPI label="Win rate" value={`${kpis.winRate.toFixed(1)}%`} />
        <KPI label="Trades" value={`${kpis.totalTrades}`} />
        <KPI label="Profit factor" value={!Number.isFinite(kpis.profitFactor) ? "∞" : kpis.profitFactor.toFixed(2)} />
        <KPI label="Expectancy" value={`${kpis.expectancy >= 0 ? "+" : ""}$${kpis.expectancy.toFixed(2)}`} positive={kpis.expectancy >= 0} />
        <KPI label="Avg RR" value={kpis.avgRR > 0 ? `${kpis.avgRR.toFixed(2)}R` : "—"} />
      </div>

      {/* Equity curve */}
      <Section title="Equity curve">
        <div className="h-[200px]">
          <EquityCurve points={eq} initialBalance={initial} width={1100} height={200} />
        </div>
      </Section>

      {/* Bars: monthly + weekday */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Section title="Performance por mes">
          <BarsChart
            data={monthly.map((m) => ({
              label: m.yearMonth,
              value: m.totalPnL,
              hint: `${m.totalTrades} trades · ${m.winRate.toFixed(0)}% win`,
            }))}
          />
        </Section>
        <Section title="Performance por día">
          <BarsChart
            data={weekday.map((w) => ({
              label: w.weekdayLabel,
              value: w.totalPnL,
              hint: `${w.totalTrades} trades · ${w.winRate.toFixed(0)}% win`,
            }))}
          />
        </Section>
      </div>

      {/* Hour heatmap */}
      <Section title="Performance por hora del día (local)">
        <HourBars data={byHour} />
      </Section>

      {/* Sessions cards */}
      <Section title="Performance por sesión de trading (NY time)">
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
                {s.totalPnL >= 0 ? "+" : ""}${s.totalPnL.toFixed(0)}
              </div>
              <div className="mt-0.5 text-[10px] text-tv-text-muted">
                {s.totalTrades} trades · {s.winRate.toFixed(0)}% win · {s.avgRR.toFixed(2)}R avg
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ─── Drawdown Tab ────────────────────────────────────────────────────────────

function DrawdownTab({ trades }: { trades: EnrichedTrade[] }) {
  const initial = 100_000;
  const kpis = computeKPIs(trades, initial);
  const eq = equityCurve(trades, initial);
  // Drawdown series: cuánto está debajo del peak en cada punto.
  let peak = -Infinity;
  const ddSeries: { time: number; dd: number; ddPct: number }[] = [];
  for (const p of eq) {
    if (p.equity > peak) peak = p.equity;
    const dd = peak - p.equity;
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
    ddSeries.push({ time: p.time, dd, ddPct });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <KPI label="Max DD ($)" value={`-$${kpis.maxDrawdown.toFixed(2)}`} positive={false} />
        <KPI label="Max DD (%)" value={`-${kpis.maxDrawdownPct.toFixed(2)}%`} positive={false} />
        <KPI label="Max W streak" value={`${kpis.maxConsecutiveWins}`} positive />
        <KPI label="Max L streak" value={`${kpis.maxConsecutiveLosses}`} positive={false} />
      </div>

      <Section title="Drawdown a lo largo del tiempo">
        <DrawdownChart series={ddSeries} />
      </Section>
    </div>
  );
}

function DrawdownChart({ series }: { series: { time: number; dd: number; ddPct: number }[] }) {
  if (series.length < 2) {
    return <div className="grid h-[200px] place-items-center text-[12px] text-tv-text-muted">Sin trades.</div>;
  }
  const maxDD = Math.max(...series.map((s) => s.dd), 1);
  const width = 1100;
  const height = 200;
  const padding = { top: 8, bottom: 18, left: 8, right: 8 };
  const w = width - padding.left - padding.right;
  const h = height - padding.top - padding.bottom;
  const xFor = (i: number) => padding.left + (i / (series.length - 1)) * w;
  const yFor = (dd: number) => padding.top + (dd / maxDD) * h;
  const path = `M ${xFor(0)},${padding.top} ${series.map((s, i) => `L ${xFor(i)},${yFor(s.dd)}`).join(" ")} L ${xFor(series.length - 1)},${padding.top} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
      <path d={path} fill="rgba(239,83,80,0.25)" />
      <polyline
        points={series.map((s, i) => `${xFor(i)},${yFor(s.dd)}`).join(" ")}
        fill="none"
        stroke="#ef5350"
        strokeWidth={1}
      />
    </svg>
  );
}

// ─── Simulation Tab ──────────────────────────────────────────────────────────

function SimulationTab({ trades }: { trades: EnrichedTrade[] }) {
  // Defaults: tomamos los stats actuales del set
  const kpis = computeKPIs(trades, 100_000);
  const [nSims, setNSims] = useState(100);
  const [tradesPer, setTradesPer] = useState(Math.max(50, trades.length));
  const [start, setStart] = useState(100000);
  const [avgGain, setAvgGain] = useState(Math.round(kpis.avgWin) || 200);
  const [avgLoss, setAvgLoss] = useState(Math.round(kpis.avgLoss) || 100);
  const [winRate, setWinRate] = useState(Math.round(kpis.winRate) || 50);
  const [result, setResult] = useState<ReturnType<typeof runMontecarlo> | null>(null);

  function handleRun() {
    setResult(
      runMontecarlo({
        nSimulations: nSims,
        tradesPerSim: tradesPer,
        startBalance: start,
        avgGain,
        avgLoss,
        winRate: winRate / 100,
      }),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Section title="Inputs Montecarlo">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <NumField label="N° simulaciones" value={nSims} onChange={setNSims} />
          <NumField label="Trades por sim" value={tradesPer} onChange={setTradesPer} />
          <NumField label="Balance inicial $" value={start} onChange={setStart} />
          <NumField label="Avg gain $" value={avgGain} onChange={setAvgGain} />
          <NumField label="Avg loss $" value={avgLoss} onChange={setAvgLoss} />
          <NumField label="Win rate %" value={winRate} onChange={setWinRate} />
        </div>
        <button
          onClick={handleRun}
          className="mt-3 rounded bg-tv-blue px-3 py-1.5 text-[11px] font-medium text-white hover:bg-tv-blue/90"
        >
          Correr {nSims} simulaciones
        </button>
      </Section>

      {result && (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <KPI label="Mediana" value={`$${result.median.toFixed(0)}`} />
            <KPI label="P10 (pesimista)" value={`$${result.p10.toFixed(0)}`} positive={result.p10 > start} />
            <KPI label="P90 (optimista)" value={`$${result.p90.toFixed(0)}`} positive={result.p90 > start} />
            <KPI label="Mejor" value={`$${result.best.toFixed(0)}`} positive />
            <KPI label="Prob. ganar" value={`${(result.probWin * 100).toFixed(1)}%`} />
          </div>
          <Section title={`Equity curves (${result.simulations.length} simulaciones)`}>
            <MontecarloChart sims={result.simulations} startBalance={start} />
          </Section>
        </>
      )}
    </div>
  );
}

function MontecarloChart({ sims, startBalance }: { sims: number[][]; startBalance: number }) {
  if (sims.length === 0) return null;
  const width = 1100;
  const height = 280;
  const padding = { top: 10, bottom: 18, left: 8, right: 8 };
  const w = width - padding.left - padding.right;
  const h = height - padding.top - padding.bottom;
  const flat = sims.flatMap((s) => s);
  const minBal = Math.min(...flat);
  const maxBal = Math.max(...flat);
  const range = Math.max(1, maxBal - minBal);
  const xFor = (i: number, len: number) => padding.left + (i / Math.max(1, len - 1)) * w;
  const yFor = (b: number) => padding.top + h - ((b - minBal) / range) * h;
  const yStart = yFor(startBalance);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
      {/* Baseline */}
      <line x1={padding.left} y1={yStart} x2={width - padding.right} y2={yStart} stroke="#787b86" strokeDasharray="2 3" strokeWidth={0.75} />
      {sims.map((s, i) => {
        const finalBal = s[s.length - 1];
        const isWin = finalBal >= startBalance;
        const color = isWin ? "rgba(38,166,154,0.18)" : "rgba(239,83,80,0.18)";
        const pts = s.map((b, j) => `${xFor(j, s.length)},${yFor(b)}`).join(" ");
        return <polyline key={i} points={pts} fill="none" stroke={color} strokeWidth={0.7} />;
      })}
    </svg>
  );
}

// ─── Reusable bits ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-tv-border bg-tv-panel/40 p-4">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-tv-text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function KPI({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-lg border border-tv-border bg-tv-panel/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-tv-text-muted">{label}</div>
      <div
        className={cn(
          "mt-1 font-mono text-base font-semibold",
          positive === true ? "text-tv-green" : positive === false ? "text-tv-red" : "text-tv-text",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="rounded border border-tv-border bg-tv-bg px-2 py-1 font-mono text-[12px] text-tv-text"
      />
    </label>
  );
}

function BarsChart({
  data,
}: {
  data: { label: string; value: number; hint: string }[];
}) {
  if (data.length === 0) {
    return <div className="grid h-[120px] place-items-center text-[12px] text-tv-text-muted">Sin datos.</div>;
  }
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <div className="flex flex-col gap-1">
      {data.map((d) => {
        const pct = (Math.abs(d.value) / max) * 100;
        const positive = d.value >= 0;
        return (
          <div key={d.label} className="flex items-center gap-2 text-[11px]">
            <span className="w-16 shrink-0 text-tv-text-muted">{d.label}</span>
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

function HourBars({
  data,
}: {
  data: { hour: number; totalPnL: number; totalTrades: number }[];
}) {
  const max = Math.max(...data.map((d) => Math.abs(d.totalPnL)), 1);
  return (
    <div className="flex h-[140px] items-end gap-0.5">
      {data.map((d) => {
        const pct = (Math.abs(d.totalPnL) / max) * 100;
        const positive = d.totalPnL >= 0;
        return (
          <div key={d.hour} className="flex flex-1 flex-col items-center gap-0.5">
            <div className="flex h-[120px] w-full items-end">
              <div
                className={cn(
                  "w-full",
                  positive ? "bg-tv-green/70" : "bg-tv-red/70",
                )}
                style={{ height: `${pct}%` }}
                title={`${d.hour}:00 — $${d.totalPnL.toFixed(0)} (${d.totalTrades} trades)`}
              />
            </div>
            <span className="font-mono text-[9px] text-tv-text-muted">
              {d.hour}
            </span>
          </div>
        );
      })}
    </div>
  );
}
