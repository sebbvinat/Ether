"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  CursorIcon,
  FibIcon,
  LongIcon,
  MagnetIcon,
  MeasureIcon,
  RectIcon,
  TextIcon,
  TrendlineIcon,
} from "@/components/icons/ToolIcons";
import { useChartStore, type DrawingTool } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

interface ToolDef {
  /** Stable id (matches prototype IDs) */
  id: string;
  /** Display glyph (text or unicode) */
  glyph: string;
  /** §15 — ícono SVG. Cuando falta se sigue usando `glyph`: la migración
   *  es incremental y no todas las tools tienen ícono todavía. */
  icon?: ToolIcon;
  /** Spanish label */
  label: string;
  /** Number of clicks required to place; "poly" for freehand. 0 = stateless action. */
  clicks: number | "poly";
  /** Production DrawingTool this maps to. Absent (for drawing kind) = not
   *  implemented yet. */
  storeKey?: DrawingTool;
  /** When set, this entry is a store toggle (no drawing), not a drawing tool. */
  toggleKey?: "magnetMode" | "lockDrawings" | "hideDrawings";
}

interface Group {
  id: string;
  glyph: string;
  /** §15 — ícono del botón del grupo. Ver ToolDef.icon. */
  icon?: ToolIcon;
  label: string;
  tools: ToolDef[];
}

/** Firma común de los íconos de ToolIcons. */
type ToolIcon = (props: { size?: number; className?: string }) => React.ReactElement;

