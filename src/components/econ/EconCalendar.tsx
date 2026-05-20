"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

type Impact = "high" | "med" | "low";

type EconEvent = {
  time: string;
  country: string;
  flag: string;
  title: string;
  impact: Impact;
  forecast: string;
  previous: string;
  actual: string | null;
};

type TabId = "today" | "tomorrow" | "week";

const TABS: ReadonlyArray<readonly [TabId, string]> = [
  ["today", "Hoy"],
  ["tomorrow", "Mañana"],
  ["week", "Esta semana"],
];

// Economic calendar mock (ported from prototype data.jsx ECON_EVENTS)
const ECON_EVENTS: readonly EconEvent[] = [
  { time: "08:30", country: "US", flag: "🇺🇸", title: "Core CPI MoM", impact: "high", forecast: "0.3%", previous: "0.2%", actual: null },
  { time: "08:30", country: "US", flag: "🇺🇸", title: "Initial Jobless Claims", impact: "med", forecast: "230K", previous: "224K", actual: "227K" },
  { time: "10:00", country: "US", flag: "🇺🇸", title: "Existing Home Sales", impact: "med", forecast: "4.10M", previous: "4.15M", actual: null },
  { time: "13:00", country: "US", flag: "🇺🇸", title: "30-Year Bond Auction", impact: "low", forecast: "—", previous: "4.499%", actual: null },
  { time: "14:00", country: "US", flag: "🇺🇸", title: "FOMC Meeting Minutes", impact: "high", forecast: "—", previous: "—", actual: null },
  { time: "04:30", country: "UK", flag: "🇬🇧", title: "GDP QoQ Prelim", impact: "high", forecast: "0.4%", previous: "0.6%", actual: null },
  { time: "05:00", country: "EU", flag: "🇪🇺", title: "Industrial Production MoM", impact: "med", forecast: "0.2%", previous: "-0.1%", actual: null },
  { time: "19:50", country: "JP", flag: "🇯🇵", title: "PPI YoY", impact: "low", forecast: "2.5%", previous: "2.3%", actual: null },
  { time: "21:30", country: "AU", flag: "🇦🇺", title: "Employment Change", impact: "high", forecast: "25.0K", previous: "38.5K", actual: null },
];

const IMPACT_COLOR: Record<Impact, string> = {
  high: "bg-tv-red",
  med: "bg-tv-yellow",
  low: "bg-tv-green/60",
};

export function EconCalendar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const [tab, setTab] = useState<TabId>("today");

  return (
    <section className="flex h-full flex-col border-l border-tv-border bg-tv-panel text-tv-text">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-tv-border px-3 py-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          title={collapsed ? "Expandir" : "Contraer"}
          aria-label={collapsed ? "Expandir" : "Contraer"}
          className="flex h-5 w-5 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        <span className="text-xs font-medium tracking-wide">Calendario económico</span>
      </div>

      {!collapsed && (
        <>
          {/* Tabs */}
          <div className="flex border-b border-tv-border">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={
                  "flex-1 px-2 py-1.5 text-[11px] transition-colors " +
                  (tab === id
                    ? "border-b-2 border-tv-text text-tv-text"
                    : "border-b-2 border-transparent text-tv-text-muted hover:text-tv-text")
                }
              >
                {label}
              </button>
            ))}
          </div>

          {/* Rows */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {ECON_EVENTS.map((e, i) => (
              <div
                key={`${e.time}-${e.country}-${e.title}-${i}`}
                className="grid grid-cols-[38px_18px_1fr_4px] items-center gap-2 border-b border-tv-border/50 px-2 py-1.5"
              >
                <div className="font-mono text-[10px] text-tv-text-muted">{e.time}</div>
                <div className="text-sm leading-none">{e.flag}</div>
                <div className="min-w-0">
                  <div className="truncate text-[11px] text-tv-text">{e.title}</div>
                  <small className="block text-[10px] text-tv-text-muted">
                    <span className="font-mono">Prev. {e.forecast}</span>
                    {" · "}
                    <span className="font-mono">Ant. {e.previous}</span>
                    {e.actual ? (
                      <>
                        {" · "}
                        <span className="font-mono text-tv-text">Real {e.actual}</span>
                      </>
                    ) : null}
                  </small>
                </div>
                <div
                  className={"h-3.5 w-1 self-stretch justify-self-end " + IMPACT_COLOR[e.impact]}
                  title={
                    e.impact === "high"
                      ? "Impacto alto"
                      : e.impact === "med"
                        ? "Impacto medio"
                        : "Impacto bajo"
                  }
                />
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
