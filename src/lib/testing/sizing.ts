/**
 * §3 — sizing por riesgo.
 *
 * La pregunta que responde: "si estoy dispuesto a perder el X% de mi cuenta
 * en este trade, y mi stop está en tal precio, ¿cuántas unidades compro?".
 *
 * Es la forma en que se dimensiona en serio: el tamaño sale del riesgo, no
 * al revés. Cambiar el stop cambia el tamaño, no el riesgo.
 */

/** Mínimo operable. Por debajo de esto el resultado no sirve. */
export const MIN_SIZE = 0.001;

export type SizingResult =
  | { ok: true; size: number; riskAmount: number }
  | { ok: false; reason: "no-sl" | "invalid" | "too-small" };

/**
 * `size = (equity × riskPct/100) / |entry − sl|`
 *
 * Sin `pointValue`: asume instrumentos lineales (1 unidad de precio = 1 USD
 * por unidad), que es el caso de crypto. Cuando entren futuros habrá que
 * multiplicar por el valor del punto del contrato.
 *
 * Redondea hacia abajo a 3 decimales: nunca arriesgar más de lo pedido.
 */
export function sizeFromRisk(input: {
  equity: number;
  riskPct: number;
  entry: number;
  sl?: number;
}): SizingResult {
  const { equity, riskPct, entry, sl } = input;
  if (sl === undefined || Number.isNaN(sl)) return { ok: false, reason: "no-sl" };
  if (
    !Number.isFinite(equity) ||
    !Number.isFinite(riskPct) ||
    !Number.isFinite(entry) ||
    !Number.isFinite(sl) ||
    equity <= 0 ||
    riskPct <= 0
  ) {
    return { ok: false, reason: "invalid" };
  }
  const distance = Math.abs(entry - sl);
  if (distance <= 0) return { ok: false, reason: "invalid" };

  const riskAmount = (equity * riskPct) / 100;
  // Truncar (no redondear) para no pasarse del riesgo pedido.
  const size = Math.floor((riskAmount / distance) * 1000) / 1000;
  if (size < MIN_SIZE) return { ok: false, reason: "too-small" };
  return { ok: true, size, riskAmount };
}
