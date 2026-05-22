"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

// Defaults del tema oscuro — usados como valor visible cuando no hay override.
const DEF = {
  up: "#26a69a",
  down: "#ef5350",
  bg: "#131722",
  grid: "#1e222d",
};

export function ChartSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const ap = useChartStore((s) => s.chartAppearance);
  const set = useChartStore((s) => s.setChartAppearance);
  const reset = useChartStore((s) => s.resetChartAppearance);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-tv-panel">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            Configuración del gráfico
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Velas */}
          <Section title="Velas">
            <ColorRow
              label="Alcista"
              value={ap.candleUp ?? DEF.up}
              overridden={ap.candleUp !== undefined}
              onChange={(v) => set({ candleUp: v })}
              onClear={() => set({ candleUp: undefined })}
            />
            <ColorRow
              label="Bajista"
              value={ap.candleDown ?? DEF.down}
              overridden={ap.candleDown !== undefined}
              onChange={(v) => set({ candleDown: v })}
              onClear={() => set({ candleDown: undefined })}
            />
            <ColorRow
              label="Mecha alcista"
              value={ap.wickUp ?? ap.candleUp ?? DEF.up}
              overridden={ap.wickUp !== undefined}
              onChange={(v) => set({ wickUp: v })}
              onClear={() => set({ wickUp: undefined })}
            />
            <ColorRow
              label="Mecha bajista"
              value={ap.wickDown ?? ap.candleDown ?? DEF.down}
              overridden={ap.wickDown !== undefined}
              onChange={(v) => set({ wickDown: v })}
              onClear={() => set({ wickDown: undefined })}
            />
            <ToggleRow
              label="Velas huecas"
              value={!!ap.hollow}
              onChange={(v) => set({ hollow: v })}
            />
          </Section>

          {/* Fondo y grilla */}
          <Section title="Fondo y grilla">
            <ColorRow
              label="Fondo"
              value={ap.background ?? DEF.bg}
              overridden={ap.background !== undefined}
              onChange={(v) => set({ background: v })}
              onClear={() => set({ background: undefined })}
            />
            <ColorRow
              label="Grilla"
              value={ap.gridColor ?? DEF.grid}
              overridden={ap.gridColor !== undefined}
              onChange={(v) => set({ gridColor: v })}
              onClear={() => set({ gridColor: undefined })}
            />
            <ToggleRow
              label="Mostrar grilla"
              value={ap.showGrid !== false}
              onChange={(v) => set({ showGrid: v })}
            />
          </Section>

          <div className="flex justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              className="text-tv-text-muted hover:text-tv-text"
            >
              Restaurar valores por defecto
            </Button>
            <Button
              size="sm"
              onClick={() => onOpenChange(false)}
              className="bg-tv-blue hover:bg-tv-blue/90"
            >
              Listo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
        {title}
      </span>
      {children}
    </div>
  );
}

function ColorRow({
  label,
  value,
  overridden,
  onChange,
  onClear,
}: {
  label: string;
  value: string;
  overridden: boolean;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-tv-text">
      <span className="flex-1">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-10 cursor-pointer rounded border border-tv-border bg-tv-bg"
        aria-label={label}
      />
      <button
        onClick={onClear}
        disabled={!overridden}
        title="Volver al valor del tema"
        className={cn(
          "rounded px-1.5 py-0.5 text-[10px]",
          overridden
            ? "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
            : "cursor-default text-tv-text-dim opacity-40",
        )}
      >
        Auto
      </button>
    </div>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex items-center justify-between text-xs text-tv-text"
    >
      <span>{label}</span>
      <span
        className={cn(
          "relative h-4 w-7 rounded-full transition-colors",
          value ? "bg-tv-blue" : "bg-tv-bg ring-1 ring-tv-border",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform",
            value ? "translate-x-3.5" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}
