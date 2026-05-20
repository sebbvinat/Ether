"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, ChevronDown, Bold, Italic, Trash2, Check } from "lucide-react";
import {
  useChartStore,
  type Drawing,
  type DrawingPoint,
  type DrawingStyle,
  type DrawingTool,
} from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

type Tab = "style" | "text" | "coordinates" | "visibility";

// Tipo → label en español (mostrado en el header del dialog)
const TYPE_LABELS: Partial<Record<DrawingTool, string>> = {
  trendline: "Línea de tendencia",
  arrow: "Flecha",
  ray: "Rayo",
  hlineExt: "Línea horizontal extendida",
  vline: "Línea vertical",
  hrange: "Rango horizontal",
  rect: "Rectángulo",
  fib: "Retroceso Fibonacci",
  ellipse: "Elipse",
  long: "Posición larga",
  short: "Posición corta",
  text: "Texto",
  hline: "Línea horizontal",
  cross: "Cruz",
  flag: "Marcador",
  plabel: "Etiqueta de precio",
  trange: "Rango de fechas",
  forecast: "Proyección",
  cycle: "Líneas de ciclo",
  regression: "Regresión lineal",
  fibext: "Extensión Fibonacci",
  fibarc: "Arco Fibonacci",
  fibfan: "Abanico Fibonacci",
  gannbox: "Caja de Gann",
  trendangle: "Línea con ángulo",
  channel: "Canal paralelo",
  pitch: "Pitchfork",
  triangle: "Triángulo",
  triangle3: "Triángulo 3 puntos",
  elliott3: "Elliott a-b-c",
  abcd: "Patrón ABCD",
  xabcd: "Patrón XABCD",
  elliott5: "Elliott 1-5",
  hs: "Hombro-cabeza-hombro",
  gannfan: "Abanico Gann",
  callout: "Callout",
  brush: "Pincel",
};

const PALETTE = [
  "#26a69a", "#ef5350", "#2962ff", "#ab47bc", "#ffb74d",
  "#ff7043", "#26c6da", "#9ccc65", "#ec407a", "#d1d4dc",
  "#787b86", "#000000", "#ffffff",
];

const TFS = ["1m", "5m", "15m", "1H", "4H", "1D", "1W"];
// TF visuales del screenshot de TV que no soportamos — siempre disabled
const TF_FAKE = ["Ticks", "Seconds", "Ranges"];

const DEFAULT_STYLE: DrawingStyle = {
  lineStyle: "solid",
  lineWidth: 1,
  extend: "none",
  showMiddlePoint: false,
  showPriceLabels: false,
  stats: "hidden",
  statsPosition: "right",
  alwaysShowStats: false,
  text: "",
  textColor: "#26a69a",
  textSize: 12,
  textBold: false,
  textItalic: false,
  textVAlign: "top",
  textHAlign: "center",
};

/** True si el drawing es 2-pt (a + b). */
function is2Pt(d: Drawing): d is Extract<Drawing, { a: DrawingPoint; b: DrawingPoint }> {
  return "a" in d && "b" in d && !("c" in d);
}

