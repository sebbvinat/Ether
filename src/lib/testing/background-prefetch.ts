/**
 * Wave 18.14 — background prefetcher de velas.
 *
 * Cuando estás en /testing (cualquier ruta), este runner cachea en IDB los
 * símbolos populares × TFs principales en un loop de background usando
 * `requestIdleCallback` (o setTimeout como fallback). Así, cuando abrís una
 * sesión nueva o cambiás de TF, la data ya está — no hay que esperar el fetch.
 *
 * Reutiliza `LazyCandleStore` (que ya persiste a IDB via Wave 18.13), así que
 * no duplica código de storage.
 *
 * Nota: esto solo corre cuando el usuario abre la app. Para prefetch SIN abrir
 * la app hace falta un servicio server-side (Vercel Cron + Supabase KV);
 * pendiente de que el usuario confirme el setup.
 */

import type { Timeframe } from "@/lib/binance/types";
import { LazyCandleStore, TF_MINUTES } from "./candles";

/** Símbolos populares que queremos tener siempre listos. */
const PREFETCH_SYMBOLS: { symbol: string; provider: "binance" | "yahoo" }[] = [
  { symbol: "BTCUSDT", provider: "binance" },
  { symbol: "ETHUSDT", provider: "binance" },
  { symbol: "SOLUSDT", provider: "binance" },
  { symbol: "^GSPC", provider: "yahoo" }, // S&P 500
  { symbol: "^IXIC", provider: "yahoo" }, // Nasdaq
  { symbol: "^DJI", provider: "yahoo" }, // Dow
];

/** TFs a cachear. Skip 1m para no reventar storage (100k+ velas/símbolo/año). */
const PREFETCH_TFS: Timeframe[] = ["1d", "4h", "1h", "15m"];

/** Cuántas barras traer por (symbol, tf). Balancea storage vs contexto. */
const BARS_PER_TF = 1500;

let running = false;

/**
 * Arranca el loop de prefetch. Es idempotente — llamar varias veces es no-op.
 * El loop corre en background, un fetch por idle tick con delay de 1-2s entre
 * cada uno para no saturar la red ni sacar rate-limit del user.
 */
export function startBackgroundPrefetch(): void {
  if (running) return;
  if (typeof window === "undefined") return;
  running = true;

  const queue: { symbol: string; tf: Timeframe; provider: "binance" | "yahoo" }[] = [];
  for (const s of PREFETCH_SYMBOLS) {
    for (const tf of PREFETCH_TFS) {
      queue.push({ symbol: s.symbol, tf, provider: s.provider });
    }
  }
  // Shuffle ligero para que no se apilen del mismo símbolo al principio
  queue.sort(() => Math.random() - 0.5);

  const runOne = async () => {
    const job = queue.shift();
    if (!job) {
      running = false;
      return;
    }
    try {
      const now = Date.now();
      const start = now - BARS_PER_TF * TF_MINUTES[job.tf] * 60_000;
      const store = new LazyCandleStore(
        job.symbol,
        job.tf,
        start,
        now + 1000 * 60 * 60 * 24, // endMs un día en el futuro para no clampear
      );
      // hydrateFromCache + ensureLoaded → si ya está cacheado, cero requests.
      await store.ensureLoaded(now, BARS_PER_TF, 100);
    } catch (e) {
      // Silent fail — es background, no queremos molestar al user con errores.
      console.debug("[prefetch]", job.symbol, job.tf, "failed", e);
    }
    // Delay entre jobs para no ser abusivos con la red
    setTimeout(scheduleNext, 1500);
  };

  const scheduleNext = () => {
    if (typeof (window as Window & typeof globalThis).requestIdleCallback === "function") {
      (window as Window & typeof globalThis & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback(runOne, { timeout: 3000 });
    } else {
      setTimeout(runOne, 500);
    }
  };

  scheduleNext();
}
