/**
 * §10 — paleta única de la app.
 *
 * Los mismos hex estaban repetidos en ~20 archivos, cada uno con su propia
 * constante local. Cuando había que ajustar un color había que acordarse de
 * todos. Acá viven una sola vez.
 *
 * Los valores replican los de TradingView, que es la referencia visual del
 * proyecto. Las clases de Tailwind (`tv-bg`, `tv-text`, …) apuntan a estos
 * mismos colores; este módulo es para los lugares donde hace falta el hex
 * literal: lightweight-charts y los overlays SVG.
 */

export const TV = {
  /** Fondo del chart. */
  bg: "#131722",
  /** Fondo de paneles y barras. */
  panel: "#1e222d",
  /** Líneas de la grilla del chart. */
  grid: "#1e222d",
  /** Bordes y separadores. */
  border: "#2a2e39",
  /** Texto principal. */
  text: "#d1d4dc",
  /** Texto secundario y ejes. */
  textMuted: "#787b86",

  /** Alcista / compra. */
  green: "#26a69a",
  /** Bajista / venta. */
  red: "#ef5350",
  /** Acento, selección, crosshair. */
  blue: "#2962ff",
  /** Advertencias y órdenes pendientes. */
  yellow: "#ffb74d",
  /** Acento secundario (indicadores). */
  purple: "#ab47bc",
} as const;

/** Fondos translúcidos derivados, para zonas de riesgo/beneficio y flashes. */
export const TV_ALPHA = {
  green10: "rgba(38,166,154,0.10)",
  green35: "rgba(38,166,154,0.35)",
  green40: "rgba(38,166,154,0.40)",
  red10: "rgba(239,83,80,0.10)",
  red35: "rgba(239,83,80,0.35)",
  red40: "rgba(239,83,80,0.40)",
  /** Fondo de tooltips y etiquetas sobre el chart. */
  panel92: "rgba(30,34,45,0.92)",
} as const;
