"use client";

import { useEffect, useState } from "react";
import { Maximize, Minimize } from "lucide-react";

export function FullscreenButton() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onChange = () => setActive(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggle() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (e) {
      console.warn("fullscreen toggle failed:", e);
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label="Pantalla completa"
      title={active ? "Salir pantalla completa (F)" : "Pantalla completa (F)"}
      className="flex h-8 w-8 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
    >
      {active ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
    </button>
  );
}
