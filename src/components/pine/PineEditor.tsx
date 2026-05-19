"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Code, Plus, Save, Play, X } from "lucide-react";

type Script = { id: string; name: string; code: string };
type LogKind = "info" | "ok" | "err";
type LogRow = { t: LogKind; text: string };

const SAMPLE_SCRIPTS: Script[] = [
  {
    id: "ema-cross",
    name: "Cruce EMA 20/50",
    code: `//@version=5
strategy("Cruce EMA 20/50", overlay = true, initial_capital = 10000, default_qty_type = strategy.percent_of_equity, default_qty_value = 100)

// Inputs
fast_len = input.int(20, "EMA rápida")
slow_len = input.int(50, "EMA lenta")
risk_pct = input.float(1.0, "Riesgo por trade %", step = 0.1)

// Cálculos
fast = ta.ema(close, fast_len)
slow = ta.ema(close, slow_len)

// Señales
longCondition  = ta.crossover(fast, slow)
shortCondition = ta.crossunder(fast, slow)

// Plot
plot(fast, "EMA rápida", color = color.lime, linewidth = 2)
plot(slow, "EMA lenta",  color = color.orange, linewidth = 2)

// Órdenes
if longCondition
    strategy.entry("Long", strategy.long)
if shortCondition
    strategy.entry("Short", strategy.short)

// Salidas con SL/TP
strategy.exit("Salida L", "Long",  stop = strategy.position_avg_price * 0.97, limit = strategy.position_avg_price * 1.04)
strategy.exit("Salida S", "Short", stop = strategy.position_avg_price * 1.03, limit = strategy.position_avg_price * 0.96)`,
  },
  {
    id: "rsi-divergence",
    name: "Divergencia RSI",
    code: `//@version=5
indicator("Divergencia RSI", overlay = false)

rsiLen = input.int(14, "Periodo RSI")
rsi = ta.rsi(close, rsiLen)
plot(rsi, "RSI", color = color.aqua)
hline(70, "Sobrecompra", color = color.red)
hline(30, "Sobreventa",  color = color.green)
bgcolor(rsi > 70 ? color.new(color.red, 88) : rsi < 30 ? color.new(color.green, 88) : na)`,
  },
  {
    id: "bb-breakout",
    name: "Breakout Bollinger",
    code: `//@version=5
strategy("Breakout Bollinger", overlay = true)
length = input.int(20, "Periodo")
mult   = input.float(2.0, "Desviación", step = 0.1)
basis  = ta.sma(close, length)
dev    = mult * ta.stdev(close, length)
upper  = basis + dev
lower  = basis - dev
plot(basis, "Base",     color = color.gray)
plot(upper, "Banda Sup", color = color.aqua)
plot(lower, "Banda Inf", color = color.aqua)
if ta.crossover(close, upper)
    strategy.entry("Long", strategy.long)
if ta.crossunder(close, lower)
    strategy.entry("Short", strategy.short)`,
  },
  {
    id: "macd-crossover",
    name: "Cruce MACD",
    code: `//@version=5\nindicator("Cruce MACD", overlay = false)\n[macd, sig, hist] = ta.macd(close, 12, 26, 9)\nplot(macd, color = color.aqua)\nplot(sig,  color = color.orange)\nplot(hist, style = plot.style_columns, color = hist >= 0 ? color.green : color.red)`,
  },
  {
    id: "vwap-bands",
    name: "VWAP con bandas σ",
    code: `//@version=5\nindicator("VWAP ± σ", overlay = true)\nv  = ta.vwap(hlc3)\ndv = ta.stdev(close, 20)\nplot(v,        color = color.yellow, linewidth = 2)\nplot(v + dv,   color = color.aqua)\nplot(v - dv,   color = color.aqua)\nplot(v + 2*dv, color = color.aqua, linewidth = 1, style = plot.style_circles)\nplot(v - 2*dv, color = color.aqua, linewidth = 1, style = plot.style_circles)`,
  },
];

const PUBLIC_SCRIPTS: string[] = [
  "Top 10 Cripto",
  "Squeeze Pro",
  "SMC Liquidity Sweep",
  "Order Block Finder",
];

const KEYWORDS = new Set<string>([
  "strategy", "indicator", "input", "plot", "plotchar", "plotshape", "plotcandle",
  "plotbar", "color", "hline", "fill", "bgcolor", "na", "true", "false", "if",
  "else", "for", "while", "var", "series", "int", "float", "bool", "string",
  "tuple", "method", "import", "export", "close", "open", "high", "low",
  "volume", "time", "hlc3", "ohlc4",
]);

const FN_NAMES = new Set<string>([
  "ta", "strategy", "math", "str", "color", "input", "array", "map", "matrix",
  "line", "label", "box", "table",
]);