/** Convierte epoch seconds → string "YYYY-MM-DDTHH:mm" (datetime-local). */
function toDtLocal(timeSec: number): string {
  const d = new Date(timeSec * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromDtLocal(s: string): number {
  const d = new Date(s);
  return Math.floor(d.getTime() / 1000);
}

export function DrawingPropertiesDialog() {
  const targetId = useChartStore((s) => s.drawingPropsTargetId);
  const drawings = useChartStore((s) => s.drawings);
  const drawingStyles = useChartStore((s) => s.drawingStyles);
  const drawingTemplates = useChartStore((s) => s.drawingTemplates);
  const close = useChartStore((s) => s.closeDrawingProps);
  const setDrawingStyleFull = useChartStore((s) => s.setDrawingStyleFull);
  const updateDrawing = useChartStore((s) => s.updateDrawing);
  const saveDrawingTemplate = useChartStore((s) => s.saveDrawingTemplate);
  const deleteDrawingTemplate = useChartStore((s) => s.deleteDrawingTemplate);

  const target = useMemo(
    () => drawings.find((d) => d.id === targetId) ?? null,
    [drawings, targetId],
  );

  const [tab, setTab] = useState<Tab>("style");
  const [draftStyle, setDraftStyle] = useState<DrawingStyle>(DEFAULT_STYLE);
  const [draftPoints, setDraftPoints] = useState<{
    a?: DrawingPoint;
    b?: DrawingPoint;
    c?: DrawingPoint;
    at?: DrawingPoint;
    points?: DrawingPoint[];
  }>({});
  const [colorPickerOpen, setColorPickerOpen] = useState<
    "line" | "text" | null
  >(null);
  const [tplOpen, setTplOpen] = useState(false);

  // Snapshot al abrir (cada vez que cambia el target)
  useEffect(() => {
    if (!target) return;
    setTab("style");
    setDraftStyle({ ...DEFAULT_STYLE, ...(drawingStyles[target.id] ?? {}) });
    const np: typeof draftPoints = {};
    if ("a" in target) np.a = target.a;
    if ("b" in target) np.b = target.b;
    if ("c" in target) np.c = target.c;
    if ("at" in target) np.at = target.at;
    if ("points" in target) np.points = target.points;
    setDraftPoints(np);
    setColorPickerOpen(null);
    setTplOpen(false);
  }, [target, drawingStyles]);

  // Esc cierra (descarta)
  useEffect(() => {
    if (!target) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [target, close]);

  if (!target) return null;

  const title =
    TYPE_LABELS[target.type as DrawingTool] ?? String(target.type);
  const is2 = is2Pt(target);
  const isHLine = target.type === "hline" || target.type === "hlineExt";
  const isHRange = target.type === "hrange";

  function commit() {
    if (!target) return;
    setDrawingStyleFull(target.id, draftStyle);
    // Aplicar también cambios en puntos
    const patch: Parameters<typeof updateDrawing>[1] = {};
    if (draftPoints.a) patch.a = draftPoints.a;
    if (draftPoints.b) patch.b = draftPoints.b;
    if (draftPoints.c) patch.c = draftPoints.c;
    if (draftPoints.at) patch.at = draftPoints.at;
    if (draftPoints.points) patch.points = draftPoints.points;
    if (Object.keys(patch).length > 0) updateDrawing(target.id, patch);
    close();
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/60"
      onClick={close}
    >
      <div
        className="flex w-[min(460px,94vw)] max-h-[90vh] flex-col overflow-hidden rounded-lg border border-tv-border bg-tv-panel text-tv-text shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-tv-border px-4 py-3">
          <span className="text-base font-semibold">{title}</span>
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar"
            className="ml-auto rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 items-center gap-1 border-b border-tv-border px-3 py-1.5">
          {(
            [
              ["style", "Style"],
              ["text", "Text"],
              ["coordinates", "Coordinates"],
              ["visibility", "Visibility"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium",
                tab === id
                  ? "border-b-2 border-tv-blue text-tv-text"
                  : "text-tv-text-muted hover:text-tv-text",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm">
          {tab === "style" && (
            <StyleTab
              draft={draftStyle}
              setDraft={setDraftStyle}
              show2pt={is2}
              showPriceLabels={isHLine || isHRange}
              showStats={is2}
              pickerOpen={colorPickerOpen === "line"}
              setPickerOpen={(v) => setColorPickerOpen(v ? "line" : null)}
            />
          )}
          {tab === "text" && (
            <TextTab
              draft={draftStyle}
              setDraft={setDraftStyle}
              pickerOpen={colorPickerOpen === "text"}
              setPickerOpen={(v) => setColorPickerOpen(v ? "text" : null)}
            />
          )}
          {tab === "coordinates" && (
            <CoordinatesTab
              target={target}
              draft={draftPoints}
              setDraft={setDraftPoints}
            />
          )}
          {tab === "visibility" && (
            <VisibilityTab draft={draftStyle} setDraft={setDraftStyle} />
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center gap-2 border-t border-tv-border px-4 py-3">
          <TemplateDropdown
            open={tplOpen}
            setOpen={setTplOpen}
            templates={drawingTemplates}
            currentStyle={draftStyle}
            onApply={(tpl) => setDraftStyle({ ...DEFAULT_STYLE, ...tpl.style })}
            onSave={(name) => saveDrawingTemplate(name, draftStyle)}
            onDelete={(id) => deleteDrawingTemplate(id)}
          />
          <div className="ml-auto flex gap-2">
            <button
              onClick={close}
              className="rounded border border-tv-border bg-tv-panel-hover px-4 py-1.5 text-xs hover:bg-tv-bg"
            >
              Cancel
            </button>
            <button
              onClick={commit}
              className="rounded bg-tv-text px-4 py-1.5 text-xs font-semibold text-tv-bg hover:opacity-90"
            >
              Ok
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// Tab: Style
// =========================================================================

function StyleTab({
  draft,
  setDraft,
  show2pt,
  showPriceLabels,
  showStats,
  pickerOpen,
  setPickerOpen,
}: {
  draft: DrawingStyle;
  setDraft: (s: DrawingStyle) => void;
  show2pt: boolean;
  showPriceLabels: boolean;
  showStats: boolean;
  pickerOpen: boolean;
  setPickerOpen: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <Row label="Line">
        <ColorSwatch
          color={draft.color ?? "#26a69a"}
          onChange={(c) => setDraft({ ...draft, color: c })}
          open={pickerOpen}
          setOpen={setPickerOpen}
        />
        <SegLineStyle
          value={draft.lineStyle ?? "solid"}
          onChange={(v) => setDraft({ ...draft, lineStyle: v })}
        />
        <select
          value={draft.lineWidth ?? 1}
          onChange={(e) =>
            setDraft({ ...draft, lineWidth: Number(e.target.value) })
          }
          className="rounded border border-tv-border bg-tv-bg px-2 py-1 text-xs"
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Row>

      <Row label="Extend">
        <select
          value={draft.extend ?? "none"}
          onChange={(e) =>
            setDraft({
              ...draft,
              extend: e.target.value as DrawingStyle["extend"],
            })
          }
          className="flex-1 rounded border border-tv-border bg-tv-bg px-2 py-1 text-xs"
        >
          <option value="none">Don&apos;t extend</option>
          <option value="right">Extend right</option>
          <option value="left">Extend left</option>
          <option value="both">Extend both</option>
        </select>
      </Row>

      {show2pt && (
        <Checkbox
          label="Middle point"
          value={!!draft.showMiddlePoint}
          onChange={(v) => setDraft({ ...draft, showMiddlePoint: v })}
        />
      )}
      {showPriceLabels && (
        <Checkbox
          label="Price labels"
          value={!!draft.showPriceLabels}
          onChange={(v) => setDraft({ ...draft, showPriceLabels: v })}
        />
      )}

      {showStats && (
        <>
          <div className="pt-1 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
            Info
          </div>
          <Row label="Stats">
            <select
              value={draft.stats ?? "hidden"}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  stats: e.target.value as DrawingStyle["stats"],
                })
              }
              className="flex-1 rounded border border-tv-border bg-tv-bg px-2 py-1 text-xs"
            >
              <option value="hidden">Hidden</option>
              <option value="info">Info</option>
              <option value="extended">Extended</option>
            </select>
          </Row>
          <Row label="Stats position">
            <select
              value={draft.statsPosition ?? "right"}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  statsPosition: e.target.value as "right" | "left",
                })
              }
              className="flex-1 rounded border border-tv-border bg-tv-bg px-2 py-1 text-xs"
            >
              <option value="right">Right</option>
              <option value="left">Left</option>
            </select>
          </Row>
          <Checkbox
            label="Always show stats"
            value={!!draft.alwaysShowStats}
            onChange={(v) => setDraft({ ...draft, alwaysShowStats: v })}
          />
        </>
      )}
    </div>
  );
}

// =========================================================================
// Tab: Text
// =========================================================================

function TextTab({
  draft,
  setDraft,
  pickerOpen,
  setPickerOpen,
}: {
  draft: DrawingStyle;
  setDraft: (s: DrawingStyle) => void;
  pickerOpen: boolean;
  setPickerOpen: (v: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ColorSwatch
          color={draft.textColor ?? "#26a69a"}
          onChange={(c) => setDraft({ ...draft, textColor: c })}
          open={pickerOpen}
          setOpen={setPickerOpen}
        />
        <select
          value={draft.textSize ?? 12}
          onChange={(e) =>
            setDraft({ ...draft, textSize: Number(e.target.value) })
          }
          className="rounded border border-tv-border bg-tv-bg px-2 py-1 text-xs"
        >
          {[9, 10, 11, 12, 14, 16, 20, 24, 32].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button
          onClick={() => setDraft({ ...draft, textBold: !draft.textBold })}
          className={cn(
            "rounded border border-tv-border px-2 py-1 text-xs",
            draft.textBold
              ? "bg-tv-blue/15 text-tv-blue"
              : "bg-tv-bg text-tv-text",
          )}
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setDraft({ ...draft, textItalic: !draft.textItalic })}
          className={cn(
            "rounded border border-tv-border px-2 py-1 text-xs",
            draft.textItalic
              ? "bg-tv-blue/15 text-tv-blue"
              : "bg-tv-bg text-tv-text",
          )}
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
      </div>

      <textarea
        value={draft.text ?? ""}
        onChange={(e) => setDraft({ ...draft, text: e.target.value })}
        placeholder="Add text"
        rows={4}
        className="w-full rounded border-2 border-tv-blue bg-tv-bg px-2 py-1.5 text-xs outline-none placeholder:text-tv-text-muted"
      />

      <Row label="Text alignment">
        <select
          value={draft.textVAlign ?? "top"}
          onChange={(e) =>
            setDraft({
              ...draft,
              textVAlign: e.target.value as DrawingStyle["textVAlign"],
            })
          }
          className="flex-1 rounded border border-tv-border bg-tv-bg px-2 py-1 text-xs"
        >
          <option value="top">Top</option>
          <option value="middle">Middle</option>
          <option value="bottom">Bottom</option>
        </select>
        <select
          value={draft.textHAlign ?? "center"}
          onChange={(e) =>
            setDraft({
              ...draft,
              textHAlign: e.target.value as DrawingStyle["textHAlign"],
            })
          }
          className="flex-1 rounded border border-tv-border bg-tv-bg px-2 py-1 text-xs"
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </Row>
    </div>
  );
}

// =========================================================================
// Tab: Coordinates
// =========================================================================

function CoordinatesTab({
  target,
  draft,
  setDraft,
}: {
  target: Drawing;
  draft: {
    a?: DrawingPoint;
    b?: DrawingPoint;
    c?: DrawingPoint;
    at?: DrawingPoint;
    points?: DrawingPoint[];
  };
  setDraft: (s: {
    a?: DrawingPoint;
    b?: DrawingPoint;
    c?: DrawingPoint;
    at?: DrawingPoint;
    points?: DrawingPoint[];
  }) => void;
}) {
  // long/short: Entry / Stop / Target labels
  const isLS = target.type === "long" || target.type === "short";

  if ("points" in target && target.points) {
    if (target.type === "brush") {
      return (
        <div className="text-xs text-tv-text-muted">
          {target.points.length} puntos de pincel — no se editan
          individualmente.
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {(draft.points ?? target.points).map((p, i) => (
          <CoordRow
            key={i}
            label={`#${i + 1}`}
            point={p}
            onChange={(np) => {
              const pts = (draft.points ?? target.points).slice();
              pts[i] = np;
              setDraft({ ...draft, points: pts });
            }}
          />
        ))}
      </div>
    );
  }

  if ("at" in target && draft.at) {
    return (
      <CoordRow
        label="#1"
        point={draft.at}
        onChange={(np) => setDraft({ ...draft, at: np })}
      />
    );
  }

  // 2-pt + long/short (3-pt)
  return (
    <div className="space-y-2">
      {draft.a && (
        <CoordRow
          label={isLS ? "Entry" : "#1"}
          point={draft.a}
          onChange={(np) => setDraft({ ...draft, a: np })}
        />
      )}
      {draft.b && (
        <CoordRow
          label={isLS ? "Stop" : "#2"}
          point={draft.b}
          onChange={(np) => setDraft({ ...draft, b: np })}
        />
      )}
      {draft.c && (
        <CoordRow
          label="Target"
          point={draft.c}
          onChange={(np) => setDraft({ ...draft, c: np })}
        />
      )}
    </div>
  );
}

function CoordRow({
  label,
  point,
  onChange,
}: {
  label: string;
  point: DrawingPoint;
  onChange: (p: DrawingPoint) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-xs text-tv-text-muted">{label}</span>
      <input
        type="number"
        step="any"
        value={point.price}
        onChange={(e) =>
          onChange({ ...point, price: Number(e.target.value) || 0 })
        }
        className="w-28 rounded border border-tv-border bg-tv-bg px-2 py-1 text-xs tabular-nums"
      />
      <input
        type="datetime-local"
        value={toDtLocal(point.time)}
        onChange={(e) =>
          onChange({ ...point, time: fromDtLocal(e.target.value) })
        }
        className="flex-1 rounded border border-tv-border bg-tv-bg px-2 py-1 text-xs"
      />
    </div>
  );
}

// =========================================================================
// Tab: Visibility
// =========================================================================

function VisibilityTab({
  draft,
  setDraft,
}: {
  draft: DrawingStyle;
  setDraft: (s: DrawingStyle) => void;
}) {
  const isVisible = (tf: string) => {
    if (!draft.visibleTfs) return true;
    return draft.visibleTfs.includes(tf);
  };
  const setVisible = (tf: string, on: boolean) => {
    const cur = draft.visibleTfs ?? TFS;
    const next = on ? [...new Set([...cur, tf])] : cur.filter((t) => t !== tf);
    setDraft({ ...draft, visibleTfs: next });
  };
  return (
    <div className="space-y-2">
      {/* Disabled visuales (fidelidad con TV) */}
      {TF_FAKE.map((tf) => (
        <div
          key={tf}
          title="No soportado en este chart"
          className="flex items-center gap-3 opacity-40"
        >
          <input
            type="checkbox"
            disabled
            className="h-4 w-4 accent-tv-blue"
          />
          <span className="w-20 text-xs">{tf}</span>
        </div>
      ))}
      {/* TFs reales */}
      {TFS.map((tf) => {
        const on = isVisible(tf);
        const rng = draft.visibleRanges?.[tf];
        return (
          <div key={tf} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={on}
              onChange={(e) => setVisible(tf, e.target.checked)}
              className="h-4 w-4 accent-tv-blue"
            />
            <span className="w-12 text-xs">{tf}</span>
            <input
              type="number"
              value={rng?.min ?? 1}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  visibleRanges: {
                    ...(draft.visibleRanges ?? {}),
                    [tf]: { min: Number(e.target.value) || 0, max: rng?.max ?? 999 },
                  },
                })
              }
              className="w-16 rounded border border-tv-border bg-tv-bg px-1.5 py-0.5 text-[11px]"
            />
            <input
              type="range"
              min={0}
              max={999}
              value={rng?.max ?? 999}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  visibleRanges: {
                    ...(draft.visibleRanges ?? {}),
                    [tf]: { min: rng?.min ?? 1, max: Number(e.target.value) },
                  },
                })
              }
              className="flex-1 accent-tv-blue"
            />
            <input
              type="number"
              value={rng?.max ?? 999}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  visibleRanges: {
                    ...(draft.visibleRanges ?? {}),
                    [tf]: { min: rng?.min ?? 1, max: Number(e.target.value) || 999 },
                  },
                })
              }
              className="w-16 rounded border border-tv-border bg-tv-bg px-1.5 py-0.5 text-[11px]"
            />
          </div>
        );
      })}
    </div>
  );
}

