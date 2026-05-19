"use client";

import { useEffect, useState } from "react";
import { Minimize2 } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { BottomPanel } from "@/components/layout/BottomPanel";
import { BottomTabs } from "@/components/layout/BottomTabs";
import { TabsBar } from "@/components/layout/TabsBar";
import { ChartGrid } from "@/components/layout/ChartGrid";
import { ReplayBar } from "@/components/chart/ReplayBar";
import { IndicatorSettingsDialog } from "@/components/chart/IndicatorSettingsDialog";
import { InstallBanner } from "@/components/layout/InstallBanner";
import { StatusBar } from "@/components/layout/StatusBar";
import { PineEditor } from "@/components/pine/PineEditor";
import { BacktestDialog } from "@/components/backtest/BacktestDialog";
import { useChartStore } from "@/lib/store/chart-store";

export default function HomePage() {
  const mobileLeftOpen = useChartStore((s) => s.mobileLeftOpen);
  const mobileRightOpen = useChartStore((s) => s.mobileRightOpen);
  const setMobileLeftOpen = useChartStore((s) => s.setMobileLeftOpen);
  const setMobileRightOpen = useChartStore((s) => s.setMobileRightOpen);
  const focusMode = useChartStore((s) => s.focusMode);
  const setFocusMode = useChartStore((s) => s.setFocusMode);
  const cleanMode = useChartStore((s) => s.cleanMode);
  const setCleanMode = useChartStore((s) => s.setCleanMode);
  const toggleCleanMode = useChartStore((s) => s.toggleCleanMode);
  const toggleHideLegend = useChartStore((s) => s.toggleHideLegend);
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);

  const [pineOpen, setPineOpen] = useState(false);
  const [backtestOpen, setBacktestOpen] = useState(false);
  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);

  // Pine / Backtest open via window events (dispatched from header/menu)
  useEffect(() => {
    const openPine = () => setPineOpen(true);
    const openBt = () => setBacktestOpen(true);
    window.addEventListener("ether:open-pine", openPine);
    window.addEventListener("ether:open-backtest", openBt);
    return () => {
      window.removeEventListener("ether:open-pine", openPine);
      window.removeEventListener("ether:open-backtest", openBt);
    };
  }, []);

  // Global keyboard shortcuts: Z clean · F focus · H hide-legend · Alt+R replay · Esc cascade
  useEffect(() => {
    const isTyping = (el: EventTarget | null): boolean => {
      const n = el as HTMLElement | null;
      return (
        !!n &&
        (n.tagName === "INPUT" ||
          n.tagName === "TEXTAREA" ||
          n.isContentEditable === true)
      );
    };
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(document.activeElement)) return;
      const k = e.key.toLowerCase();
      if (e.key === "Escape") {
        if (cleanMode) setCleanMode(false);
        else if (focusMode) setFocusMode(false);
        else if (tool !== "cursor") setTool("cursor");
        return;
      }
      if (e.metaKey || e.ctrlKey) return;
      if (k === "r" && e.altKey) {
        e.preventDefault();
        const st = useChartStore.getState();
        if (st.replay.active) st.stopReplay();
        else
          window.dispatchEvent(
            new CustomEvent("ether:start-replay", {
              detail: { slotId: st.activeSlotId },
            }),
          );
        return;
      }
      if (e.altKey) return;
      if (k === "z") toggleCleanMode();
      else if (k === "f") setFocusMode(!focusMode);
      else if (k === "h") toggleHideLegend();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    cleanMode,
    focusMode,
    tool,
    setCleanMode,
    setFocusMode,
    setTool,
    toggleCleanMode,
    toggleHideLegend,
  ]);

  const backdropOpen = mobileLeftOpen || mobileRightOpen;
  const chromeHidden = focusMode || cleanMode;

  function closeAll() {
    setMobileLeftOpen(false);
    setMobileRightOpen(false);
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-tv-bg">
      {!chromeHidden && <TabsBar />}
      {!chromeHidden && <Header />}
      <div className="relative flex min-h-0 flex-1">
        {!chromeHidden && <LeftSidebar />}
        <main className="relative flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <ChartGrid />
          </div>
          {chromeHidden && (
            <button
              onClick={() => {
                setCleanMode(false);
                setFocusMode(false);
              }}
              className="absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded-full bg-tv-panel/90 px-3 py-1.5 text-xs text-tv-text-muted shadow-lg ring-1 ring-tv-border backdrop-blur hover:text-tv-text"
              title="Salir (Esc)"
              aria-label="Salir del modo enfoque"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              <span>Salir</span>
              <span className="rounded bg-tv-bg px-1 py-px text-[10px]">Esc</span>
            </button>
          )}
        </main>
        {!chromeHidden && <RightSidebar />}
        {backdropOpen && (
          <button
            type="button"
            aria-label="Cerrar paneles"
            onClick={closeAll}
            className="absolute inset-0 z-20 bg-black/40 md:hidden"
          />
        )}
      </div>
      {!chromeHidden && <ReplayBar />}
      {!chromeHidden && <BottomPanel />}
      {!chromeHidden && <StatusBar />}
      <BottomTabs />
      <IndicatorSettingsDialog />
      <InstallBanner />
      <PineEditor open={pineOpen} onClose={() => setPineOpen(false)} />
      <BacktestDialog
        open={backtestOpen}
        onClose={() => setBacktestOpen(false)}
        symbol={symbol}
        timeframe={timeframe}
      />
    </div>
  );
}