// Tiny syntax highlighter — wraps keywords / functions / strings / numbers /
// comments in colored spans, tokenizing line by line.
function highlight(code: string): JSX.Element[] {
  const lines = code.split("\n");
  return lines.map((line, i) => {
    const parts: Array<JSX.Element | string> = [];
    const push = (cls: string, text: string) =>
      parts.push(
        <span key={parts.length} className={cls}>
          {text}
        </span>,
      );

    const cm = line.indexOf("//");
    const codePart = cm >= 0 ? line.slice(0, cm) : line;
    const cmtPart = cm >= 0 ? line.slice(cm) : "";

    const re =
      /("[^"]*"|'[^']*'|\b\d+\.?\d*\b|\b[a-zA-Z_][a-zA-Z_0-9.]*\b|\s+|[^\w\s])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(codePart)) !== null) {
      const tok = m[0];
      if (tok.startsWith('"') || tok.startsWith("'")) push("text-tv-green", tok);
      else if (/^\d/.test(tok)) push("text-tv-yellow", tok);
      else if (KEYWORDS.has(tok)) push("font-medium text-tv-purple", tok);
      else if (FN_NAMES.has(tok)) push("text-tv-blue", tok);
      else parts.push(tok);
    }
    if (cmtPart) {
      parts.push(
        <span key={`c${i}`} className="italic text-tv-text-muted">
          {cmtPart}
        </span>,
      );
    }

    return (
      <div key={i} className="flex">
        <span className="flex-[0_0_44px] select-none pr-2.5 text-right tabular-nums text-tv-text-muted">
          {i + 1}
        </span>
        <span className="flex-1 whitespace-pre pr-4 text-tv-text">{parts}</span>
      </div>
    );
  });
}

