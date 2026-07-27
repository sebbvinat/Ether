"use client";

/**
 * C3 — menú contextual del chart de testing.
 *
 * Click derecho sobre el chart y las acciones aparecen donde está el mouse,
 * ya sabiendo a qué precio apuntaste. Es la diferencia entre "quiero una
 * orden en 88.240" (abrir diálogo, tipear el número, confirmar) y señalar
 * el nivel.
 *
 * El tipo de orden lo decide la posición del click respecto del precio
 * actual: comprar por debajo es un limit, comprar por arriba es un stop. Es
 * lo que hace TradingView y evita el error de mandar un limit que se llena al
 * instante.
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface ContextMenuState {
  /** Posición del menú en píxeles, relativa al viewport. */
  x: number;
  y: number;
  /** Precio bajo el cursor al abrir. */
  price: number;
  /** Timestamp (segundos) bajo el cursor al abrir. */
  timeSec: number;
}

interface Props {
  state: ContextMenuState | null;
  /** Último precio del replay, para decidir limit vs stop. */
  lastPrice: number;
  onClose: () => void;
  onHLine: (price: number, timeSec: number) => void;
  onOrder: (side: "buy" | "sell", price: number, kind: "limit" | "stop") => void;
  onClearDrawings: () => void;
}

/**
 * Qué tipo de orden corresponde a un nivel, según dónde esté respecto del
 * precio actual.
 *
 * Comprar POR DEBAJO del mercado es un limit; por arriba, un stop. Al revés
 * para vender. Mandar un buy limit por encima del precio lo llenaría al
 * instante, que no es lo que nadie quiere al señalar un nivel.
 */
export function orderKindAt(
  price: number,
  lastPrice: number,
): { buy: "limit" | "stop"; sell: "limit" | "stop" } {
  return {
    buy: price <= lastPrice ? "limit" : "stop",
    sell: price >= lastPrice ? "limit" : "stop",
  };
}

export function ChartContextMenu({
  state,
  lastPrice,
  onClose,
  onHLine,
  onOrder,
  onClearDrawings,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Cerrar con Escape o al clickear afuera. El listener va en window porque el
  // menú se dibuja sobre el canvas del chart, que no propaga nada útil.
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [state, onClose]);

  if (!state) return null;

  const price = state.price;
  const { buy: buyKind, sell: sellKind } = orderKindAt(price, lastPrice);
  const fmt = price.toFixed(2);

  const items: (
    | { kind: "sep" }
    | { kind: "item"; label: string; onClick: () => void; tone?: "buy" | "sell" }
  )[] = [
    {
      kind: "item",
      label: `Línea horizontal en ${fmt}`,
      onClick: () => onHLine(price, state.timeSec),
    },
    { kind: "sep" },
    {
      kind: "item",
      label: `Buy ${buyKind} en ${fmt}`,
      tone: "buy",
      onClick: () => onOrder("buy", price, buyKind),
    },
    {
      kind: "item",
      label: `Sell ${sellKind} en ${fmt}`,
      tone: "sell",
      onClick: () => onOrder("sell", price, sellKind),
    },
    { kind: "sep" },
    {
      kind: "item",
      label: "Copiar precio",
      onClick: () => {
        void navigator.clipboard?.writeText(fmt);
      },
    },
    {
      kind: "item",
      label: "Borrar todos los dibujos",
      onClick: onClearDrawings,
    },
  ];

  return (
    <div
      ref={ref}
      // Se posiciona con fixed sobre el viewport: el chart tiene overflow
      // hidden y el menú tiene que poder salirse de sus bordes.
      style={{ left: state.x, top: state.y }}
      className="fixed z-50 min-w-52 overflow-hidden rounded border border-tv-border bg-tv-panel py-1 shadow-xl"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) =>
        it.kind === "sep" ? (
          <div key={i} className="my-1 border-t border-tv-border" />
        ) : (
          <button
            key={i}
            onClick={() => {
              it.onClick();
              onClose();
            }}
            className={cn(
              "block w-full px-3 py-1.5 text-left text-[11px]",
              it.tone === "buy"
                ? "text-tv-green hover:bg-tv-green/10"
                : it.tone === "sell"
                  ? "text-tv-red hover:bg-tv-red/10"
                  : "text-tv-text hover:bg-tv-panel-hover",
            )}
          >
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}
