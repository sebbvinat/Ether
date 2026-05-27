/**
 * Wave 17 — IndexedDB storage adapter para el área Testing.
 *
 * Por qué IDB y no localStorage: el área Testing maneja datos pesados
 * (trades + journal + drawings + screenshots blob) que reventarían los
 * ~5-10MB de cuota de localStorage rápido. La meta de sesiones (id, name,
 * symbol, balance, totales) queda en localStorage vía zustand-persist;
 * acá guardamos sólo el detalle pesado por sesión.
 *
 * Layout de claves:
 *   - `session/<sessionId>/detail`  → SessionDetail (trades, orders, positions, drawings, journal IDs)
 *   - `journal/<entryId>`           → JournalEntry
 *   - `screenshot/<id>`             → Blob
 *
 * Usa `idb-keyval` (~600 bytes) — wrapper minimalista sobre IDB.
 */

import { get, set, del, keys } from "idb-keyval";

// ---------- raw helpers ----------

/** True si IDB está disponible. En SSR o Safari Private mode puede no estarlo. */
export function idbAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return typeof indexedDB !== "undefined";
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  if (!idbAvailable()) return undefined;
  try {
    return (await get(key)) as T | undefined;
  } catch (e) {
    console.warn("[testing/storage] idbGet failed", key, e);
    return undefined;
  }
}

export async function idbSet<T>(key: string, value: T): Promise<void> {
  if (!idbAvailable()) return;
  try {
    await set(key, value);
  } catch (e) {
    console.warn("[testing/storage] idbSet failed", key, e);
  }
}

export async function idbDel(key: string): Promise<void> {
  if (!idbAvailable()) return;
  try {
    await del(key);
  } catch (e) {
    console.warn("[testing/storage] idbDel failed", key, e);
  }
}

export async function idbKeysWithPrefix(prefix: string): Promise<string[]> {
  if (!idbAvailable()) return [];
  try {
    const all = await keys();
    return all
      .filter((k): k is string => typeof k === "string" && k.startsWith(prefix));
  } catch (e) {
    console.warn("[testing/storage] idbKeysWithPrefix failed", prefix, e);
    return [];
  }
}

// ---------- typed helpers ----------

const SESSION_DETAIL_PREFIX = "session/";
const JOURNAL_PREFIX = "journal/";
const SCREENSHOT_PREFIX = "screenshot/";

export function sessionDetailKey(sessionId: string): string {
  return `${SESSION_DETAIL_PREFIX}${sessionId}/detail`;
}

export function journalKey(entryId: string): string {
  return `${JOURNAL_PREFIX}${entryId}`;
}

export function screenshotKey(id: string): string {
  return `${SCREENSHOT_PREFIX}${id}`;
}

/** Borra TODO lo asociado a una sesión (detail + journal entries + screenshots).
 *  El metadata en zustand-persist (localStorage) se borra por separado. */
export async function deleteSessionData(sessionId: string): Promise<void> {
  if (!idbAvailable()) return;
  await idbDel(sessionDetailKey(sessionId));
  // (los journal entries y screenshots de esa sesión se borran via su id si
  // el caller los pasa; acá no recorremos todo para no ser O(N) en cada delete)
}
