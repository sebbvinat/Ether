import type { Drawing } from "@/lib/store/chart-store";

/**
 * Wave 14 — computa el/los nivel(es) de precio que un dibujo representa en
 * un tiempo dado. Devuelve null si el dibujo no soporta alertas.
 *
 * Soportados: hline, hlineExt, trendline, ray, hrange.
 * Resto: null (no aplica — el dibujo no tiene un "precio bajo el cursor"
 * razonable, ej. brush, callout, fib, etc.).
 *
 * Para trendline/ray el nivel se extrapola linealmente. Para hrange se
 * devuelven los DOS bordes (upper + lower) — el caller chequea ambos.
 */
export function drawingLevelsAt(
  drawing: Drawing,
  time: number,
): number[] | null {
  switch (drawing.type) {
    case "hline":
    case "hlineExt":
      return [drawing.at.price];
    case "trendline":
    case "ray": {
      const { a, b } = drawing;
      if (a.time === b.time) return [a.price];
      // Para ray: sólo extrapolar hacia adelante (t >= a.time).
      // Para trendline: extrapolar en ambas direcciones (el dibujo se muestra
      // como segmento pero el "nivel" lógico de la línea existe en cualquier t).
      if (drawing.type === "ray" && time < Math.min(a.time, b.time)) {
        return null;
      }
      const slope = (b.price - a.price) / (b.time - a.time);
      const level = a.price + slope * (time - a.time);
      return Number.isFinite(level) ? [level] : null;
    }
    case "hrange": {
      const { a, b } = drawing;
      return [a.price, b.price];
    }
    default:
      return null;
  }
}

/** Devuelve true si `drawing.type` puede tener una alerta. */
export function supportsAlerts(type: Drawing["type"]): boolean {
  return (
    type === "hline" ||
    type === "hlineExt" ||
    type === "trendline" ||
    type === "ray" ||
    type === "hrange"
  );
}

/** Detecta si `price` cruzó el `level` viniendo desde `prevPrice`.
 *  direction:
 *    "above" → cruce ascendente (prev<level && curr>=level)
 *    "below" → cruce descendente (prev>level && curr<=level)
 *    "both"  → cualquier cruce
 */
export function crossed(
  prevPrice: number,
  currPrice: number,
  level: number,
  direction: "above" | "below" | "both",
): boolean {
  const wasBelow = prevPrice < level;
  const isAbove = currPrice >= level;
  const wasAbove = prevPrice > level;
  const isBelow = currPrice <= level;
  const up = wasBelow && isAbove;
  const down = wasAbove && isBelow;
  if (direction === "above") return up;
  if (direction === "below") return down;
  return up || down;
}
