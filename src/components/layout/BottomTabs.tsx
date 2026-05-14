"use client";

import { useState } from "react";
import {
  LineChart,
  Star,
  Compass,
  Bell,
  Menu as MenuIcon,
} from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import { AlertsDialog } from "@/components/alerts/AlertsDialog";
import { ScannerDialog } from "@/components/scanner/ScannerDialog";
import { cn } from "@/lib/utils";

/**
 * TradingView-style bottom tab bar, visible only on mobile.
 * Tabs: Watchlist (Lista) / Chart / Markets (Scanner) / Alerts / Menu (tools)
 */
export function BottomTabs() {
  const mobileRightOpen = useChartStore((s) => s.mobileRightOpen);
  const mobileLeftOpen = useChartStore((s) => s.mobileLeftOpen);
  const setMobileRightOpen = useChartStore((s) => s.setMobileRightOpen);
  const setMobileLeftOpen = useChartStore((s) => s.setMobileLeftOpen);
  const focusMode = useChartStore((s) => s.focusMode);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  if (focusMode) return null;

  const onChart = !mobileRightOpen && !mobileLeftOpen && !alertsOpen && !scannerOpen;

  return (
    <>
      <nav
        className="z-30 flex h-14 shrink-0 items-center border-t border-tv-border bg-tv-panel md:hidden"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0)",
          height: "calc(56px + env(safe-area-inset-bottom, 0))",
        }}
      >
        <Tab
          icon={<Star className="h-5 w-5" strokeWidth={1.75} />}
          label="Lista"
          active={mobileRightOpen}
          onClick={() => {
            setMobileLeftOpen(false);
            setMobileRightOpen(!mobileRightOpen);
          }}
        />
        <Tab
          icon={<LineChart className="h-5 w-5" strokeWidth={1.75} />}
          label="Gráfico"
          active={onChart}
          onClick={() => {
            setMobileLeftOpen(false);
            setMobileRightOpen(false);
          }}
        />
        <Tab
          icon={<Compass className="h-5 w-5" strokeWidth={1.75} />}
          label="Mercados"
          active={scannerOpen}
          onClick={() => setScannerOpen(true)}
        />
        <Tab
          icon={<Bell className="h-5 w-5" strokeWidth={1.75} />}
          label="Alertas"
          active={alertsOpen}
          onClick={() => setAlertsOpen(true)}
        />
        <Tab
          icon={<MenuIcon className="h-5 w-5" strokeWidth={1.75} />}
          label="Herram."
          active={mobileLeftOpen}
          onClick={() => {
            setMobileRightOpen(false);
            setMobileLeftOpen(!mobileLeftOpen);
          }}
        />
      </nav>
      <AlertsDialog open={alertsOpen} onOpenChange={setAlertsOpen} />
      <ScannerDialog open={scannerOpen} onOpenChange={setScannerOpen} />
    </>
  );
}

function Tab({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-medium transition-colors",
        active ? "text-tv-blue" : "text-tv-text-muted active:text-tv-text",
      )}
    >
      {icon}
      <span className="leading-none">{label}</span>
    </button>
  );
}