// Group catalog — mirrors the prototype's TOOL_GROUPS (data.jsx:137-227).
// Tools without `storeKey` are visible but disabled ("próximamente").
const GROUPS: Group[] = [
  {
    id: "cursor",
    glyph: "✛",
    icon: CursorIcon,
    label: "Cursores",
    tools: [
      { id: "cursor", glyph: "✛", label: "Cruz", clicks: 0, storeKey: "cursor" },
      { id: "arrow", glyph: "↗", label: "Flecha / puntero", clicks: 0, storeKey: "arrow" },
      { id: "dot", glyph: "•", label: "Punto", clicks: 0 },
      { id: "eraser", glyph: "⌫", label: "Borrador — quitar dibujos", clicks: 0, storeKey: "eraser" },
    ],
  },
  {
    id: "lines",
    glyph: "╱",
    icon: TrendlineIcon,
    label: "Líneas",
    tools: [
      { id: "trend", glyph: "╱", label: "Línea de tendencia", clicks: 2, storeKey: "trendline" },
      { id: "hline", glyph: "─", label: "Línea horizontal", clicks: 1, storeKey: "hline" },
      { id: "vline", glyph: "│", label: "Línea vertical", clicks: 1, storeKey: "vline" },
      { id: "cross", glyph: "+", label: "Línea cruz (H+V)", clicks: 1, storeKey: "cross" },
      { id: "ray", glyph: "→", label: "Rayo (un lado extendido)", clicks: 2, storeKey: "ray" },
      { id: "xline", glyph: "↔", label: "Línea extendida (ambos lados)", clicks: 2, storeKey: "hlineExt" },
      { id: "channel", glyph: "║", label: "Canal paralelo", clicks: 3, storeKey: "channel" },
      { id: "trendangle", glyph: "∠", label: "Línea con ángulo", clicks: 2, storeKey: "trendangle" },
    ],
  },
  {
    id: "fib",
    glyph: "φ",
    icon: FibIcon,
    label: "Fibonacci & Gann",
    tools: [
      { id: "fibret", glyph: "φ", label: "Retroceso Fibonacci", clicks: 2, storeKey: "fib" },
      { id: "fibext", glyph: "φ+", label: "Extensión Fibonacci", clicks: 2, storeKey: "fibext" },
      { id: "fibarc", glyph: "◜", label: "Arco Fibonacci", clicks: 2, storeKey: "fibarc" },
      { id: "fibfan", glyph: "⧘", label: "Abanico Fibonacci", clicks: 2, storeKey: "fibfan" },
      { id: "pitch", glyph: "⧗", label: "Horquilla (pitchfork)", clicks: 3, storeKey: "pitch" },
      { id: "gannbox", glyph: "⊞", label: "Caja de Gann", clicks: 2, storeKey: "gannbox" },
      { id: "gannfan", glyph: "✻", label: "Abanico de Gann", clicks: 2, storeKey: "gannfan" },
    ],
  },
  {
    id: "patterns",
    glyph: "△",
    label: "Patrones",
    tools: [
      { id: "abcd", glyph: "AB", label: "Patrón ABCD", clicks: 4, storeKey: "abcd" },
      { id: "xabcd", glyph: "XA", label: "Patrón XABCD (armónico)", clicks: 5, storeKey: "xabcd" },
      { id: "elliott5", glyph: "1―5", label: "Onda Elliott (impulso 1―5)", clicks: 5, storeKey: "elliott5" },
      { id: "elliott3", glyph: "a―c", label: "Onda Elliott (corrección a―c)", clicks: 3, storeKey: "elliott3" },
      { id: "hs", glyph: "∧", label: "Hombro–cabeza–hombro", clicks: 5, storeKey: "hs" },
      { id: "triangle3", glyph: "▽", label: "Triángulo (3 puntos)", clicks: 3, storeKey: "triangle3" },
    ],
  },
  {
    id: "shapes",
    glyph: "▢",
    icon: RectIcon,
    label: "Formas",
    tools: [
      { id: "rect", glyph: "▢", label: "Rectángulo", clicks: 2, storeKey: "rect" },
      { id: "ellipse", glyph: "○", label: "Elipse", clicks: 2, storeKey: "ellipse" },
      { id: "triangle", glyph: "△", label: "Triángulo", clicks: 3, storeKey: "triangle" },
      { id: "brush", glyph: "✎", label: "Pincel (a mano alzada)", clicks: "poly", storeKey: "brush" },
    ],
  },
  {
    id: "positions",
    glyph: "⚖",
    icon: LongIcon,
    label: "Posiciones",
    tools: [
      { id: "long", glyph: "L", label: "Posición larga (LONG)", clicks: 3, storeKey: "long" },
      { id: "short", glyph: "S", label: "Posición corta (SHORT)", clicks: 3, storeKey: "short" },
    ],
  },
  {
    id: "measure",
    glyph: "⤢",
    icon: MeasureIcon,
    label: "Medir",
    tools: [
      { id: "measure", glyph: "⤢", label: "Regla (precio + tiempo)", clicks: 2, storeKey: "measure" },
      { id: "prange", glyph: "↕", label: "Rango de precio", clicks: 2, storeKey: "hrange" },
      { id: "trange", glyph: "↔", label: "Rango de fechas", clicks: 2, storeKey: "trange" },
      { id: "forecast", glyph: "⇄", label: "Proyección", clicks: 2, storeKey: "forecast" },
      { id: "cycle", glyph: "∿", label: "Líneas de ciclo", clicks: 2, storeKey: "cycle" },
      { id: "regression", glyph: "∷", label: "Canal de regresión lineal", clicks: 2, storeKey: "regression" },
      // Wave 12 — Anchored VWAP: 1 clic ancla la VWAP desde esa vela
      { id: "avwap", glyph: "Ⓥ", label: "VWAP anclado (AVWAP)", clicks: 1, storeKey: "anchoredVwap" },
    ],
  },
  {
    id: "text",
    glyph: "T",
    icon: TextIcon,
    label: "Texto",
    tools: [
      { id: "text", glyph: "T", label: "Nota de texto", clicks: 1, storeKey: "text" },
      { id: "flag", glyph: "⚑", label: "Marcador (pin)", clicks: 1, storeKey: "flag" },
      { id: "plabel", glyph: "$", label: "Etiqueta de precio", clicks: 1, storeKey: "plabel" },
      { id: "callout", glyph: "⌐", label: "Globo / callout", clicks: 2, storeKey: "callout" },
    ],
  },
  {
    id: "magnet",
    glyph: "⌖",
    icon: MagnetIcon,
    label: "Imán / bloqueo",
    tools: [
      { id: "magnet", glyph: "⌖", label: "Modo imán", clicks: 0, toggleKey: "magnetMode" },
      { id: "lock", glyph: "⚿", label: "Bloquear dibujos", clicks: 0, toggleKey: "lockDrawings" },
      { id: "hidedraw", glyph: "ø", label: "Ocultar dibujos", clicks: 0, toggleKey: "hideDrawings" },
    ],
  },
];

