/**
 * Wave 15 — sistema de atajos configurables.
 *
 * Cada acción mapea a un combo de teclas serializado como string (ej.
 * "Z", "Alt+R", "Ctrl+Shift+S"). El parser normaliza la representación y
 * el matcher chequea un KeyboardEvent contra el combo.
 */

export type ShortcutAction =
  | "cleanMode"
  | "focusMode"
  | "hideLegend"
  | "replay"
  | "openPine"
  | "openBacktest"
  | "openIndicators"
  | "openLayers"
  | "toggleLockDrawings"
  | "toggleHideDrawings"
  | "toggleMagnet"
  | "screenshot";

/** Combinación serializada en formato canónico. */
export type ShortcutCombo = string;

/** Defaults — coinciden con los hardcoded de antes + algunos nuevos. */
export const DEFAULT_SHORTCUTS: Record<ShortcutAction, ShortcutCombo> = {
  cleanMode: "Z",
  focusMode: "F",
  hideLegend: "H",
  replay: "Alt+R",
  openPine: "Alt+P",
  openBacktest: "Alt+B",
  openIndicators: "Alt+I",
  openLayers: "Alt+L",
  toggleLockDrawings: "Alt+K",
  toggleHideDrawings: "Alt+H",
  toggleMagnet: "Alt+M",
  screenshot: "Alt+S",
};

/** Etiqueta legible para mostrar al usuario. */
export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  cleanMode: "Modo limpio (sin chrome)",
  focusMode: "Modo enfoque",
  hideLegend: "Ocultar legend pills",
  replay: "Replay (barra a barra)",
  openPine: "Abrir Editor de Pine",
  openBacktest: "Abrir Backtest",
  openIndicators: "Abrir biblioteca de indicadores",
  openLayers: "Abrir panel de capas",
  toggleLockDrawings: "Bloquear / desbloquear dibujos",
  toggleHideDrawings: "Ocultar / mostrar dibujos",
  toggleMagnet: "Imán (snap a OHLC)",
  screenshot: "Captura PNG",
};

/** Modifiers que reconocemos. */
const MODS = ["Ctrl", "Shift", "Alt", "Meta"] as const;

/** Convierte un string de usuario a forma canónica.
 *  Acepta variantes: "ctrl+s", "CTRL + S", "shift+alt+x" → "Ctrl+S", "Shift+Alt+X". */
export function normalizeCombo(raw: string): ShortcutCombo {
  if (!raw) return "";
  const parts = raw
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return "";
  const mods: string[] = [];
  let key = "";
  for (const p of parts) {
    const low = p.toLowerCase();
    if (low === "ctrl" || low === "control") mods.push("Ctrl");
    else if (low === "shift") mods.push("Shift");
    else if (low === "alt" || low === "option") mods.push("Alt");
    else if (low === "meta" || low === "cmd" || low === "command") mods.push("Meta");
    else {
      // tecla principal — keepalla en uppercase si es letra
      key = p.length === 1 ? p.toUpperCase() : p;
    }
  }
  if (!key) return "";
  // Orden canónico
  const orderedMods = MODS.filter((m) => mods.includes(m));
  return [...orderedMods, key].join("+");
}

/** Genera un combo canónico desde un KeyboardEvent. Devuelve "" si la tecla
 *  es sólo un modifier (Ctrl/Shift/Alt/Meta solos no son atajo). */
export function comboFromEvent(e: KeyboardEvent): ShortcutCombo {
  const key = e.key;
  if (key === "Control" || key === "Shift" || key === "Alt" || key === "Meta") {
    return "";
  }
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.shiftKey) mods.push("Shift");
  if (e.altKey) mods.push("Alt");
  if (e.metaKey) mods.push("Meta");
  // Tecla principal: si es una letra normalizar a uppercase; si es Escape, F1, etc. dejarla tal cual.
  const mainKey = key.length === 1 ? key.toUpperCase() : key;
  return [...mods, mainKey].join("+");
}

/** True si el KeyboardEvent matchea el combo. */
export function matchesCombo(e: KeyboardEvent, combo: ShortcutCombo): boolean {
  if (!combo) return false;
  const parts = combo.split("+");
  const needCtrl = parts.includes("Ctrl");
  const needShift = parts.includes("Shift");
  const needAlt = parts.includes("Alt");
  const needMeta = parts.includes("Meta");
  if (needCtrl !== e.ctrlKey) return false;
  if (needShift !== e.shiftKey) return false;
  if (needAlt !== e.altKey) return false;
  if (needMeta !== e.metaKey) return false;
  const expectedKey = parts[parts.length - 1];
  const evKey = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return expectedKey === evKey;
}

/** True si el foco está en un input/textarea/contentEditable. */
export function isTypingTarget(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null;
  return (
    !!n &&
    (n.tagName === "INPUT" ||
      n.tagName === "TEXTAREA" ||
      n.isContentEditable === true)
  );
}
