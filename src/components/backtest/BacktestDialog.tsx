"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, X } from "lucide-react";

type Strategy = { id: string; name: string; params: string[] };

const STRATEGIES: Strategy[] = [
  { id: "ema-cross", name: "Cruce EMA 20/50", params: ["EMA rápida=20", "EMA lenta=50", "Riesgo=1%"] },
  { id: "bb-breakout", name: "Breakout Bollinger", params: ["Periodo=20", "Desv=2σ"] },
  { id: "rsi-revert", name: "Reversión RSI", params: ["RSI=14", "OB=70", "OS=30"] },
  { id: "macd-cross", name: "Cruce MACD", params: ["12,26,9"] },
  { id: "vwap-bands", name: "VWAP ± σ", params: ["20"] },
];

// Deterministic equity curve based on strategy id + symbol (djb2 hash -> LCG RNG)
function makeCurve(seed: string, points = 120): number[] {
  let h = (typeof seed === "string" ? seed : "abc")
    .split("")
    .reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 5381);
  const rand = () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  };
  const out = [10000];
  const drift = (rand() - 0.45) * 0.008 + 0.0015;
  for (let i = 1; i < points; i++) {
    const shock = (rand() - 0.5) * 0.025;
    out.push(out[i - 1] * (1 + drift + shock));
  }
  return out;
}

type Metrics = {
  pnl: number;
  maxDD: number;
  sharpe: number;
  trades: number;
  wins: number;
  winRate: number;
  profitFactor: number;
  avgTrade: number;
};