// Reverse lookup: store key → group id (so the active group shows the active glyph)
const GROUP_FOR_STOREKEY: Record<
  string,
  { groupId: string; toolId: string; glyph: string; icon?: ToolIcon }
> = {};
for (const g of GROUPS) {
  for (const t of g.tools) {
    if (t.storeKey) {
      GROUP_FOR_STOREKEY[t.storeKey] = {
        groupId: g.id,
        toolId: t.id,
        glyph: t.glyph,
        icon: t.icon,
      };
    }
  }
}

export function LeftSidebar() {
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const clearDrawings = useChartStore((s) => s.clearDrawings);
  const symbol = useChartStore((s) => s.symbol);
  const mobileOpen = useChartStore((s) => s.mobileLeftOpen);
  const setMobileLeftOpen = useChartStore((s) => s.setMobileLeftOpen);
  // Wave 6C — toggle states (read for visual active state)
  const magnetMode = useChartStore((s) => s.magnetMode);
  const lockDrawings = useChartStore((s) => s.lockDrawings);
  const hideDrawings = useChartStore((s) => s.hideDrawings);
  const toggleMagnetMode = useChartStore((s) => s.toggleMagnetMode);
  const toggleLockDrawings = useChartStore((s) => s.toggleLockDrawings);
  const toggleHideDrawings = useChartStore((s) => s.toggleHideDrawings);

  const toggleStateOf = (key: ToolDef["toggleKey"]): boolean => {
    if (key === "magnetMode") return magnetMode;
    if (key === "lockDrawings") return lockDrawings;
    if (key === "hideDrawings") return hideDrawings;
    return false;
  };
  const fireToggle = (key: ToolDef["toggleKey"]): void => {
    if (key === "magnetMode") toggleMagnetMode();
    else if (key === "lockDrawings") toggleLockDrawings();
    else if (key === "hideDrawings") toggleHideDrawings();
  };

  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const sidebarRef = useRef<HTMLDivElement | null>(null);

  // Click outside closes the flyout
  useEffect(() => {
    if (!openGroup) return;
    const onDoc = (e: MouseEvent) => {
      if (!sidebarRef.current?.contains(e.target as Node)) setOpenGroup(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openGroup]);

  const activeMapping = GROUP_FOR_STOREKEY[tool];
  const activeGroupId = activeMapping?.groupId ?? "cursor";

  const pickTool = (t: ToolDef) => {
    // Toggle entry: flips the store boolean, doesn't set the active tool.
    if (t.toggleKey) {
      fireToggle(t.toggleKey);
      setOpenGroup(null);
      setMobileLeftOpen(false);
      return;
    }
    if (!t.storeKey) return; // próximamente — no-op
    setTool(t.storeKey);
    setOpenGroup(null);
    setMobileLeftOpen(false);
  };

  return (
    <aside
      ref={sidebarRef}
      className={cn(
        // overflow-visible es CRÍTICO acá: el flyout es absolute con left-full
        // y width 256px, y se rompía porque overflow-y-auto fuerza overflow-x:auto
        // por spec, recortándolo a 0px.
        "z-30 flex w-11 flex-col items-center overflow-visible border-r border-tv-border bg-tv-panel py-1",
        "md:relative md:translate-x-0",
        "fixed inset-y-0 left-0 transition-transform",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      )}
    >
      {GROUPS.map((g) => {
        const isActiveGroup = activeGroupId === g.id;
        // Show the active tool's glyph on the group button if it lives in this group
        const displayGlyph =
          isActiveGroup && activeMapping ? activeMapping.glyph : g.glyph;
        // §15 — si la tool activa no trae ícono, cae al del grupo, y si el
        // grupo tampoco tiene, al glifo de siempre.
        const DisplayIcon =
          (isActiveGroup ? activeMapping?.icon : undefined) ?? g.icon;
        const isOpen = openGroup === g.id;
        const onlyOne = g.tools.length === 1;
        return (
          <div key={g.id} className="relative flex w-full justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onlyOne) {
                  const t = g.tools[0];
                  pickTool(t);
                } else {
                  setOpenGroup(isOpen ? null : g.id);
                }
              }}
              aria-label={g.label}
              title={g.label}
              className={cn(
                "group relative my-0.5 flex h-8 w-8 items-center justify-center rounded font-mono text-[15px] transition-colors hover:bg-tv-panel-hover",
                isActiveGroup
                  ? "bg-tv-blue/15 text-tv-blue"
                  : "text-tv-text-muted hover:text-tv-text",
                isOpen && "bg-tv-panel-hover text-tv-text",
              )}
            >
              {DisplayIcon ? (
                <DisplayIcon size={17} />
              ) : (
                <span aria-hidden className="leading-none">
                  {displayGlyph}
                </span>
              )}
              {!onlyOne && (
                <span
                  aria-hidden
                  className="absolute bottom-0.5 right-0.5 text-[7px] leading-none text-tv-text-muted"
                >
                  ▸
                </span>
              )}
            </button>

            {isOpen && (
              <div className="absolute left-full top-0 z-50 ml-1 w-64 rounded border border-tv-border bg-tv-panel py-1 shadow-2xl">
                <div className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-tv-text-muted">
                  {g.label}
                </div>
                {g.tools.map((t) => {
                  const isToggle = !!t.toggleKey;
                  const isActive = isToggle
                    ? toggleStateOf(t.toggleKey)
                    : t.storeKey === tool;
                  const disabled = !isToggle && !t.storeKey;
                  return (
                    <button
                      key={t.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        pickTool(t);
                      }}
                      disabled={disabled}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] transition-colors",
                        disabled
                          ? "cursor-not-allowed text-tv-text-dim"
                          : "hover:bg-tv-panel-hover",
                        isActive && "bg-tv-blue/10 text-tv-blue",
                        !disabled && !isActive && "text-tv-text",
                      )}
                    >
                      <span
                        aria-hidden
                        className="w-4 shrink-0 text-center font-mono text-[13px] leading-none"
                      >
                        {t.glyph}
                      </span>
                      <span className="flex-1 truncate">{t.label}</span>
                      {disabled ? (
                        <span className="ml-auto shrink-0 rounded bg-tv-bg px-1.5 py-px text-[9px] uppercase tracking-wider text-tv-text-dim">
                          próximamente
                        </span>
                      ) : isToggle ? (
                        <span
                          className={cn(
                            "ml-auto shrink-0 rounded px-1.5 py-px font-mono text-[9px] uppercase tracking-wider",
                            isActive
                              ? "bg-tv-blue/20 text-tv-blue"
                              : "bg-tv-bg text-tv-text-muted",
                          )}
                        >
                          {isActive ? "ON" : "OFF"}
                        </span>
                      ) : (
                        <span className="ml-auto shrink-0 font-mono text-[10px] text-tv-text-muted">
                          {t.clicks === "poly"
                            ? "poly"
                            : t.clicks > 0
                              ? `${t.clicks} pt`
                              : ""}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className="my-1 h-px w-6 bg-tv-border" />

      <button
        onClick={() => {
          if (window.confirm("¿Borrar todos los dibujos del gráfico?")) {
            clearDrawings(symbol);
          }
        }}
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
