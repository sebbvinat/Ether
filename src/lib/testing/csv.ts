/**
 * F6 — exportar los trades a CSV.
 *
 * Para llevarse los datos a una planilla y cruzarlos con lo que sea, sin
 * depender de que la analítica de acá tenga la vista que uno necesita.
 *
 * El escapeo importa más de lo que parece: las notas y los tags son texto
 * libre y una coma sin comillas corre todas las columnas siguientes.
 */

import type { SessionMeta, Trade } from "@/lib/store/testing-store";

/** Columnas del archivo, en orden. */
const COLUMNS = [
  "session",
  "symbol",
  "side",
  "size",
  "entry",
  "close",
  "sl",
  "tp",
  "opened_at",
  "closed_at",
  "duration_min",
  "close_reason",
  "outcome",
  "realized_pnl",
  "commission",
  "r_multiple",
  "ideal_rr",
  "max_adverse",
  "max_favorable",
  "tags",
] as const;

/**
 * Envuelve un campo si lo necesita.
 *
 * Regla de RFC 4180: si hay coma, comilla o salto de línea va entre comillas,
 * y las comillas de adentro se duplican.
 */
export function csvField(value: unknown): string {
  if (value === undefined || value === null) return "";
  const s = String(value);
  if (!/[",\r\n]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

/** ISO sin milisegundos — legible y ordenable en cualquier planilla. */
function iso(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function round(n: number | undefined, decimals = 2): string {
  if (n === undefined || !Number.isFinite(n)) return "";
  return n.toFixed(decimals);
}

/** Una fila por trade, en el orden de COLUMNS. */
export function tradeToRow(t: Trade, meta: Pick<SessionMeta, "name" | "symbol">): string[] {
  return [
    meta.name,
    meta.symbol,
    t.side,
    String(t.size),
    round(t.entry),
    round(t.closePrice),
    round(t.sl),
    round(t.tp),
    iso(t.openedAt),
    iso(t.closedAt),
    round((t.closedAt - t.openedAt) / 60_000, 1),
    t.closeReason,
    t.outcome,
    round(t.realizedPnL),
    round(t.commission),
    round(t.rMultiple, 3),
    round(t.idealRR, 3),
    round(t.maxAdverse),
    round(t.maxFavorable),
    t.tags.join(" "),
  ];
}

/**
 * El CSV completo, con encabezado.
 *
 * Los saltos son CRLF porque es lo que pide el RFC y lo que Excel espera; el
 * resto de las herramientas se banca los dos.
 */
export function tradesToCsv(
  trades: Trade[],
  meta: Pick<SessionMeta, "name" | "symbol">,
): string {
  const lines = [
    COLUMNS.join(","),
    ...trades.map((t) => tradeToRow(t, meta).map(csvField).join(",")),
  ];
  return lines.join("\r\n");
}

/** Nombre de archivo sin caracteres que molesten en Windows ni en Unix. */
export function csvFilename(sessionName: string, nowMs: number): string {
  const slug =
    sessionName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "sesion";
  return `ether-${slug}-${iso(nowMs).slice(0, 10)}.csv`;
}

/** Dispara la descarga en el browser. */
export function downloadCsv(content: string, filename: string): void {
  // El BOM es lo que hace que Excel abra los acentos bien en vez de mostrar
  // "Ã³". El resto de las herramientas lo ignoran.
  const blob = new Blob([`﻿${content}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
