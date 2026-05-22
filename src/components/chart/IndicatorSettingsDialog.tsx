"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  useChartStore,
  DEFAULT_CONFIG,
  type IndicatorKey,
} from "@/lib/store/chart-store";

const TITLES: Record<IndicatorKey, string> = {
  ema20: "EMA — Slot 1",
  ema50: "EMA — Slot 2",
  ema200: "EMA — Slot 3",
  sma20: "SMA — Slot 1",
  sma50: "SMA — Slot 2",
  bb: "Bandas de Bollinger",
  vwap: "VWAP",
  rsi: "RSI",
  macd: "MACD",
  atr: "ATR",
  obv: "OBV",
  stoch: "Estocástico",
  volume: "Volumen",
  cci: "CCI",
  williamsR: "Williams %R",
  mfi: "MFI",
  adx: "ADX / DMI",
  stochRsi: "Stochastic RSI",
  ao: "Awesome Oscillator",
  donchian: "Donchian Channels",
  keltner: "Keltner Channels",
  supertrend: "Supertrend",
  psar: "Parabolic SAR",
  pivots: "Pivot Points",
  ichimoku: "Ichimoku Cloud",
  vp: "Volume Profile",
};

export function IndicatorSettingsDialog() {
  const target = useChartStore((s) => s.settingsTarget);
  const setTarget = useChartStore((s) => s.setSettingsTarget);
  const config = useChartStore((s) => s.config);
  const setConfig = useChartStore((s) => s.setConfig);

  const open = target !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setTarget(null);
      }}
    >
      <DialogContent className="max-w-sm bg-tv-panel">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {target ? TITLES[target] : ""} — Configuración
          </DialogTitle>
        </DialogHeader>
        {target && (
          <SettingsForm
            target={target}
            config={config}
            onSave={(patch) => {
              setConfig(patch);
              setTarget(null);
            }}
            onReset={() => {
              setConfig(DEFAULT_CONFIG);
              setTarget(null);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface FormProps {
  target: IndicatorKey;
  config: typeof DEFAULT_CONFIG;
  onSave: (patch: Partial<typeof DEFAULT_CONFIG>) => void;
  onReset: () => void;
}

function SettingsForm({ target, config, onSave, onReset }: FormProps) {
  // Local draft state to avoid recalculating chart on every keystroke
  const [draft, setDraft] = useState({ ...config });

  useEffect(() => {
    setDraft({ ...config });
  }, [config, target]);

  function save() {
    if (target === "ema20") onSave({ ema20: clamp(draft.ema20, 2, 500) });
    else if (target === "ema50") onSave({ ema50: clamp(draft.ema50, 2, 500) });
    else if (target === "ema200") onSave({ ema200: clamp(draft.ema200, 2, 500) });
    else if (target === "sma20") onSave({ sma20: clamp(draft.sma20, 2, 500) });
    else if (target === "sma50") onSave({ sma50: clamp(draft.sma50, 2, 500) });
    else if (target === "bb")
      onSave({
        bbPeriod: clamp(draft.bbPeriod, 2, 500),
        bbStdDev: clamp(draft.bbStdDev, 1, 5),
      });
    else if (target === "atr") onSave({ atr: clamp(draft.atr, 2, 200) });
    else if (target === "stoch")
      onSave({
        stochK: clamp(draft.stochK, 2, 100),
        stochD: clamp(draft.stochD, 1, 50),
      });
    else if (target === "rsi") onSave({ rsi: clamp(draft.rsi, 2, 100) });
    else if (target === "cci") onSave({ cci: clamp(draft.cci, 2, 200) });
    else if (target === "williamsR")
      onSave({ williamsR: clamp(draft.williamsR, 2, 200) });
    else if (target === "mfi") onSave({ mfi: clamp(draft.mfi, 2, 200) });
    else if (target === "adx") onSave({ adx: clamp(draft.adx, 2, 100) });
    else if (target === "stochRsi")
      onSave({
        stochRsiRsi: clamp(draft.stochRsiRsi, 2, 100),
        stochRsiStoch: clamp(draft.stochRsiStoch, 2, 100),
      });
    else if (target === "ao")
      onSave({
        aoFast: clamp(draft.aoFast, 2, 100),
        aoSlow: clamp(draft.aoSlow, 3, 200),
      });
    else if (target === "donchian")
      onSave({ donchianPeriod: clamp(draft.donchianPeriod, 2, 500) });
    else if (target === "keltner")
      onSave({
        keltnerEma: clamp(draft.keltnerEma, 2, 200),
        keltnerAtr: clamp(draft.keltnerAtr, 2, 100),
        keltnerMult: clamp(draft.keltnerMult, 1, 10),
      });
    else if (target === "supertrend")
      onSave({
        supertrendAtr: clamp(draft.supertrendAtr, 2, 100),
        supertrendMult: clamp(draft.supertrendMult, 1, 20),
      });
    else if (target === "psar")
      onSave({
        psarStep: clamp(draft.psarStep, 0.001, 0.5),
        psarMax: clamp(draft.psarMax, 0.05, 1),
      });
    else if (target === "ichimoku")
      onSave({
        ichimokuTenkan: clamp(draft.ichimokuTenkan, 2, 100),
        ichimokuKijun: clamp(draft.ichimokuKijun, 2, 200),
        ichimokuSenkouB: clamp(draft.ichimokuSenkouB, 2, 300),
      });
    else if (target === "pivots") onSave({});
    else if (target === "vp")
      onSave({ vpBins: clamp(draft.vpBins, 6, 100) });
    else if (target === "macd")
      onSave({
        macdFast: clamp(draft.macdFast, 2, 100),
        macdSlow: clamp(draft.macdSlow, 2, 200),
        macdSignal: clamp(draft.macdSignal, 2, 100),
      });
    else if (
      target === "volume" ||
      target === "vwap" ||
      target === "obv"
    )
      onSave({});
  }

  return (
    <div className="flex flex-col gap-3">
      {(target === "ema20" ||
        target === "ema50" ||
        target === "ema200" ||
        target === "sma20" ||
        target === "sma50") && (
        <Field
          label="Período"
          value={draft[target]}
          onChange={(n) => setDraft((d) => ({ ...d, [target]: n }))}
        />
      )}
      {target === "bb" && (
        <div className="grid grid-cols-2 gap-2">
          <Field
            label="Período"
            value={draft.bbPeriod}
            onChange={(n) => setDraft((d) => ({ ...d, bbPeriod: n }))}
          />
          <Field
            label="Desv. estándar"
            value={draft.bbStdDev}
            onChange={(n) => setDraft((d) => ({ ...d, bbStdDev: n }))}
          />
        </div>
      )}
      {target === "rsi" && (
        <Field
          label="Período"
          value={draft.rsi}
          onChange={(n) => setDraft((d) => ({ ...d, rsi: n }))}
        />
      )}
      {target === "atr" && (
        <Field
          label="Período"
          value={draft.atr}
          onChange={(n) => setDraft((d) => ({ ...d, atr: n }))}
        />
      )}
      {(target === "cci" ||
        target === "williamsR" ||
        target === "mfi" ||
        target === "adx") && (
        <Field
          label="Período"
          value={draft[target]}
          onChange={(n) => setDraft((d) => ({ ...d, [target]: n }))}
        />
      )}
      {target === "stochRsi" && (
        <div className="grid grid-cols-2 gap-2">
          <Field
            label="RSI"
            value={draft.stochRsiRsi}
            onChange={(n) => setDraft((d) => ({ ...d, stochRsiRsi: n }))}
          />
          <Field
            label="Estocástico"
            value={draft.stochRsiStoch}
            onChange={(n) => setDraft((d) => ({ ...d, stochRsiStoch: n }))}
          />
        </div>
      )}
      {target === "ao" && (
        <div className="grid grid-cols-2 gap-2">
          <Field
            label="Rápida"
            value={draft.aoFast}
            onChange={(n) => setDraft((d) => ({ ...d, aoFast: n }))}
          />
          <Field
            label="Lenta"
            value={draft.aoSlow}
            onChange={(n) => setDraft((d) => ({ ...d, aoSlow: n }))}
          />
        </div>
      )}
      {target === "donchian" && (
        <Field
          label="Período"
          value={draft.donchianPeriod}
          onChange={(n) => setDraft((d) => ({ ...d, donchianPeriod: n }))}
        />
      )}
      {target === "keltner" && (
        <div className="grid grid-cols-3 gap-2">
          <Field
            label="EMA"
            value={draft.keltnerEma}
            onChange={(n) => setDraft((d) => ({ ...d, keltnerEma: n }))}
          />
          <Field
            label="ATR"
            value={draft.keltnerAtr}
            onChange={(n) => setDraft((d) => ({ ...d, keltnerAtr: n }))}
          />
          <Field
            label="Mult."
            value={draft.keltnerMult}
            onChange={(n) => setDraft((d) => ({ ...d, keltnerMult: n }))}
          />
        </div>
      )}
      {target === "supertrend" && (
        <div className="grid grid-cols-2 gap-2">
          <Field
            label="ATR"
            value={draft.supertrendAtr}
            onChange={(n) => setDraft((d) => ({ ...d, supertrendAtr: n }))}
          />
          <Field
            label="Multiplicador"
            value={draft.supertrendMult}
            onChange={(n) => setDraft((d) => ({ ...d, supertrendMult: n }))}
          />
        </div>
      )}
      {target === "psar" && (
        <div className="grid grid-cols-2 gap-2">
          <Field
            label="Step"
            float
            value={draft.psarStep}
            onChange={(n) => setDraft((d) => ({ ...d, psarStep: n }))}
          />
          <Field
            label="Máximo"
            float
            value={draft.psarMax}
            onChange={(n) => setDraft((d) => ({ ...d, psarMax: n }))}
          />
        </div>
      )}
      {target === "ichimoku" && (
        <div className="grid grid-cols-3 gap-2">
          <Field
            label="Tenkan"
            value={draft.ichimokuTenkan}
            onChange={(n) => setDraft((d) => ({ ...d, ichimokuTenkan: n }))}
          />
          <Field
            label="Kijun"
            value={draft.ichimokuKijun}
            onChange={(n) => setDraft((d) => ({ ...d, ichimokuKijun: n }))}
          />
          <Field
            label="Senkou B"
            value={draft.ichimokuSenkouB}
            onChange={(n) => setDraft((d) => ({ ...d, ichimokuSenkouB: n }))}
          />
        </div>
      )}
      {target === "vp" && (
        <Field
          label="Bins (niveles de precio)"
          value={draft.vpBins}
          onChange={(n) => setDraft((d) => ({ ...d, vpBins: n }))}
        />
      )}
      {target === "stoch" && (
        <div className="grid grid-cols-2 gap-2">
          <Field
            label="%K"
            value={draft.stochK}
            onChange={(n) => setDraft((d) => ({ ...d, stochK: n }))}
          />
          <Field
            label="%D"
            value={draft.stochD}
            onChange={(n) => setDraft((d) => ({ ...d, stochD: n }))}
          />
        </div>
      )}
      {target === "macd" && (
        <div className="grid grid-cols-3 gap-2">
          <Field
            label="Rápida"
            value={draft.macdFast}
            onChange={(n) => setDraft((d) => ({ ...d, macdFast: n }))}
          />
          <Field
            label="Lenta"
            value={draft.macdSlow}
            onChange={(n) => setDraft((d) => ({ ...d, macdSlow: n }))}
          />
          <Field
            label="Señal"
            value={draft.macdSignal}
            onChange={(n) => setDraft((d) => ({ ...d, macdSignal: n }))}
          />
        </div>
      )}
      {(target === "volume" ||
        target === "vwap" ||
        target === "obv" ||
        target === "pivots") && (
        <p className="text-xs text-tv-text-muted">
          Este indicador no tiene parámetros configurables.
        </p>
      )}

      <div className="mt-2 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="text-tv-text-muted hover:text-tv-text"
        >
          Reset defaults
        </Button>
        <Button size="sm" onClick={save} className="bg-tv-blue hover:bg-tv-blue/90">
          Aplicar
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  float,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  /** Si es true, acepta decimales (ej. step de Parabolic SAR). */
  float?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
        {label}
      </span>
      <Input
        type="number"
        min={float ? 0 : 2}
        max={float ? 1 : 500}
        step={float ? 0.01 : 1}
        value={value}
        onChange={(e) => {
          const n = float
            ? parseFloat(e.target.value)
            : parseInt(e.target.value, 10);
          if (!isNaN(n)) onChange(n);
        }}
        className="bg-tv-bg tabular-nums"
      />
    </label>
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
