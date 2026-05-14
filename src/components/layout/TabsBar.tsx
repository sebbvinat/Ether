"use client";

import { Plus, X } from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import { getInstrument } from "@/lib/instruments";
import { cn } from "@/lib/utils";

/**
 * Tab bar at the top of the app — like browser tabs but internal to Ether.
 * Each tab keeps its own chart state (symbol, timeframe, layout, drawings, etc.).
 */
export function TabsBar() {
  const tabs = useChartStore((s) => s.tabs);
  const activeTabId = useChartStore((s) => s.activeTabId);
  const symbol = useChartStore((s) => s.symbol);
  const createTab = useChartStore((s) => s.createTab);
  const closeTab = useChartStore((s) => s.closeTab);
  const switchTab = useChartStore((s) => s.switchTab);
  const renameTab = useChartStore((s) => s.renameTab);
  const focusMode = useChartStore((s) => s.focusMode);

  if (focusMode) return null;

  // If there are no tabs yet, show a single virtual tab + button to split
  const displayTabs =
    tabs.length === 0
      ? [
          {
            id: "_virtual_",
            name: getInstrument(symbol).displayName,
            virtual: true,
          },
        ]
      : tabs.map((t) => ({
          id: t.id,
          name: t.name || getInstrument(t.symbol).displayName,
          virtual: false,
        }));

  return (
    <div className="hidden h-8 shrink-0 items-center gap-px overflow-x-auto border-b border-tv-border bg-tv-bg px-1 md:flex">
      {displayTabs.map((t) => {
        const isActive = t.virtual ? true : t.id === activeTabId;
        return (
          <div
            key={t.id}
            className={cn(
              "group flex h-7 max-w-[200px] shrink-0 items-center gap-1.5 rounded-t-md border border-b-0 px-2.5 text-[11px] transition-colors",
              isActive
                ? "border-tv-border bg-tv-panel text-tv-text"
                : "border-transparent text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
            )}
          >
            <button
              onClick={() => !t.virtual && switchTab(t.id)}
              onDoubleClick={() => {
                if (t.virtual) return;
                const name = window.prompt("Nombre de la pestaña:", t.name);
                if (name && name.trim()) renameTab(t.id, name.trim());
              }}
              className="truncate"
              title={`${t.name} — doble click para renombrar`}
            >
              {t.name}
            </button>
            {!t.virtual && tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-tv-text-muted opacity-0 transition-opacity hover:bg-tv-bg hover:text-tv-red group-hover:opacity-100"
                aria-label="Cerrar pestaña"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}
      <button
        onClick={() => createTab()}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
        aria-label="Nueva pestaña"
        title="Nueva pestaña"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
