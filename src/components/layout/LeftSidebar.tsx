"use client";

import {
  MousePointer2,
  Minus,
  TrendingUp,
  GitBranch,
  Square,
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
  hint?: string;
}

const TOOLS: ToolDef[] = [
  { key: "cursor", icon: MousePointer2, label: "Cursor" },
  { key: "hline", icon: Minus, label: "Línea horizontal" },
  { key: "trendline", icon: TrendingUp, label: "Línea de tendencia" },
  { key: "fib", icon: GitBranch, label: "Fibonacci" },
  { key: "rect", icon: Square, label: "Rectángulo" },
  { key: "text", icon: Type, label: "Texto" },
  { key: "measure", icon: Ruler, label: "Regla / Medir" },
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
        "z-30 flex w-11 flex-col items-center gap-0.5 border-r border-tv-border bg-tv-panel py-1.5",
        "md:relative md:translate-x-0",
        "fixed inset-y-0 left-0 transition-transform",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      )}
    >
      {TOOLS.map((t) => {
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
              "flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-tv-panel-hover",
              active
                ? "bg-tv-blue/15 text-tv-blue"
                : "text-tv-text-muted hover:text-tv-text",
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}

      <div className="my-1 h-px w-6 bg-tv-border" />

      <button
        onClick={() => clearDrawings(symbol)}
        aria-label="Borrar todos los dibujos"
        title="Borrar todos los dibujos de este símbolo"
        className="flex h-8 w-8 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-red"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </aside>
  );
}
