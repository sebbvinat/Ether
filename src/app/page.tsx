"use client";

import { Header } from "@/components/layout/Header";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { BottomPanel } from "@/components/layout/BottomPanel";
import { ChartGrid } from "@/components/layout/ChartGrid";
import { IndicatorSettingsDialog } from "@/components/chart/IndicatorSettingsDialog";
import { useChartStore } from "@/lib/store/chart-store";

export default function HomePage() {
  const mobileLeftOpen = useChartStore((s) => s.mobileLeftOpen);
  const mobileRightOpen = useChartStore((s) => s.mobileRightOpen);
  const setMobileLeftOpen = useChartStore((s) => s.setMobileLeftOpen);
  const setMobileRightOpen = useChartStore((s) => s.setMobileRightOpen);

  const backdropOpen = mobileLeftOpen || mobileRightOpen;

  function closeAll() {
    setMobileLeftOpen(false);
    setMobileRightOpen(false);
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-tv-bg">
      <Header />
      <div className="relative flex min-h-0 flex-1">
        <LeftSidebar />
        <main className="relative flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <ChartGrid />
          </div>
        </main>
        <RightSidebar />
        {backdropOpen && (
          <button
            type="button"
            aria-label="Cerrar paneles"
            onClick={closeAll}
            className="absolute inset-0 z-20 bg-black/40 md:hidden"
          />
        )}
      </div>
      <BottomPanel />
      <IndicatorSettingsDialog />
    </div>
  );
}
