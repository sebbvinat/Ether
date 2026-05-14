"use client";

import {
  MousePointer2,
  Slash,
  ArrowRightFromLine,
  ArrowUpRight,
  Minus,
  MoveHorizontal,
  MoveVertical,
  GitBranch,
  TrendingUp,
  TrendingDown,
  Square,
  AlignHorizontalJustifyStart,
  Type,
  Ruler,
  Trash2,
} from "lucide-react";
import { useChartStore, type DrawingTool } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

interface ToolDef {
  key: DrawingTool;
  icon: typeof MousePointer2;
  label: string;
}

interface Group {
  label?: string;
  tools: ToolDef[];
}

// Grouped like TradingView's sidebar
const GROUPS: Group[] = [
  {
    tools: [{ key: "cursor", icon: MousePointer2, label: "Cursor" }],
  },
  {
    label: "Líneas",
    tools: [
      { key: "trendline", icon: Slash, label: "Línea de tendencia" },
      { key: "ray", icon: ArrowRightFromLine, label: "Rayo" },
      { key: "arrow", icon: ArrowUpRight, label: "Flecha" },
      { key: "hline", icon: Minus, label: "Línea horizontal" },
      {
        key: "hlineExt",
        icon: MoveHorizontal,
        label: "Horizontal extendida",
      },
      { key: "vline", icon: MoveVertical, label: "Línea vertical" },
    ],
  },
  {
    label: "Fibonacci",
    tools: [{ key: "fib", icon: GitBranch, label: "Fibonacci" }],
  },
  {
    label: "Posiciones",
    tools: [
      { key: "long", icon: TrendingUp, label: "Long position (R:R)" },
      { key: "short", icon: TrendingDown, label: "Short position (R:R)" },
    ],
  },
  {
    label: "Formas",
    tools: [
      { key: "rect", icon: Square, label: "Rectángulo" },
      {
        key: "hrange",
        icon: AlignHorizontalJustifyStart,
        label: "Rango de precio",
      },
    ],
  },
  {
    label: "Texto",
    tools: [{ key: "text", icon: Type, label: "Texto" }],
  },
  {
    label: "Medir",
    tools: [{ key: "measure", icon: Ruler, label: "Regla / Medir" }],
  },
];

export function LeftSidebar() {
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const clearDrawings = useChartStore((s) => s.clearDrawings);
  const symbol = useChartStore((s) => s.symbol);
  const mobileOpen = useChartStore((s) => s.mobileLeftOpen);
  const setMobileLeftOpen = useChartStore((s) => s.setMobileLeftOpen);

  return (
    <aside
      className={cn(
        "z-30 flex w-11 flex-col items-center border-r border-tv-border bg-tv-panel py-1",
        "md:relative md:translate-x-0",
        "fixed inset-y-0 left-0 transition-transform",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      )}
    >
      {GROUPS.map((group, gi) => (
        <div key={gi} className="flex w-full flex-col items-center">
          {gi > 0 && <div className="my-1 h-px w-6 bg-tv-border" />}
          {group.tools.map((t) => {
            const Icon = t.icon;
            const active = tool === t.key;
            return (
              <button
                key={t.key}
                onClick={() => {
                  setTool(t.key);
                  setMobileLeftOpen(false);
                }}
                aria-label={t.label}
                title={t.label}
                className={cn(
                  "group relative my-0.5 flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-tv-panel-hover",
                  active
                    ? "bg-tv-blue/15 text-tv-blue"
                    : "text-tv-text-muted hover:text-tv-text",
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
                {/* Tooltip on hover (desktop) */}
                <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded border border-tv-border bg-tv-panel px-2 py-1 text-[11px] text-tv-text opacity-0 shadow-lg transition-opacity group-hover:opacity-100 md:block">
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      ))}

      <div className="my-1 h-px w-6 bg-tv-border" />

      <button
        onClick={() => clearDrawings(symbol)}
        aria-label="Borrar todos los dibujos"
        title="Borrar todos los dibujos de este símbolo"
        className="group relative my-0.5 flex h-8 w-8 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-red"
      >
        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
        <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded border border-tv-border bg-tv-panel px-2 py-1 text-[11px] text-tv-text opacity-0 shadow-lg transition-opacity group-hover:opacity-100 md:block">
          Borrar dibujos
        </span>
      </button>
    </aside>
  );
}
