/**
 * §11 — playback intra-vela.
 *
 * La idea: el cursor de replay sigue siendo un timestamp y nada más. Lo que
 * se ve en el chart se DERIVA de ese timestamp cada vez, en vez de guardarse
 * como estado aparte. Concretamente:
 *
 *   - `boundary` = el arranque de la vela del TF donde cayó el cursor.
 *   - Velas completas: las del TF que ya cerraron (`time + tfSec <= cursor`).
 *   - Vela parcial: si el cursor pasó el boundary, las velas de 1m entre el
 *     boundary y el cursor, agregadas en una sola con `time = boundary`.
 *
 * Que sea derivado y no estado es lo que hace que cambiar de TF, recargar la
 * página o rebobinar funcionen sin código extra: se recalcula y ya.
 *
 * Sin data de 1m (Yahoo más de 7 días atrás, o cripto antes del listing) no
 * hay parcial y el chart avanza vela completa, como antes.
 */

import type { Candle } from "@/lib/binance/types";

/** Arranque de la vela de `tfSec` que contiene a `timeSec`. */
export function barBoundarySec(timeSec: number, tfSec: number): number {
  return Math.floor(timeSec / tfSec) * tfSec;
}

/** Junta varias velas en una sola que arranca en `timeSec`. */
function aggregate(subs: Candle[], timeSec: number): Candle {
  let high = subs[0].high;
  let low = subs[0].low;
  let volume = 0;
  for (const c of subs) {
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
    volume += c.volume;
  }
  return {
    time: timeSec,
    open: subs[0].open,
    high,
    low,
    close: subs[subs.length - 1].close,
    volume,
    // La vela todavía se está formando: nadie debería tratarla como cerrada.
    isFinal: false,
  };
}

/**
 * Las velas que van al chart para un cursor dado.
 *
 * `oneMin` puede ser null (modo vela completa, o todavía no cargó): en ese
 * caso solo se devuelven las velas que ya cerraron.
 */
export function composeDisplayed(
  tfCandles: Candle[],
  oneMin: Candle[] | null,
  cursorSec: number,
  tfSec: number,
): Candle[] {
  const boundary = barBoundarySec(cursorSec, tfSec);
  // Cerrada = su CIERRE quedó atrás del cursor, no su apertura.
  const complete = tfCandles.filter((c) => c.time + tfSec <= cursorSec);

  // Cursor justo en el boundary: la anterior cerró y la nueva no empezó.
  if (!oneMin || cursorSec <= boundary) return complete;

  const subs = oneMin.filter((c) => c.time >= boundary && c.time <= cursorSec);
  if (subs.length === 0) return complete;

  return [...complete, aggregate(subs, boundary)];
}

/**
 * Las velas de 1m que el engine todavía no procesó, para avanzar de
 * `prevCursorSec` (exclusivo) a `cursorSec` (inclusive).
 */
export function subCandlesBetween(
  oneMin: Candle[],
  prevCursorSec: number,
  cursorSec: number,
): Candle[] {
  return oneMin.filter((c) => c.time > prevCursorSec && c.time <= cursorSec);
}

/**
 * ¿Hay data de 1m utilizable alrededor del cursor?
 *
 * Se usa para caer a modo vela completa sin romper nada cuando el proveedor
 * no tiene esa resolución tan atrás. Pide que haya al menos una vela dentro
 * de la barra en curso.
 */
export function hasIntrabarData(
  oneMin: Candle[] | null,
  cursorSec: number,
  tfSec: number,
): boolean {
  if (!oneMin || oneMin.length === 0) return false;
  const boundary = barBoundarySec(cursorSec, tfSec);
  return oneMin.some((c) => c.time >= boundary && c.time <= cursorSec);
}