function metricsFromCurve(curve: number[]): Metrics {
  const final = curve[curve.length - 1];
  const initial = curve[0];
  const pnl = (final - initial) / initial;
  // max drawdown
  let peak = initial;
  let maxDD = 0;
  for (const v of curve) {
    if (v > peak) peak = v;
    const dd = (v - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }
  // returns array
  const rets: number[] = [];
  for (let i = 1; i < curve.length; i++) rets.push((curve[i] - curve[i - 1]) / curve[i - 1]);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const std = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;
  const trades = 40 + Math.round(curve.length * 0.3);
  const wins = Math.round(trades * (0.45 + (pnl > 0 ? 0.15 : -0.05) + (sharpe > 1 ? 0.05 : 0)));
  return {
    pnl,
    maxDD,
    sharpe,
    trades,
    wins,
    winRate: wins / trades,
    profitFactor: pnl > 0 ? 1.1 + Math.abs(pnl) * 4 : 0.6 + Math.abs(pnl) * 1.2,
    avgTrade: (final - initial) / trades,
  };
}

export function BacktestDialog({
  open,
  onClose,
  symbol,
  timeframe,
}: {
  open: boolean;
  onClose: () => void;
  symbol: string;
  timeframe: string;
}) {
  const [stratId, setStratId] = useState("ema-cross");
  const [from, setFrom] = useState("2024-01-01");
  const [to, setTo] = useState("2024-12-31");
  const [capital, setCapital] = useState(10000);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open, onClose]);

  const seed = `${stratId}:${symbol}:${timeframe}:${from}:${to}`;
  const curve = useMemo(() => makeCurve(seed, 140), [seed]);
  const m = useMemo(() => metricsFromCurve(curve), [curve]);
  const strat = STRATEGIES.find((s) => s.id === stratId) ?? STRATEGIES[0];

  if (!open) return null;

  const run = () => {
    setRunning(true);
    setTimeout(() => {
      setRunning(false);
    }, 700);
  };

  // SVG equity curve
  const w = 720;
  const h = 220;
  const mn = Math.min(...curve);
  const mx = Math.max(...curve);
  const xOf = (i: number) => 20 + (i / (curve.length - 1)) * (w - 40);
  const yOf = (v: number) => 12 + (1 - (v - mn) / (mx - mn || 1)) * (h - 32);
  const pts = curve.map((v, i) => `${xOf(i)},${yOf(v)}`).join(" ");
  const areaPts = `${pts} ${w - 20},${h - 20} 20,${h - 20}`;

  const up = m.pnl >= 0;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="flex h-[min(700px,90vh)] w-[min(1100px,94vw)] flex-col overflow-hidden rounded-lg border border-[#2a2e39] bg-[#1e222d] text-[#d1d4dc]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Head */}
        <div className="flex items-center gap-[14px] border-b border-[#2a2e39] bg-[#131722] px-[14px] py-[10px]">
          <span className="text-[14px] font-semibold">Probador de estrategias</span>
          <span className="text-[12px] text-[#787b86]">
            {symbol} · {timeframe}
          </span>
          <div className="ml-auto flex items-center gap-[6px]">
            <button
              className="flex items-center gap-1 rounded-sm border border-[#2962ff] bg-[#2962ff] px-[10px] py-[4px] text-[11px] font-semibold text-[#0b0d10] disabled:opacity-70"
              onClick={run}
              disabled={running}
            >
              {running ? (
                "Corriendo…"
              ) : (
                <>
                  <Play size={11} fill="currentColor" /> Ejecutar backtest
                </>
              )}
            </button>
            <button
              className="appearance-none border-none bg-transparent text-[#787b86] hover:text-[#d1d4dc]"
              onClick={onClose}
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr] overflow-hidden">
          {/* Side */}
          <aside className="overflow-auto border-r border-[#2a2e39] bg-[#131722] p-[12px]">
            <div className="mb-[6px] mt-0 text-[10px] uppercase tracking-[0.10em] text-[#787b86]">
              Estrategia
            </div>
            <select
              className="mb-3 w-full rounded-sm border border-[#2a2e39] bg-[#131722] px-2 py-1 text-[11px] text-[#d1d4dc]"
              value={stratId}
              onChange={(e) => setStratId(e.target.value)}
            >
              {STRATEGIES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div className="mb-[6px] flex flex-col gap-[2px]">
              {strat.params.map((p, i) => (
                <div
                  key={i}
                  className="border-l-2 border-[#2962ff] bg-[#2a2e39] px-[6px] py-[2px] text-[10px] text-[#d1d4dc]"
                >
                  {p}
                </div>
              ))}
            </div>

            <div className="mb-[6px] mt-[14px] text-[10px] uppercase tracking-[0.10em] text-[#787b86]">
              Periodo
            </div>
            <div className="mb-[6px] flex items-center justify-between gap-2 text-[11px]">
              <label className="flex-1 text-[#787b86]">Desde</label>
              <input
                type="date"
                className="min-w-[110px] rounded-sm border border-[#2a2e39] bg-[#131722] px-2 py-1 text-[11px] text-[#d1d4dc]"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="mb-[6px] flex items-center justify-between gap-2 text-[11px]">
              <label className="flex-1 text-[#787b86]">Hasta</label>
              <input
                type="date"
                className="min-w-[110px] rounded-sm border border-[#2a2e39] bg-[#131722] px-2 py-1 text-[11px] text-[#d1d4dc]"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>

            <div className="mb-[6px] mt-[14px] text-[10px] uppercase tracking-[0.10em] text-[#787b86]">
              Capital
            </div>
            <div className="mb-[6px] flex items-center justify-between gap-2 text-[11px]">
              <label className="flex-1 text-[#787b86]">Inicial USD</label>
              <input
                type="number"
                className="min-w-[110px] rounded-sm border border-[#2a2e39] bg-[#131722] px-2 py-1 text-[11px] font-mono text-[#d1d4dc]"
                value={capital}
                onChange={(e) => setCapital(+e.target.value)}
              />
            </div>
            <div className="mb-[6px] flex items-center justify-between gap-2 text-[11px]">
              <label className="flex-1 text-[#787b86]">Tamaño %</label>
              <input
                type="number"
                className="min-w-[110px] rounded-sm border border-[#2a2e39] bg-[#131722] px-2 py-1 text-[11px] font-mono text-[#d1d4dc]"
                defaultValue={100}
              />
            </div>
            <div className="mb-[6px] flex items-center justify-between gap-2 text-[11px]">
              <label className="flex-1 text-[#787b86]">Comisión %</label>
              <input
                type="number"
                className="min-w-[110px] rounded-sm border border-[#2a2e39] bg-[#131722] px-2 py-1 text-[11px] font-mono text-[#d1d4dc]"
                defaultValue={0.05}
                step={0.01}
              />
            </div>
            <div className="mb-[6px] flex items-center justify-between gap-2 text-[11px]">
              <label className="flex-1 text-[#787b86]">Slippage bp</label>
              <input
                type="number"
                className="min-w-[110px] rounded-sm border border-[#2a2e39] bg-[#131722] px-2 py-1 text-[11px] font-mono text-[#d1d4dc]"
                defaultValue={2}
              />
            </div>
          </aside>

          {/* Content */}
          <div className="overflow-auto p-[16px]">
            {/* Metrics */}
            <div className="grid grid-cols-4 gap-px overflow-hidden rounded-sm bg-[#2a2e39]">
              <div className="flex flex-col gap-[2px] bg-[#1e222d] px-[12px] py-[10px]">
                <span className="text-[9px] uppercase tracking-[0.08em] text-[#787b86]">
                  P&amp;L Neto
                </span>
                <span
                  className={`font-mono text-[18px] font-semibold tabular-nums ${
                    up ? "text-[#26a69a]" : "text-[#ef5350]"
                  }`}
                >
                  {(up ? "+" : "") + (m.pnl * 100).toFixed(2)}%
                </span>
              </div>
              <div className="flex flex-col gap-[2px] bg-[#1e222d] px-[12px] py-[10px]">
                <span className="text-[9px] uppercase tracking-[0.08em] text-[#787b86]">
                  Capital final
                </span>
                <span className="font-mono text-[18px] font-semibold tabular-nums text-[#d1d4dc]">
                  ${curve[curve.length - 1].toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex flex-col gap-[2px] bg-[#1e222d] px-[12px] py-[10px]">
                <span className="text-[9px] uppercase tracking-[0.08em] text-[#787b86]">
                  Sharpe
                </span>
                <span className="font-mono text-[18px] font-semibold tabular-nums text-[#d1d4dc]">
                  {m.sharpe.toFixed(2)}
                </span>
              </div>
              <div className="flex flex-col gap-[2px] bg-[#1e222d] px-[12px] py-[10px]">
                <span className="text-[9px] uppercase tracking-[0.08em] text-[#787b86]">
                  Drawdown máx
                </span>
                <span className="font-mono text-[18px] font-semibold tabular-nums text-[#ef5350]">
                  {(m.maxDD * 100).toFixed(2)}%
                </span>
              </div>
              <div className="flex flex-col gap-[2px] bg-[#1e222d] px-[12px] py-[10px]">
                <span className="text-[9px] uppercase tracking-[0.08em] text-[#787b86]">
                  Win Rate
                </span>
                <span className="font-mono text-[18px] font-semibold tabular-nums text-[#d1d4dc]">
                  {(m.winRate * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex flex-col gap-[2px] bg-[#1e222d] px-[12px] py-[10px]">
                <span className="text-[9px] uppercase tracking-[0.08em] text-[#787b86]">
                  Profit Factor
                </span>
                <span className="font-mono text-[18px] font-semibold tabular-nums text-[#d1d4dc]">
                  {m.profitFactor.toFixed(2)}
                </span>
              </div>
              <div className="flex flex-col gap-[2px] bg-[#1e222d] px-[12px] py-[10px]">
                <span className="text-[9px] uppercase tracking-[0.08em] text-[#787b86]">
                  Trades
                </span>
                <span className="font-mono text-[18px] font-semibold tabular-nums text-[#d1d4dc]">
                  {m.trades}
                </span>
              </div>
              <div className="flex flex-col gap-[2px] bg-[#1e222d] px-[12px] py-[10px]">
                <span className="text-[9px] uppercase tracking-[0.08em] text-[#787b86]">
                  Ganadoras / Perdedoras
                </span>
                <span className="font-mono text-[18px] font-semibold tabular-nums text-[#d1d4dc]">
                  {m.wins} / {m.trades - m.wins}
                </span>
              </div>
            </div>

            <div className="mb-[6px] mt-[14px] text-[10px] uppercase tracking-[0.10em] text-[#787b86]">
              Curva de capital
            </div>
            <svg
              className="mb-[12px] h-[220px] w-full border border-[#2a2e39] bg-[#1e222d]"
              viewBox={`0 0 ${w} ${h}`}
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="bt-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={up ? "rgba(34,211,160,0.45)" : "rgba(239,68,68,0.45)"}
                  />
                  <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                </linearGradient>
              </defs>
              {[0.25, 0.5, 0.75].map((t) => (
                <line
                  key={t}
                  x1={20}
                  x2={w - 20}
                  y1={12 + t * (h - 32)}
                  y2={12 + t * (h - 32)}
                  stroke="rgba(255,255,255,0.06)"
                />
              ))}
              <polygon points={areaPts} fill="url(#bt-grad)" />
              <polyline
                points={pts}
                fill="none"
                stroke={up ? "#22d3a0" : "#ef4444"}
                strokeWidth="1.6"
              />
              <text
                x={20}
                y={h - 4}
                fontFamily="Trebuchet MS, sans-serif"
                fontSize="10"
                fill="rgba(255,255,255,0.5)"
              >
                {from}
              </text>
              <text
                x={w - 60}
                y={h - 4}
                fontFamily="Trebuchet MS, sans-serif"
                fontSize="10"
                fill="rgba(255,255,255,0.5)"
              >
                {to}
              </text>
              <text
                x={w - 20}
                y={16}
                fontFamily="Trebuchet MS, sans-serif"
                fontSize="10"
                fill="rgba(255,255,255,0.5)"
                textAnchor="end"
              >
                ${mx.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </text>
              <text
                x={w - 20}
                y={h - 22}
                fontFamily="Trebuchet MS, sans-serif"
                fontSize="10"
                fill="rgba(255,255,255,0.5)"
                textAnchor="end"
              >
                ${mn.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </text>
            </svg>

            <div className="mb-[6px] mt-[14px] text-[10px] uppercase tracking-[0.10em] text-[#787b86]">
              Últimos trades
            </div>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  {["#", "Fecha", "Lado", "Entrada", "Salida", "P&L", "R"].map((th) => (
                    <th
                      key={th}
                      className="border-b border-[#2a2e39] px-2 py-[5px] text-left text-[9px] uppercase tracking-[0.08em] text-[#787b86]"
                    >
                      {th}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 8 }).map((_, i) => {
                  const side = i % 3 === 0 ? "SHORT" : "LONG";
                  const pnl = (Math.sin(i * 1.7) + Math.cos(i * 0.4)) * 1.5;
                  const isW = pnl > 0;
                  return (
                    <tr key={i} className="hover:[&>td]:bg-[#1e222d]">
                      <td className="border-b border-[#2a2e39] px-2 py-[5px] text-left text-[#787b86]">
                        {m.trades - i}
                      </td>
                      <td className="border-b border-[#2a2e39] px-2 py-[5px] text-left font-mono text-[#787b86]">
                        2024-{String(12 - i).padStart(2, "0")}-{((15 - i + 28) % 28) + 1}
                      </td>
                      <td className="border-b border-[#2a2e39] px-2 py-[5px] text-left">
                        <span className={side === "LONG" ? "text-[#26a69a]" : "text-[#ef5350]"}>
                          {side}
                        </span>
                      </td>
                      <td className="border-b border-[#2a2e39] px-2 py-[5px] text-left font-mono">
                        ${(67000 + i * 200).toFixed(2)}
                      </td>
                      <td className="border-b border-[#2a2e39] px-2 py-[5px] text-left font-mono">
                        ${(67000 + i * 200 + pnl * 200).toFixed(2)}
                      </td>
                      <td
                        className={`border-b border-[#2a2e39] px-2 py-[5px] text-left font-mono ${
                          isW ? "text-[#26a69a]" : "text-[#ef5350]"
                        }`}
                      >
                        {(isW ? "+" : "") + (pnl * 100).toFixed(2)}%
                      </td>
                      <td
                        className={`border-b border-[#2a2e39] px-2 py-[5px] text-left font-mono ${
                          isW ? "text-[#26a69a]" : "text-[#ef5350]"
                        }`}
                      >
                        {(isW ? "+" : "") + pnl.toFixed(2)}R
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