// =========================================================================
// Sub-componentes UI
// =========================================================================

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 text-xs text-tv-text-muted">{label}</span>
      <div className="flex flex-1 items-center gap-2">{children}</div>
    </div>
  );
}

function Checkbox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-tv-blue"
      />
      <span>{label}</span>
    </label>
  );
}

function SegLineStyle({
  value,
  onChange,
}: {
  value: "solid" | "dashed" | "dotted";
  onChange: (v: "solid" | "dashed" | "dotted") => void;
}) {
  const opts: { v: "solid" | "dashed" | "dotted"; label: string }[] = [
    { v: "solid", label: "─" },
    { v: "dashed", label: "╌" },
    { v: "dotted", label: "···" },
  ];
  return (
    <div className="flex rounded border border-tv-border">
      {opts.map((o, i) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "px-3 py-1 text-xs",
            i > 0 && "border-l border-tv-border",
            value === o.v
              ? "bg-tv-blue/15 text-tv-blue"
              : "bg-tv-bg text-tv-text hover:bg-tv-panel-hover",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ColorSwatch({
  color,
  onChange,
  open,
  setOpen,
}: {
  color: string;
  onChange: (c: string) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="h-7 w-12 rounded border border-tv-border"
        style={{ background: color }}
        aria-label="Color"
      />
      {open && (
        <div
          className="absolute left-0 top-full z-10 mt-1 grid grid-cols-7 gap-1 rounded border border-tv-border bg-tv-panel p-2 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className="h-5 w-5 rounded border border-tv-border"
              style={{ background: c }}
              aria-label={c}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => onChange(e.target.value)}
            className="col-span-7 h-7 w-full rounded border border-tv-border bg-tv-bg"
          />
        </div>
      )}
    </div>
  );
}

function TemplateDropdown({
  open,
  setOpen,
  templates,
  currentStyle,
  onApply,
  onSave,
  onDelete,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  templates: Array<{ id: string; name: string; style: DrawingStyle }>;
  currentStyle: DrawingStyle;
  onApply: (tpl: { id: string; name: string; style: DrawingStyle }) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, setOpen]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded border border-tv-border bg-tv-panel-hover px-3 py-1.5 text-xs text-tv-text hover:bg-tv-bg"
      >
        Template
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-10 mb-1 w-56 rounded border border-tv-border bg-tv-panel py-1 shadow-lg">
          {templates.length > 0 ? (
            <>
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="group flex items-center justify-between px-3 py-1.5 text-xs hover:bg-tv-panel-hover"
                >
                  <button
                    onClick={() => {
                      onApply(t);
                      setOpen(false);
                    }}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    <span
                      className="h-3 w-3 rounded-full border border-tv-border"
                      style={{ background: t.style.color ?? "#26a69a" }}
                    />
                    {t.name}
                  </button>
                  <button
                    onClick={() => onDelete(t.id)}
                    className="ml-2 rounded p-0.5 text-tv-text-muted opacity-0 hover:text-tv-red group-hover:opacity-100"
                    aria-label={`Borrar ${t.name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <div className="my-1 border-t border-tv-border" />
            </>
          ) : (
            <div className="px-3 py-2 text-[11px] text-tv-text-muted">
              Sin templates guardados.
            </div>
          )}
          <button
            onClick={() => {
              const name = window.prompt("Nombre del template:");
              if (name && name.trim()) {
                onSave(name.trim());
                setOpen(false);
              }
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-tv-panel-hover"
          >
            <Check className="h-3 w-3 text-tv-green" />
            Guardar como template…
          </button>
        </div>
      )}
      {/* Evita 'unused' lint en currentStyle (consumido al guardar via closure de onSave) */}
      <span className="hidden">{JSON.stringify(currentStyle).length}</span>
    </div>
  );
}
