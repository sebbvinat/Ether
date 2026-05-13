"use client";

import { useState } from "react";
import {
  LineChart,
  List,
  Radar,
  Bell,
  Menu as MenuIcon,
} from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import { AlertsDialog } from "@/components/alerts/AlertsDialog";
import { ScannerDialog } from "@/components/scanner/ScannerDialog";
import { cn } from "@/lib/utils";

/**
 * Native-app-style bottom tab bar — visible only on mobile.
 * Doesn't switch routes; it toggles overlay panels.
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

  const tabIsChart = !mobileRightOpen && !mobileLeftOpen;

  return (
    <>
      <nav className="flex h-12 shrink-0 items-center justify-around border-t border-tv-border bg-tv-panel md:hidden">
        <Tab
          icon={<LineChart className="h-4 w-4" />}
          label="Gráfico"
          active={tabIsChart}
          onClick={() => {
            setMobileLeftOpen(false);
            setMobileRightOpen(false);
          }}
        />
        <Tab
          icon={<List className="h-4 w-4" />}
          label="Lista seg."
          active={mobileRightOpen}
          onClick={() => {
            setMobileLeftOpen(false);
            setMobileRightOpen(!mobileRightOpen);
          }}
        />
        <Tab
          icon={<Radar className="h-4 w-4" />}
          label="Scanner"
          active={scannerOpen}
          onClick={() => setScannerOpen(true)}
        />
        <Tab
          icon={<Bell className="h-4 w-4" />}
          label="Alertas"
          active={alertsOpen}
          onClick={() => setAlertsOpen(true)}
        />
        <Tab
          icon={<MenuIcon className="h-4 w-4" />}
          label="Tools"
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
        "flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[10px] transition-colors",
        active ? "text-tv-blue" : "text-tv-text-muted",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
