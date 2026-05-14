"use client";

import { useEffect } from "react";
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
import { useChartStore } from "@/lib/store/chart-store";

export default function HomePage() {
  const mobileLeftOpen = useChartStore((s) => s.mobileLeftOpen);
  const mobileRightOpen = useChartStore((s) => s.mobileRightOpen);
  const setMobileLeftOpen = useChartStore((s) => s.setMobileLeftOpen);
  const setMobileRightOpen = useChartStore((s) => s.setMobileRightOpen);
  const focusMode = useChartStore((s) => s.focusMode);
  const setFocusMode = useChartStore((s) => s.setFocusMode);

  // Esc exits focus mode
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode, setFocusMode]);

  const backdropOpen = mobileLeftOpen || mobileRightOpen;

  function closeAll() {
    setMobileLeftOpen(false);
    setMobileRightOpen(false);
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-tv-bg">
      {!focusMode && <TabsBar />}
      {!focusMode && <Header />}
      <div className="relative flex min-h-0 flex-1">
        {!focusMode && <LeftSidebar />}
        <main className="relative flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <ChartGrid />
          </div>
          {focusMode && (
            <button
              onClick={() => setFocusMode(false)}
              className="absolute right-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-tv-panel/90 text-tv-text-muted shadow-lg ring-1 ring-tv-border backdrop-blur hover:text-tv-text"
              title="Salir del modo enfoque (Esc)"
              aria-label="Salir del modo enfoque"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
          )}
        </main>
        {!focusMode && <RightSidebar />}
        {backdropOpen && (
          <button
            type="button"
            aria-label="Cerrar paneles"
            onClick={closeAll}
            className="absolute inset-0 z-20 bg-black/40 md:hidden"
          />
        )}
      </div>
      {!focusMode && <ReplayBar />}
      {!focusMode && <BottomPanel />}
      <BottomTabs />
      <IndicatorSettingsDialog />
    </div>
  );
}
