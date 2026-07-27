/**
 * G3 — una sesión, una pestaña.
 *
 * El problema: dos pestañas con la misma sesión abierta tienen cada una su
 * copia del detail en memoria y las dos lo escriben ENTERO a IndexedDB en
 * cada cambio. Gana la última en escribir, y los trades que hizo la otra
 * desaparecen sin ningún aviso.
 *
 * La solución no es sincronizar (fusionar dos historiales de trades divergentes
 * no tiene respuesta correcta) sino impedirlo: la segunda pestaña queda mirando
 * y puede tomar el control si de verdad lo quiere.
 *
 * El protocolo es un apretón de manos por BroadcastChannel:
 *   1. Al abrir, la pestaña manda `claim` y espera.
 *   2. Cualquiera que ya sea dueña —o que tenga un claim que le gane— responde
 *      `held`.
 *   3. Sin respuesta en CLAIM_TIMEOUT_MS, es la dueña.
 *
 * Si la dueña se cierra de golpe no libera nada, pero tampoco responde: la
 * siguiente que reclame se queda con la sesión. Es el comportamiento deseado.
 */

export const CHANNEL_NAME = "ether-testing-lock";
/** Cuánto se espera una respuesta antes de asumir que nadie más la tiene. */
export const CLAIM_TIMEOUT_MS = 250;
/** Cada cuánto vuelve a preguntar la pestaña bloqueada. Cerrar la pestaña
 *  dueña no garantiza que su `release` llegue —el navegador puede
 *  desmantelarla antes—, así que no se depende de ese mensaje. */
export const REPROBE_MS = 2000;

export interface ClaimId {
  /** Identifica a la pestaña dentro de la vida del navegador. */
  tabId: string;
  /** Cuándo reclamó, en ms. */
  at: number;
}

export type LockMessage =
  | { type: "claim"; sessionId: string; claim: ClaimId }
  | { type: "held"; sessionId: string; claim: ClaimId }
  | { type: "release"; sessionId: string; claim: ClaimId };

/**
 * Con dos pestañas reclamando a la vez, ¿le toca a `mine` ceder?
 *
 * Gana la que reclamó antes; con el mismo instante, desempata el tabId. Lo que
 * importa es que las dos lleguen a la MISMA conclusión mirando el mismo par:
 * si las dos cedieran nadie escribiría, y si ninguna cediera volvemos al
 * problema original.
 */
export function shouldYieldTo(mine: ClaimId, other: ClaimId): boolean {
  if (other.at !== mine.at) return other.at < mine.at;
  return other.tabId < mine.tabId;
}

export function newClaim(nowMs: number): ClaimId {
  return {
    tabId:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2),
    at: nowMs,
  };
}

/** True si el navegador soporta el canal. Sin él no hay guard — y tampoco
 *  rompemos nada: se sigue como antes. */
export function lockSupported(): boolean {
  return typeof window !== "undefined" && typeof BroadcastChannel !== "undefined";
}
