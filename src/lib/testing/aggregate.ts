/**
 * Wave 22 — agregador cross-session: junta todos los trades de todas las
 * sesiones del store + sus IDB details. Devuelve un array plano con info
 * extra (symbol de la sesión) para los filters de analytics.
 */

import { idbGet, sessionDetailKey } from "./storage";
import type { SessionDetail, SessionMeta, Trade } from "@/lib/store/testing-store";

export interface EnrichedTrade extends Trade {
  /** Nombre de la sesión (para mostrar en filtros). */
  sessionName: string;
  /** Símbolo de la sesión (no del trade — el trade no tiene symbol propio). */
  symbol: string;
}

/**
 * Para cada sesión del store, carga su detail de IDB y enriquece los trades.
 * Si una sesión no tiene detail (nunca abrió el chart), se ignora.
 *
 * `cachedDetails` (opcional) permite al caller proveer details ya cargados
 * (ej. el de la sesión activa) para evitar el round-trip a IDB.
 */
export async function loadAllTrades(
  sessions: SessionMeta[],
  cachedDetails: Record<string, SessionDetail> = {},
): Promise<EnrichedTrade[]> {
  const out: EnrichedTrade[] = [];
  for (const meta of sessions) {
    const cached = cachedDetails[meta.id];
    const detail = cached ?? (await idbGet<SessionDetail>(sessionDetailKey(meta.id)));
    if (!detail) continue;
    for (const t of detail.trades) {
      out.push({ ...t, sessionName: meta.name, symbol: meta.symbol });
    }
  }
  return out;
}

export interface AnalyticsFilters {
  sides?: ("buy" | "sell")[];
  outcomes?: ("win" | "loss" | "breakeven")[];
  symbols?: string[];
  sessions?: string[]; // sessionId list
  tags?: string[];
  /** Hora 0-23 (local del browser). */
  hourFrom?: number;
  hourTo?: number;
  /** Día de la semana (0=Sun, 6=Sat). */
  weekdays?: number[];
  /** Rango temporal de cierre del trade. */
  fromMs?: number;
  toMs?: number;
}

/** Aplica un set de filtros al array. Vacío = pasa todo. */
export function filterTrades(trades: EnrichedTrade[], f: AnalyticsFilters): EnrichedTrade[] {
  return trades.filter((t) => {
    if (f.sides && f.sides.length > 0 && !f.sides.includes(t.side)) return false;
    if (f.outcomes && f.outcomes.length > 0 && !f.outcomes.includes(t.outcome)) return false;
    if (f.symbols && f.symbols.length > 0 && !f.symbols.includes(t.symbol)) return false;
    if (f.sessions && f.sessions.length > 0 && !f.sessions.includes(t.sessionId)) return false;
    if (f.tags && f.tags.length > 0) {
      const has = t.tags.some((tag) => f.tags!.includes(tag));
      if (!has) return false;
    }
    if (f.hourFrom !== undefined || f.hourTo !== undefined) {
      const h = new Date(t.openedAt).getHours();
      if (f.hourFrom !== undefined && h < f.hourFrom) return false;
      if (f.hourTo !== undefined && h > f.hourTo) return false;
    }
    if (f.weekdays && f.weekdays.length > 0) {
      const wd = new Date(t.openedAt).getDay();
      if (!f.weekdays.includes(wd)) return false;
    }
    if (f.fromMs !== undefined && t.closedAt < f.fromMs) return false;
    if (f.toMs !== undefined && t.closedAt > f.toMs) return false;
    return true;
  });
}

/** Devuelve todos los tags únicos del set. */
export function uniqueTags(trades: EnrichedTrade[]): string[] {
  const set = new Set<string>();
  for (const t of trades) for (const tag of t.tags) set.add(tag);
  return Array.from(set).sort();
}

/** Devuelve todos los símbolos únicos. */
export function uniqueSymbols(trades: EnrichedTrade[]): string[] {
  const set = new Set<string>();
  for (const t of trades) set.add(t.symbol);
  return Array.from(set).sort();
}
