"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STORAGE_KEY = "ether-install-dismissed";

/**
 * Shown when the browser fires `beforeinstallprompt` — lets the user install the PWA
 * with a single tap. Hides itself once installed or dismissed.
 */
export function InstallBanner() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(display-mode: standalone)").matches) return; // already installed
    if (localStorage.getItem(STORAGE_KEY) === "1") {
      setDismissed(true);
      return;
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function install() {
    if (!evt) return;
    await evt.prompt();
    const choice = await evt.userChoice;
    if (choice.outcome === "accepted") {
      setEvt(null);
    }
  }

  function dismiss() {
    setDismissed(true);
    localStorage.setItem(STORAGE_KEY, "1");
  }

  if (!evt || dismissed) return null;

  return (
    <div className="pointer-events-auto fixed right-3 top-14 z-40 flex max-w-[92%] items-center gap-2 rounded-lg border border-tv-border bg-tv-panel/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <Download className="h-4 w-4 text-tv-blue" />
      <span className="text-tv-text">Instalar como app</span>
      <button
        onClick={install}
        className="ml-1 rounded bg-tv-blue px-2 py-1 text-[11px] font-semibold text-white hover:bg-tv-blue/90"
      >
        Instalar
      </button>
      <button
        onClick={dismiss}
        aria-label="Cerrar"
        className="rounded p-1 text-tv-text-muted hover:text-tv-text"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
