"use client";

/**
 * F1 — las capturas de entrada y salida de un trade, dentro del journal.
 *
 * Los blobs viven en IndexedDB, así que hay que pedirlos y armar object URLs
 * al abrir el diálogo — y revocarlos al cerrarlo, o cada apertura deja una
 * copia de la imagen colgada en memoria.
 */

import { useEffect, useState } from "react";
import { loadShot } from "@/lib/testing/screenshots";
import type { Trade } from "@/lib/store/testing-store";

interface Props {
  trade: Trade | null;
}

export function TradeShots({ trade }: Props) {
  const [urls, setUrls] = useState<{ entry?: string; exit?: string }>({});
  const [zoom, setZoom] = useState<string | null>(null);

  // La entrada se guardó con el id de la POSICIÓN (cuando el trade todavía no
  // existía) y la salida con el del trade.
  const positionId = trade?.positionId;
  const tradeId = trade?.id;

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    async function load() {
      const [entryBlob, exitBlob] = await Promise.all([
        positionId ? loadShot(positionId, "entry") : Promise.resolve(undefined),
        tradeId ? loadShot(tradeId, "exit") : Promise.resolve(undefined),
      ]);
      if (cancelled) return;
      const next: { entry?: string; exit?: string } = {};
      if (entryBlob) {
        next.entry = URL.createObjectURL(entryBlob);
        created.push(next.entry);
      }
      if (exitBlob) {
        next.exit = URL.createObjectURL(exitBlob);
        created.push(next.exit);
      }
      setUrls(next);
    }
    void load();
    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
      setUrls({});
    };
  }, [positionId, tradeId]);

  if (!urls.entry && !urls.exit) return null;

  const shots: [string, string | undefined][] = [
    ["Entrada", urls.entry],
    ["Salida", urls.exit],
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {shots.map(([label, url]) =>
          url ? (
            <figure key={label} className="flex flex-col gap-1">
              <figcaption className="text-[10px] uppercase tracking-wider text-tv-text-muted">
                {label}
              </figcaption>
              <button
                type="button"
                onClick={() => setZoom(url)}
                title="Ver en grande"
                className="overflow-hidden rounded border border-tv-border hover:border-tv-blue/60"
              >
                {/* next/image no aporta acá: son blobs locales, sin optimización
                    posible ni dimensiones conocidas de antemano. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Chart al momento de la ${label.toLowerCase()}`} className="w-full" />
              </button>
            </figure>
          ) : (
            <div
              key={label}
              className="flex flex-col justify-end rounded border border-dashed border-tv-border/60 p-3 text-[10px] text-tv-text-dim"
            >
              Sin captura de {label.toLowerCase()}
            </div>
          ),
        )}
      </div>

      {zoom && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-6"
          onClick={() => setZoom(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="Captura del chart" className="max-h-full max-w-full rounded" />
        </div>
      )}
    </>
  );
}
