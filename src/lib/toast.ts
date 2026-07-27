/**
 * G4 — avisos in-app.
 *
 * Reemplaza a `alert()`, que congela la pestaña entera, se ve como un cartel
 * del sistema operativo en medio de una terminal de trading, y en el peor
 * momento posible: mientras corre el replay.
 *
 * Va por evento (el mismo patrón que `ether:alert-fired` de las alertas de
 * precio) para que se pueda llamar desde cualquier lado —handlers, funciones
 * sueltas, código fuera de React— sin pasar un contexto por media app.
 */

export type ToastKind = "error" | "success" | "info";

export interface ToastDetail {
  message: string;
  kind: ToastKind;
}

export const TOAST_EVENT = "ether:toast";

/** Muestra un aviso. Si no hay `window` (SSR) no hace nada. */
export function notify(message: string, kind: ToastKind = "info"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { message, kind } }),
  );
}

export const notifyError = (message: string) => notify(message, "error");
export const notifySuccess = (message: string) => notify(message, "success");
