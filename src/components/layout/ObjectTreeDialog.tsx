"use client";

import {
  Layers,
  Eye,
  EyeOff,
  Trash2,
  TrendingUp,
  ArrowUpRight,
  GitBranch,
  Square,
  Minus,
  AlignHorizontalJustifyStart,
  Type,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChartStore, type IndicatorKey } from "@/lib/store/chart-store";
import { getInstrument } from "@/lib/instruments";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const DRAWING_ICONS = {
  trendline: TrendingUp,
  ray: TrendingUp,
  vline: Minus,
  hlineExt: Minus,
  arrow: ArrowUpRight,
  fib: GitBranch,
  rect: Square,
  hrange: AlignHorizontalJustifyStart,
  long: Square,
  short: Square,
  text: Type,
  hline: Minus,
} as const;

const INDICATOR_LABELS: Record<IndicatorKey, string> = {
  ema20: "EMA 20",
  ema50: "EMA 50",
  ema200: "EMA 200",
  sma20: "SMA 20",
  sma50: "SMA 50",
  bb: "Bollinger",
  vwap: "VWAP",
  rsi: "RSI",
  macd: "MACD",
  volume: "Volume",
};

export function ObjectTreeDialog({ open, onOpenChange }: Props) {
  const symbol = useChartStore((s) => s.symbol);
  const drawings = useChartStore((s) => s.drawings);
  const priceLines = useChartStore((s) => s.priceLines);
  const indicators = useChartStore((s) => s.indicators);
  const hidden = useChartStore((s) => s.hidden);
  const toggleHidden = useChartStore((s) => s.toggleHidden);
  const removeIndicator = useChartStore((s) => s.removeIndicator);
  const removeDrawing = useChartStore((s) => s.removeDrawing);
  const clearPriceLines = useChartStore((s) => s.clearPriceLines);
  const clearDrawings = useChartStore((s) => s.clearDrawings);

  const symbolDrawings = drawings.filter((d) => d.symbol === symbol);
  const symbolPriceLines = priceLines.filter((p) => p.symbol === symbol);
  const activeIndicators = (Object.keys(indicators) as IndicatorKey[]).filter(
    (k) => indicators[k],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm font-medium">
            <Layers className="h-4 w-4" />
            Capas — {getInstrument(symbol).displayName}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[500px]">
          <Section
            title="Indicadores"
            count={activeIndicators.length}
            onClear={() => activeIndicators.forEach((k) => removeIndicator(k))}
          >
            {activeIndicators.length === 0 && <Empty />}
            {activeIndicators.map((k) => (
              <Row
                key={k}
                label={INDICATOR_LABELS[k]}
                visible={!hidden[k]}
                onToggleVisible={() => toggleHidden(k)}
                onRemove={() => removeIndicator(k)}
              />
            ))}
          </Section>

          <Section
            title="Drawings"
            count={symbolDrawings.length + symbolPriceLines.length}
            onClear={() => clearDrawings(symbol)}
          >
            {symbolDrawings.length === 0 && symbolPriceLines.length === 0 && (
              <Empty />
            )}
            {symbolPriceLines.map((p) => (
              <Row
                key={p.id}
                Icon={Minus}
                label={`Línea ${p.price.toFixed(2)}`}
                onRemove={() => clearPriceLines(symbol)}
              />
            ))}
            {symbolDrawings.map((d) => {
              const Icon = DRAWING_ICONS[d.type];
              const label =
                d.type === "text"
                  ? `Texto · "${d.text.slice(0, 24)}${d.text.length > 24 ? "…" : ""}"`
                  : d.type === "trendline"
                    ? `Línea ${d.a.price.toFixed(2)} → ${d.b.price.toFixed(2)}`
                    : d.type === "arrow"
                      ? `Flecha ${d.a.price.toFixed(2)} → ${d.b.price.toFixed(2)}`
                      : d.type === "fib"
                        ? `Fib ${d.a.price.toFixed(2)} → ${d.b.price.toFixed(2)}`
                        : d.type === "rect"
                          ? `Rect ${d.a.price.toFixed(2)} × ${d.b.price.toFixed(2)}`
                          : d.type === "hrange"
                            ? `Rango ${Math.max(d.a.price, d.b.price).toFixed(2)} → ${Math.min(d.a.price, d.b.price).toFixed(2)}`
                            : "Drawing";
              return (
                <Row
                  key={d.id}
                  Icon={Icon}
                  label={label}
                  onRemove={() => removeDrawing(d.id)}
                />
              );
            })}
          </Section>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  count,
  onClear,
  children,
}: {
  title: string;
  count: number;
  onClear?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-tv-border">
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-tv-text-muted">
          {title} ({count})
        </span>
        {onClear && count > 0 && (
          <button
            onClick={onClear}
            className="text-[10px] text-tv-text-muted hover:text-tv-red"
          >
            Borrar todo
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Empty() {
  return (
    <div className="px-4 py-2 text-[11px] text-tv-text-muted">
      Sin elementos.
    </div>
  );
}

function Row({
  Icon,
  label,
  visible,
  onToggleVisible,
  onRemove,
}: {
  Icon?: React.ComponentType<{ className?: string }>;
  label: string;
  visible?: boolean;
  onToggleVisible?: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center justify-between px-4 py-1.5 text-xs hover:bg-tv-panel-hover",
        visible === false && "opacity-60",
      )}
    >
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5 text-tv-text-muted" />}
        <span className="text-tv-text">{label}</span>
      </div>
      <div className="flex items-center gap-1">
        {onToggleVisible !== undefined && (
          <button
            onClick={onToggleVisible}
            aria-label="Toggle visibility"
            className="rounded p-0.5 text-tv-text-muted hover:text-tv-text"
          >
            {visible ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
          </button>
        )}
        <button
          onClick={onRemove}
          aria-label="Borrar"
          className="rounded p-0.5 text-tv-text-muted opacity-0 transition-opacity hover:text-tv-red group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
