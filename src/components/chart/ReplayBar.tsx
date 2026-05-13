"use client";

import { useEffect } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  StepForward,
  StepBack,
  X,
} from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

const SPEEDS = [
  { label: "0.5×", ms: 1000 },
  { label: "1×", ms: 500 },
  { label: "2×", ms: 250 },
  { label: "4×", ms: 125 },
  { label: "8×", ms: 60 },
];

export function ReplayBar() {
  const replay = useChartStore((s) => s.replay);
  const setReplayIndex = useChartStore((s) => s.setReplayIndex);
  const setReplayPlaying = useChartStore((s) => s.setReplayPlaying);
  const setReplaySpeed = useChartStore((s) => s.setReplaySpeed);
  const stepReplay = useChartStore((s) => s.stepReplay);
  const stopReplay = useChartStore((s) => s.stopReplay);

  // Auto-step while playing
  useEffect(() => {
    if (!replay.active || !replay.playing) return;
    const id = setInterval(() => stepReplay(), replay.intervalMs);
    return () => clearInterval(id);
  }, [replay.active, replay.playing, replay.intervalMs, stepReplay]);

  // Keyboard controls
  useEffect(() => {
    if (!replay.active) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA"))
        return;
      if (e.key === " ") {
        e.preventDefault();
        setReplayPlaying(!replay.playing);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        stepReplay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setReplayIndex(replay.index - 1);
      } else if (e.key === "Escape") {
        stopReplay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    replay.active,
    replay.playing,
    replay.index,
    setReplayPlaying,
    stepReplay,
    setReplayIndex,
    stopReplay,
  ]);

  if (!replay.active) return null;

  const progress = replay.total > 0 ? (replay.index / (replay.total - 1)) * 100 : 0;

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-t border-tv-border bg-tv-panel px-3 text-xs">
      <span className="flex items-center gap-1.5 rounded bg-tv-yellow/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-tv-yellow">
        <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tv-yellow" />
        Replay
      </span>

      <button
        onClick={() => setReplayIndex(0)}
        title="Inicio"
        className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <SkipBack className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => setReplayIndex(replay.index - 1)}
        title="Anterior (←)"
        className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <StepBack className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => setReplayPlaying(!replay.playing)}
        title={replay.playing ? "Pausa (Space)" : "Play (Space)"}
        className="flex h-7 w-7 items-center justify-center rounded bg-tv-blue text-white hover:bg-tv-blue/90"
      >
        {replay.playing ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        onClick={() => stepReplay()}
        title="Siguiente (→)"
        className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <StepForward className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => setReplayIndex(replay.total - 1)}
        title="Fin"
        className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <SkipForward className="h-3.5 w-3.5" />
      </button>

      <div className="ml-2 flex flex-1 items-center gap-2">
        <input
          type="range"
          min={0}
          max={Math.max(0, replay.total - 1)}
          value={replay.index}
          onChange={(e) => setReplayIndex(Number(e.target.value))}
          className="h-1 flex-1 accent-tv-blue"
        />
        <span className="tabular-nums text-tv-text-muted">
          {replay.index + 1}/{replay.total}
        </span>
      </div>

      <div className="flex items-center gap-0.5 rounded bg-tv-bg p-0.5">
        {SPEEDS.map((s) => (
          <button
            key={s.ms}
            onClick={() => setReplaySpeed(s.ms)}
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium",
              replay.intervalMs === s.ms
                ? "bg-tv-panel-hover text-tv-text"
                : "text-tv-text-muted hover:bg-tv-panel-hover",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <button
        onClick={stopReplay}
        title="Salir (Esc)"
        className="ml-1 flex items-center gap-1 rounded px-2 py-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <X className="h-3.5 w-3.5" />
        <span>Salir</span>
      </button>

      <div className="ml-auto" style={{ width: `${progress.toFixed(1)}%` }} />
    </div>
  );
}
