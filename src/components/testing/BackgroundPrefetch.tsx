"use client";

/**
 * Wave 18.14 — client-side mount que arranca el background prefetcher.
 * Se monta en el layout de /testing → corre cuando entrás a cualquier ruta
 * del área Testing y no hace nada visible.
 */

import { useEffect } from "react";
import { startBackgroundPrefetch } from "@/lib/testing/background-prefetch";

export function BackgroundPrefetch() {
  useEffect(() => {
    // Delay para no competir con el fetch del chart activo en el primer render.
    const t = setTimeout(() => startBackgroundPrefetch(), 3000);
    return () => clearTimeout(t);
  }, []);
  return null;
}
