/**
 * F1 — capturas automáticas del chart en la entrada y la salida de cada trade.
 *
 * Lo que resuelve: al revisar un trade viejo, los números no dicen si el setup
 * era el que creías. La imagen de cómo estaba el gráfico en el momento exacto
 * de entrar, sí.
 *
 * Se guardan en IndexedDB, no en el detail de la sesión: una captura pesa
 * cientos de KB y el detail se serializa entero en cada cambio.
 *
 * Ojo con lo que captura: `takeScreenshot()` de lightweight-charts dibuja el
 * canvas del chart, no los overlays SVG que van encima (líneas de posición,
 * órdenes). Queda la acción del precio, que es lo que importa para juzgar el
 * setup — pero no las líneas del trade.
 */

import { idbDel, idbGet, idbSet, screenshotKey } from "./storage";

/** Momento del trade que retrata la captura. */
export type ShotPhase = "entry" | "exit";

/**
 * La entrada se retrata cuando se abre la POSICIÓN, y en ese momento el trade
 * todavía no existe (nace al cerrar). Por eso cada fase se guarda con el id
 * que sí existe en ese momento, y `Trade.positionId` es lo que después une
 * las dos puntas.
 */
export function shotKey(ownerId: string, phase: ShotPhase): string {
  return screenshotKey(`${ownerId}/${phase}`);
}

/** Ancho máximo de la captura. Guardar el chart a tamaño real es 3-4× más
 *  pesado sin que se lea mejor al revisarlo. */
const MAX_WIDTH = 900;
/** WebP con esta calidad deja archivos ~5× más chicos que PNG y para un
 *  gráfico de velas la diferencia no se nota. */
const QUALITY = 0.75;

/**
 * Pasa el canvas del chart a un blob, reescalando si hace falta.
 * Devuelve null si el navegador no puede producirlo (no rompe el replay).
 */
export async function canvasToBlob(source: HTMLCanvasElement): Promise<Blob | null> {
  let canvas = source;
  if (source.width > MAX_WIDTH) {
    const scale = MAX_WIDTH / source.width;
    const scaled = document.createElement("canvas");
    scaled.width = MAX_WIDTH;
    scaled.height = Math.round(source.height * scale);
    const ctx = scaled.getContext("2d");
    if (ctx) {
      ctx.drawImage(source, 0, 0, scaled.width, scaled.height);
      canvas = scaled;
    }
  }
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), "image/webp", QUALITY);
    } catch {
      resolve(null);
    }
  });
  if (blob) return blob;
  // Algún navegador sin WebP: PNG y listo.
  return new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), "image/png");
    } catch {
      resolve(null);
    }
  });
}

/** Guarda la captura. Los errores se tragan: perder una imagen no puede
 *  cortar el replay ni el registro del trade. */
export async function saveShot(
  ownerId: string,
  phase: ShotPhase,
  canvas: HTMLCanvasElement,
): Promise<void> {
  try {
    const blob = await canvasToBlob(canvas);
    if (blob) await idbSet(shotKey(ownerId, phase), blob);
  } catch (e) {
    console.warn("[screenshots] no se pudo guardar", ownerId, phase, e);
  }
}

export async function loadShot(
  ownerId: string,
  phase: ShotPhase,
): Promise<Blob | undefined> {
  return idbGet<Blob>(shotKey(ownerId, phase));
}

export async function deleteShots(ownerId: string): Promise<void> {
  await Promise.all([
    idbDel(shotKey(ownerId, "entry")),
    idbDel(shotKey(ownerId, "exit")),
  ]);
}