export function PineEditor({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [activeId, setActiveId] = useState<string>(SAMPLE_SCRIPTS[0].id);
  const [code, setCode] = useState<string>(SAMPLE_SCRIPTS[0].code);
  const [log, setLog] = useState<LogRow[]>([
    { t: "info", text: "Editor inicializado · Pine v5 compatible" },
  ]);

  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const s = SAMPLE_SCRIPTS.find((x) => x.id === activeId);
    if (s) setCode(s.code);
  }, [activeId, open]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open, onClose]);

  const highlighted = useMemo(() => highlight(code), [code]);

  const lineCount = useMemo(() => code.split("\n").length, [code]);

  const compile = useCallback(() => {
    const name =
      SAMPLE_SCRIPTS.find((x) => x.id === activeId)?.name ?? "script";
    setLog((c) => [
      ...c,
      { t: "info", text: `Compilando ${name}…` },
      { t: "ok", text: `✓ Sin errores · ${code.split("\n").length} líneas analizadas` },
      { t: "info", text: "Aplicado al gráfico actual" },
    ]);
  }, [activeId, code]);

  const onScrollSync = useCallback(
    (e: React.UIEvent<HTMLTextAreaElement>) => {
      const el = previewRef.current;
      if (!el) return;
      el.scrollTop = e.currentTarget.scrollTop;
      el.scrollLeft = e.currentTarget.scrollLeft;
    },
    [],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="flex h-[min(680px,90vh)] w-[min(1100px,94vw)] flex-col overflow-hidden rounded-lg border border-tv-border bg-tv-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-tv-border bg-tv-panel-hover px-3.5 py-2">
          <Code className="h-4 w-4 text-tv-text-muted" />
          <span className="text-sm font-semibold text-tv-text">
            Editor de Pine
          </span>
          <span className="border border-tv-blue px-1.5 py-px text-[10px] text-tv-blue">
            v5
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              className="flex items-center gap-1 border border-tv-border bg-tv-panel-hover px-2.5 py-1 text-[11px] text-tv-text hover:bg-tv-bg"
            >
              <Plus className="h-3 w-3" /> Nuevo
            </button>
            <button
              type="button"
              className="flex items-center gap-1 border border-tv-border bg-tv-panel-hover px-2.5 py-1 text-[11px] text-tv-text hover:bg-tv-bg"
            >
              <Save className="h-3 w-3" /> Guardar
            </button>
            <button
              type="button"
              onClick={compile}
              className="flex items-center gap-1 border border-tv-green bg-tv-green px-2.5 py-1 text-[11px] font-semibold text-tv-bg hover:opacity-90"
            >
              <Play className="h-3 w-3" /> Compilar y agregar al gráfico
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="px-1 text-tv-text-muted hover:text-tv-text"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="grid min-h-0 flex-1 grid-cols-[200px_1fr_200px]">
          {/* Left sidebar */}
          <aside className="overflow-auto border-r border-tv-border bg-tv-panel-hover p-2">
            <div className="px-1 pb-2 pt-1 text-[9px] uppercase tracking-[0.10em] text-tv-text-muted">
              Mis scripts
            </div>
            {SAMPLE_SCRIPTS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveId(s.id)}
                className={`flex w-full items-center gap-1.5 px-1.5 py-1 text-left text-[11px] hover:bg-tv-bg ${
                  activeId === s.id
                    ? "bg-tv-bg text-tv-green"
                    : "text-tv-text hover:text-tv-text"
                }`}
              >
                <span className="w-3.5 text-tv-text-muted">⌘</span>
                <span>{s.name}</span>
              </button>
            ))}
            <button
              type="button"
              className="flex w-full items-center gap-1.5 px-1.5 py-1 text-left text-[11px] italic text-tv-green hover:bg-tv-bg"
            >
              ＋ Crear nuevo
            </button>
            <div className="px-1 pb-2 pt-1 text-[9px] uppercase tracking-[0.10em] text-tv-text-muted mt-[18px]">
              Públicos
            </div>
            {PUBLIC_SCRIPTS.map((p) => (
              <button
                key={p}
                type="button"
                className="flex w-full items-center gap-1.5 px-1.5 py-1 text-left text-[11px] text-tv-text hover:bg-tv-bg"
              >
                <span className="w-3.5 text-tv-text-muted">⌥</span>
                <span>{p}</span>
              </button>
            ))}
          </aside>

          {/* Center — editable code with synced highlighted preview */}
          <div className="flex min-w-0 flex-col bg-tv-bg">
            <div className="relative flex-1 overflow-hidden">
              <div
                ref={previewRef}
                aria-hidden
                className="pointer-events-none absolute inset-0 overflow-auto py-2 font-mono text-[12.5px] leading-[1.55]"
              >
                {highlighted}
              </div>
              <textarea
                value={code}
                spellCheck={false}
                onChange={(e) => setCode(e.target.value)}
                onScroll={onScrollSync}
                className="absolute inset-0 resize-none overflow-auto whitespace-pre bg-transparent py-2 pl-[54px] pr-4 font-mono text-[12.5px] leading-[1.55] text-transparent caret-tv-text outline-none"
              />
            </div>
          </div>

          {/* Right sidebar */}
          <aside className="overflow-auto border-l border-tv-border bg-tv-panel-hover p-2">
            <div className="px-1 pb-2 pt-1 text-[9px] uppercase tracking-[0.10em] text-tv-text-muted">
              Variables
            </div>
            <div className="flex justify-between px-1 py-0.5 text-[11px] text-tv-text">
              <span>fast_len</span>
              <span className="text-tv-yellow">20</span>
            </div>
            <div className="flex justify-between px-1 py-0.5 text-[11px] text-tv-text">
              <span>slow_len</span>
              <span className="text-tv-yellow">50</span>
            </div>
            <div className="flex justify-between px-1 py-0.5 text-[11px] text-tv-text">
              <span>risk_pct</span>
              <span className="text-tv-yellow">1.0%</span>
            </div>
            <div className="mt-3.5 px-1 pb-2 pt-1 text-[9px] uppercase tracking-[0.10em] text-tv-text-muted">
              Estadísticas
            </div>
            <div className="flex justify-between px-1 py-0.5 text-[11px] text-tv-text">
              <span>Líneas</span>
              <span className="text-tv-yellow">{lineCount}</span>
            </div>
            <div className="flex justify-between px-1 py-0.5 text-[11px] text-tv-text">
              <span>Caracteres</span>
              <span className="text-tv-yellow">{code.length}</span>
            </div>
            <div className="flex justify-between px-1 py-0.5 text-[11px] text-tv-text">
              <span>Última compilación</span>
              <span className="text-tv-text-muted">recién</span>
            </div>
          </aside>
        </div>

        {/* Console */}
        <div className="max-h-[140px] overflow-auto border-t border-tv-border bg-tv-panel-hover px-3 py-2">
          <div className="mb-1 text-[9px] uppercase tracking-[0.10em] text-tv-text-muted">
            Consola
          </div>
          {log.map((c, i) => (
            <div
              key={i}
              className="flex gap-2 py-px font-mono text-[11px] text-tv-text"
            >
              <span
                className={`w-3.5 ${
                  c.t === "ok"
                    ? "text-tv-green"
                    : c.t === "err"
                      ? "text-tv-red"
                      : "text-tv-text-muted"
                }`}
              >
                {c.t === "ok" ? "✓" : c.t === "err" ? "✕" : "›"}
              </span>
              <span>{c.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
