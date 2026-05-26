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
import { DataWindow } from "@/components/chart/DataWindow";
import { DrawingPropertiesDialog } from "@/components/chart/DrawingPropertiesDialog";
import { DrawingAlertsToast } from "@/components/alerts/DrawingAlertsToast";
import { useChartStore } from "@/lib/store/chart-store";
import { matchesCombo, isTypingTarget, type ShortcutAction } from "@/lib/shortcuts";

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
  const theme = useChartStore((s) => s.theme);

  // Apply theme class to <html> (default dark needs no class; .light overrides)
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light", theme === "light");
    root.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const [pineOpen, setPineOpen] = useState(false);
  const [backtestOpen, setBacktestOpen] = useState(false);
  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);

  // Pine / Backtest open via window events (dispatched from header/menu)
  useEffect(() => {
    const openPine = () => setPineOpen(true);
    const openBt = () => setBacktestOpen(true);
    // Doble click sobre el chart bg dispara este evento → toggle focus.
    const toggleFocus = () => {
      const s = useChartStore.getState();
      s.setFocusMode(!s.focusMode);
    };
    window.addEventListener("ether:open-pine", openPine);
    window.addEventListener("ether:open-backtest", openBt);
    window.addEventListener("ether:focus-toggle", toggleFocus);
    return () => {
      window.removeEventListener("ether:open-pine", openPine);
      window.removeEventListener("ether:open-backtest", openBt);
      window.removeEventListener("ether:focus-toggle", toggleFocus);
    };
  }, []);

  // Global keyboard shortcuts — Wave 15: configurables vía store.shortcuts.
  // Esc se mantiene hardcoded como cascada de "salir" (no es rebindeable).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(document.activeElement)) return;
      if (e.key === "Escape") {
        if (cleanMode) setCleanMode(false);
        else if (focusMode) setFocusMode(false);
        else if (tool !== "cursor") setTool("cursor");
        return;
      }
      const st = useChartStore.getState();
      const shortcuts = st.shortcuts as Record<ShortcutAction, string>;
      // Recorre cada acción y dispara la primera que matchee
      for (const action of Object.keys(shortcuts) as ShortcutAction[]) {
        const combo = shortcuts[action];
        if (!combo) continue;
        if (!matchesCombo(e, combo)) continue;
        e.preventDefault();
        runShortcut(action);
        return;
      }
    };
    function runShortcut(action: ShortcutAction) {
      const st = useChartStore.getState();
      switch (action) {
        case "cleanMode":
          st.toggleCleanMode();
          break;
        case "focusMode":
          st.setFocusMode(!st.focusMode);
          break;
        case "hideLegend":
          st.toggleHideLegend();
          break;
        case "replay":
          if (st.replay.active) st.stopReplay();
          else
            window.dispatchEvent(
              new CustomEvent("ether:start-replay", {
                detail: { slotId: st.activeSlotId },
              }),
            );
          break;
        case "openPine":
          window.dispatchEvent(new CustomEvent("ether:open-pine"));
          break;
        case "openBacktest":
          window.dispatchEvent(new CustomEvent("ether:open-backtest"));
          break;
        case "openIndicators":
          window.dispatchEvent(new CustomEvent("ether:open-indicators"));
          break;
        case "openLayers":
          window.dispatchEvent(new CustomEvent("ether:open-layers"));
          break;
        case "toggleLockDrawings":
          st.toggleLockDrawings();
          break;
        case "toggleHideDrawings":
          st.toggleHideDrawings();
          break;
        case "toggleMagnet":
          st.toggleMagnetMode();
          break;
        case "screenshot":
          window.dispatchEvent(
            new CustomEvent("ether:capture", {
              detail: { slotId: st.activeSlotId },
            }),
          );
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    cleanMode,
    focusMode,
    tool,
    setCleanMode,
    setFocusMode,
    setTool,
  ]);

  const backdropOpen = mobileLeftOpen || mobileRightOpen;
  // Z (cleanMode): oculta TODO el chrome — para capturas o vista pelada.
  // F (focusMode): oculta el panel inferior + tabs + status bar pero
  // mantiene header, sidebars y toolbar. Pensado para concentrarse en el
  // chart sin perder los controles.
  const chromeHidden = cleanMode;
  const bottomHidden = cleanMode || focusMode;
  const sideChromeHidden = cleanMode;

  function closeAll() {
    setMobileLeftOpen(false);
    setMobileRightOpen(false);
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-tv-bg">
      {!bottomHidden && <TabsBar />}
      {!chromeHidden && <Header />}
      <div className="relative flex min-h-0 flex-1">
        {!sideChromeHidden && <LeftSidebar />}
        <main className="relative flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <ChartGrid />
          </div>
          <DataWindow />
          {(focusMode || cleanMode) && (
            <button
              onClick={() => {
                setCleanMode(false);
                setFocusMode(false);
              }}
              className="absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded-full bg-tv-panel/90 px-3 py-1.5 text-xs text-tv-text-muted shadow-lg ring-1 ring-tv-border backdrop-blur hover:text-tv-text"
              title="Salir (Esc)"
              aria-label="Salir del modo enfoque/limpio"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              <span>Salir</span>
              <span className="rounded bg-tv-bg px-1 py-px text-[10px]">Esc</span>
            </button>
          )}
        </main>
        {!sideChromeHidden && <RightSidebar />}
        {backdropOpen && (
          <button
            type="button"
            aria-label="Cerrar paneles"
            onClick={closeAll}
            className="absolute inset-0 z-20 bg-black/40 md:hidden"
          />
        )}
      </div>
      {!bottomHidden && <ReplayBar />}
      {!bottomHidden && <BottomPanel />}
      {!bottomHidden && <StatusBar />}
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
      <DrawingPropertiesDialog />
      <DrawingAlertsToast />
    </div>
  );
}
