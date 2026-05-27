"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListChecks,
  Receipt,
  BarChart3,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sidebar nav del área Testing — espejo de la sidebar de FXReplay.
 * Visible en todas las rutas bajo /testing.
 */
export function TestingSidebar() {
  const path = usePathname();
  const entries = [
    {
      href: "/testing/dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
    },
    {
      href: "/testing/sessions",
      label: "Sesiones",
      icon: ListChecks,
    },
    {
      href: "/testing/trades",
      label: "Trades",
      icon: Receipt,
    },
    {
      href: "/testing/analytics",
      label: "Analytics",
      icon: BarChart3,
    },
  ];
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-tv-border bg-tv-panel/30">
      <div className="flex items-center gap-2 border-b border-tv-border px-3 py-3">
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          title="Volver al chart en vivo"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Live chart
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {entries.map((e) => {
          const active =
            path === e.href || (e.href !== "/testing" && path?.startsWith(e.href));
          const Icon = e.icon;
          return (
            <Link
              key={e.href}
              href={e.href}
              className={cn(
                "flex items-center gap-2 rounded px-2.5 py-2 text-sm",
                active
                  ? "bg-tv-blue/15 text-tv-text"
                  : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
              )}
            >
              <Icon className="h-4 w-4" />
              {e.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-tv-border px-3 py-2 text-[10px] text-tv-text-muted">
        Ether Testing · MVP
      </div>
    </aside>
  );
}
