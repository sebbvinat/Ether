"use client";

import { useEffect, useRef, useState } from "react";
import {
  useChartStore,
  type Drawing,
  type DrawingPoint,
  type DrawingStyle,
} from "@/lib/store/chart-store";
import type { Candle } from "@/lib/binance/types";
import { formatPrice } from "@/lib/format";

const TV_GREEN = "#26a69a";
const TV_RED = "#ef5350";
const TV_BLUE = "#2962ff";
const TV_YELLOW = "#ffb74d";
const TV_TEXT = "#d1d4dc";

const FIB_LEVELS = [
  { level: 0, color: "#787b86" },
  { level: 0.236, color: "#ffb74d" },
  { level: 0.382, color: "#26a69a" },
  { level: 0.5, color: "#2962ff" },
  { level: 0.618, color: "#ab47bc" },
  { level: 0.786, color: "#ef5350" },
  { level: 1, color: "#787b86" },
];

// Wave 6A — extension levels for fibext (project beyond 1.0)
const FIB_EXT_LEVELS = [
  { level: 0, color: "#787b86" },
  { level: 0.382, color: "#26a69a" },
  { level: 0.618, color: "#ab47bc" },
  { level: 1, color: "#787b86" },
  { level: 1.272, color: "#ffb74d" },
  { level: 1.618, color: "#ef5350" },
  { level: 2, color: "#2962ff" },
  { level: 2.618, color: "#ab47bc" },
];

// Wave 6A — sub-divisions for gann box grid
const GANN_DIVS = [0.236, 0.382, 0.5, 0.618, 0.786];

interface Coord {
  x: number;
  y: number;
}

type HandleKey = "a" | "b" | "c" | "at";

interface Props {
  drawings: Drawing[];
  /** Estilos por drawing id (color, line style, extend, text, visibility, stats). */
  styles: Record<string, DrawingStyle>;
  /** Timeframe activo — usado para filtrar visibility por TF. */
  timeframe: string;
  selectedId: string | null;
  toCoord: (time: number, price: number) => Coord | null;
  fromCoord: (x: number, y: number) => DrawingPoint | null;
  onUpdate: (
    id: string,
    patch: Partial<{
      a: DrawingPoint;
      b: DrawingPoint;
      c: DrawingPoint;
      at: DrawingPoint;
      points: DrawingPoint[];
      text: string;
    }>,
  ) => void;
  onRemove: (id: string) => void;
  onSelect: (id: string | null) => void;
  /** If true, clicking a drawing removes it (eraser tool active) */
  eraserActive?: boolean;
  /** Wave 6C — hide all drawings (no render, no interaction) */
  hideDrawings?: boolean;
  /** Wave 6C — lock all drawings (no selection, no drag, no eraser) */
  lockDrawings?: boolean;
  /** True si hay una herramienta de dibujo activa (tool !== "cursor"). Cuando
   *  es true los dibujos dejan pasar el click para poder dibujar encima. */
  toolActive?: boolean;
  /** Velas visibles — usadas por anchoredVwap para computar la curva. Opcional
   *  porque el resto de los dibujos no las necesitan. */
  candles?: Candle[];
  containerWidth: number;
  containerHeight: number;
}

export function DrawingsLayer({
  drawings,
  styles,
  timeframe,
  selectedId,
  toCoord,
  fromCoord,
  onUpdate,
  onRemove,
  onSelect,
  eraserActive,
  hideDrawings,
  lockDrawings,
  toolActive,
  candles,
  containerWidth,
  containerHeight,
}: Props) {
  const openDrawingProps = useChartStore((s) => s.openDrawingProps);

  /** dash array por estilo de línea (solid/dashed/dotted). */
  function lineDash(s: DrawingStyle | undefined): string | undefined {
    if (!s || !s.lineStyle || s.lineStyle === "solid") return undefined;
    if (s.lineStyle === "dashed") return "6 4";
    return "2 3";
  }

  /** Doble click sobre el `<g>` raíz de un drawing → abre dialog de props. */
  function onDrawingDblClick(
    e: React.MouseEvent<SVGGElement>,
    id: string,
  ) {
    e.stopPropagation();
    e.preventDefault();
    openDrawingProps(id);
  }

  /** True si el drawing es visible en el TF actual según su style.visibleTfs. */
  function visibleInTf(s: DrawingStyle | undefined): boolean {
    if (!s || !s.visibleTfs) return true;
    return s.visibleTfs.includes(timeframe);
  }

  /** Caja de stats para drawings 2-pt: Δprice / %change / bars. */
  function statsBox(
    s: DrawingStyle | undefined,
    a: DrawingPoint,
    b: DrawingPoint,
    aCoord: Coord,
    bCoord: Coord,
    isHovered: boolean,
  ): React.ReactNode {
    if (!s || !s.stats || s.stats === "hidden") return null;
    if (!s.alwaysShowStats && !isHovered) return null;
    const dPrice = b.price - a.price;
    const pct = a.price === 0 ? 0 : (dPrice / a.price) * 100;
    const dDurMs = Math.abs(b.time - a.time) * 1000;
    const lines: string[] = [
      `${dPrice >= 0 ? "+" : ""}${formatPrice(dPrice)}`,
      `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`,
    ];
    if (s.stats === "extended") {
      const hours = Math.round(dDurMs / 3_600_000);
      lines.push(`${hours}h`);
    }
    const pos = s.statsPosition ?? "right";
    const anchor = pos === "right" ? bCoord : aCoord;
    const ox = pos === "right" ? 10 : -90;
    return (
      <g
        key="__stats"
        transform={`translate(${anchor.x + ox}, ${anchor.y - 8})`}
        style={{ pointerEvents: "none" }}
      >
        <rect
          width={80}
          height={lines.length * 12 + 6}
          fill="rgba(30,34,45,0.95)"
          stroke="rgba(120,123,134,0.4)"
          strokeWidth={0.5}
          rx={3}
        />
        {lines.map((ln, i) => (
          <text
            key={i}
            x={40}
            y={12 + i * 12}
            fill={TV_TEXT}
            fontSize={9}
            fontFamily="var(--font-mono), monospace"
            textAnchor="middle"
          >
            {ln}
          </text>
        ))}
      </g>
    );
  }

  /** Texto-label de drawing: <text> posicionado relativo al bounding box.
   *  bbox: { minX, minY, maxX, maxY } en coords SVG. */
  function textLabel(
    s: DrawingStyle | undefined,
    bbox: { minX: number; minY: number; maxX: number; maxY: number },
    fallbackColor: string,
  ): React.ReactNode {
    if (!s || !s.text || !s.text.trim()) return null;
    const size = s.textSize ?? 12;
    const vAlign = s.textVAlign ?? "top";
    const hAlign = s.textHAlign ?? "center";
    let x: number;
    let y: number;
    let anchor: "start" | "middle" | "end" = "middle";
    if (hAlign === "left") {
      x = bbox.minX;
      anchor = "start";
    } else if (hAlign === "right") {
      x = bbox.maxX;
      anchor = "end";
    } else {
      x = (bbox.minX + bbox.maxX) / 2;
    }
    if (vAlign === "top") y = bbox.minY - 6;
    else if (vAlign === "bottom") y = bbox.maxY + size + 2;
    else y = (bbox.minY + bbox.maxY) / 2 + size / 3;
    return (
      <text
        x={x}
        y={y}
        textAnchor={anchor}
        fill={s.textColor ?? fallbackColor}
        fontSize={size}
        fontWeight={s.textBold ? 700 : 500}
        fontStyle={s.textItalic ? "italic" : "normal"}
        fontFamily="var(--font-mono), monospace"
        style={{ pointerEvents: "none" }}
      >
        {s.text}
      </text>
    );
  }
  type DragState =
    | { id: string; handle: HandleKey }
    | { id: string; handle: "points"; index: number; basePoints: DrawingPoint[] }
    | {
        id: string;
        mode: "move";
        /** posición del cursor (px relativos al SVG) al iniciar el move */
        cursorStart: Coord;
        /** snapshot en píxeles de cada anchor del drawing al iniciar */
        anchorsPx: {
          a?: Coord;
          b?: Coord;
          c?: Coord;
          at?: Coord;
          points?: Coord[];
        };
      };
  const [hover, setHover] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  /** Ref al SVG raíz para calcular coords relativas durante el drag con
   *  listeners a nivel window (evita race condition con pointer-events:none
   *  en el SVG en el ratito entre pointerdown y el primer re-render). */
  const svgRef = useRef<SVGSVGElement | null>(null);

  function handleClick(id: string) {
    if (lockDrawings) return; // locked — no select/erase
    if (eraserActive) {
      onRemove(id);
    } else {
      onSelect(id === selectedId ? null : id);
    }
  }

  function onHandleDown(
    e: React.PointerEvent<SVGCircleElement>,
    id: string,
    handle: HandleKey,
  ) {
    e.stopPropagation();
    e.preventDefault();
    setDrag({ id, handle });
  }

  /** Drag handler for one point of an N-point drawing. Captures the base
   *  points array so move events can update only the indexed slot. */
  function onPointsHandleDown(
    e: React.PointerEvent<SVGCircleElement>,
    id: string,
    index: number,
    basePoints: DrawingPoint[],
  ) {
    e.stopPropagation();
    e.preventDefault();
    setDrag({ id, handle: "points", index, basePoints });
  }

  /** Pointerdown sobre el CUERPO de un dibujo (no un handle — los handles
   *  hacen stopPropagation) → inicia un drag de "mover todo el dibujo".
   *  Snapshotea la posición en píxeles de cada anchor; el move handler
   *  traslada todos por el mismo delta de cursor. */
  function onBodyDown(e: React.PointerEvent<SVGGElement>, d: Drawing) {
    if (lockDrawings || eraserActive) return;
    if (d.id.startsWith("__")) return;
    const svg = svgRef.current;
    if (!svg) return;
    e.stopPropagation();
    const rect = svg.getBoundingClientRect();
    const cursorStart: Coord = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    const dd = d as Drawing & {
      a?: DrawingPoint;
      b?: DrawingPoint;
      c?: DrawingPoint;
      at?: DrawingPoint;
      points?: DrawingPoint[];
    };
    const anchorsPx: {
      a?: Coord;
      b?: Coord;
      c?: Coord;
      at?: Coord;
      points?: Coord[];
    } = {};
    if (dd.a) {
      const c = toCoord(dd.a.time, dd.a.price);
      if (c) anchorsPx.a = c;
    }
    if (dd.b) {
      const c = toCoord(dd.b.time, dd.b.price);
      if (c) anchorsPx.b = c;
    }
    if (dd.c) {
      const c = toCoord(dd.c.time, dd.c.price);
      if (c) anchorsPx.c = c;
    }
    if (dd.at) {
      const c = toCoord(dd.at.time, dd.at.price);
      if (c) anchorsPx.at = c;
    }
    if (dd.points) {
      const arr: Coord[] = [];
      let ok = true;
      for (const p of dd.points) {
        const c = toCoord(p.time, p.price);
        if (!c) {
          ok = false;
          break;
        }
        arr.push(c);
      }
      if (ok) anchorsPx.points = arr;
    }
    setDrag({ id: d.id, mode: "move", cursorStart, anchorsPx });
  }

  /** Listeners de drag a nivel window — disparados sólo cuando hay un drag
   *  activo. Esto reemplaza al pointer-capture sobre el SVG, que perdía los
   *  primeros pointer-moves porque el SVG tiene pointer-events:none hasta
   *  que React re-rendere con drag !== null (race condition). Los listeners
   *  de window se attachean sincrónicamente dentro del useEffect y reciben
   *  TODOS los moves del puntero. */
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // Mover el dibujo entero: trasladar todos los anchors por el delta
      // de cursor, reconvirtiendo cada uno con fromCoord (maneja bien la
      // no-linealidad del eje precio/tiempo).
      if ("mode" in drag) {
        const dx = x - drag.cursorStart.x;
        const dy = y - drag.cursorStart.y;
        const ap = drag.anchorsPx;
        const patch: Partial<{
          a: DrawingPoint;
          b: DrawingPoint;
          c: DrawingPoint;
          at: DrawingPoint;
          points: DrawingPoint[];
        }> = {};
        if (ap.a) {
          const p = fromCoord(ap.a.x + dx, ap.a.y + dy);
          if (p) patch.a = p;
        }
        if (ap.b) {
          const p = fromCoord(ap.b.x + dx, ap.b.y + dy);
          if (p) patch.b = p;
        }
        if (ap.c) {
          const p = fromCoord(ap.c.x + dx, ap.c.y + dy);
          if (p) patch.c = p;
        }
        if (ap.at) {
          const p = fromCoord(ap.at.x + dx, ap.at.y + dy);
          if (p) patch.at = p;
        }
        if (ap.points) {
          const arr: DrawingPoint[] = [];
          let ok = true;
          for (const c of ap.points) {
            const p = fromCoord(c.x + dx, c.y + dy);
            if (!p) {
              ok = false;
              break;
            }
            arr.push(p);
          }
          if (ok) patch.points = arr;
        }
        if (Object.keys(patch).length > 0) onUpdate(drag.id, patch);
        return;
      }
      const pt = fromCoord(x, y);
      if (!pt) return;
      if (drag.handle === "points") {
        const next = drag.basePoints.slice();
        next[drag.index] = pt;
        onUpdate(drag.id, { points: next });
      } else {
        onUpdate(drag.id, { [drag.handle]: pt });
      }
    };
    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, fromCoord, onUpdate]);

  // Wave 6C — hide everything when hideDrawings is on
  if (hideDrawings) return null;

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 h-full w-full"
      style={{
        overflow: "hidden",
        // Durante el drag mantenemos pointerEvents:auto para BLOQUEAR
        // pan/zoom de la chart de abajo mientras arrastramos un handle.
        // Cuando no hay drag → "none" deja pasar los eventos a la chart.
        // Los moves del drag se procesan vía listeners de window (más
        // arriba, useEffect dependiente de `drag`), no vía handlers del SVG.
        pointerEvents: drag ? "auto" : "none",
        zIndex: 5,
      }}
    >
      {drawings.map((d) => {
        const isPreview = d.id.startsWith("__");
        // Look up style + filter por visibility por TF (skip si está oculto)
        const ds = isPreview ? undefined : styles[d.id];
        if (!isPreview && !visibleInTf(ds)) return null;
        const isSelected = !isPreview && selectedId === d.id;
        const isHovered = !isPreview && hover === d.id;
        const isDragging = !isPreview && drag?.id === d.id;
        const showHandles =
          !lockDrawings && !isPreview && (isSelected || isHovered || isDragging);
        const hideHandle = !showHandles;
        const selectedWidth = isSelected ? 1 : 0;
        // dasharray + width customizable por style
        const dashArr = lineDash(ds);
        const styleWidth = ds?.lineWidth;
        // helper: stroke width final aplicando style + selected bump
        const sw = (base: number) =>
          (styleWidth ?? base) + selectedWidth;
        // Opacidad del dibujo (style.opacity 0-100 → 0-1).
        const drawOpacity = ds?.opacity != null ? ds.opacity / 100 : 1;
        const grStyle: React.CSSProperties = isPreview
          ? { pointerEvents: "none", opacity: 0.7 }
          : {
              // toolActive → "none": el click pasa de largo y permite
              //   dibujar ENCIMA de dibujos ya existentes.
              // si no → "visibleStroke": sólo el trazo/borde captura el
              //   puntero; el RELLENO de los shapes (rect, caja long/short,
              //   canal, etc.) deja pasar el click a lo que está debajo.
              pointerEvents: toolActive ? "none" : "visibleStroke",
              cursor: eraserActive
                ? "crosshair"
                : lockDrawings
                  ? "pointer"
                  : "move",
              opacity: drawOpacity,
            };
        if (d.type === "trendline" || d.type === "arrow") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const isUp = d.b.price >= d.a.price;
          const baseColor = isUp ? TV_GREEN : TV_RED;
          const color = ds?.color ?? baseColor;
          // Extend: calcular endpoints visibles según extend (none/right/left/both)
          let drawA = a;
          let drawB = b;
          if (
            d.type === "trendline" &&
            ds?.extend &&
            ds.extend !== "none" &&
            a.x !== b.x
          ) {
            const m = (b.y - a.y) / (b.x - a.x);
            const yAt = (x: number) => a.y + m * (x - a.x);
            if (ds.extend === "left" || ds.extend === "both") {
              drawA = { x: 0, y: yAt(0) };
            }
            if (ds.extend === "right" || ds.extend === "both") {
              drawB = { x: containerWidth, y: yAt(containerWidth) };
            }
          }
          // Middle point dot (sólo trendline)
          const midPoint =
            d.type === "trendline" && ds?.showMiddlePoint
              ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
              : null;
          // Arrow head
          let headRender: React.ReactNode = null;
          if (d.type === "arrow") {
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const size = 10;
            // Perpendicular vector
            const px = -uy;
            const py = ux;
            const baseX = b.x - ux * size;
            const baseY = b.y - uy * size;
            const leftX = baseX + px * (size * 0.5);
            const leftY = baseY + py * (size * 0.5);
            const rightX = baseX - px * (size * 0.5);
            const rightY = baseY - py * (size * 0.5);
            headRender = (
              <polygon
                points={`${b.x},${b.y} ${leftX},${leftY} ${rightX},${rightY}`}
                fill={color}
              />
            );
          }
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              {/* invisible hit area for easier click */}
              <line
                x1={drawA.x}
                y1={drawA.y}
                x2={drawB.x}
                y2={drawB.y}
                stroke="transparent"
                strokeWidth={12}
              />
              <line
                x1={drawA.x}
                y1={drawA.y}
                x2={drawB.x}
                y2={drawB.y}
                stroke={color}
                strokeWidth={sw(1.5)}
                strokeDasharray={dashArr}
              />
              {midPoint && (
                <circle
                  cx={midPoint.x}
                  cy={midPoint.y}
                  r={3}
                  fill={color}
                />
              )}
              {headRender}
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              {textLabel(
                ds,
                {
                  minX: Math.min(a.x, b.x),
                  minY: Math.min(a.y, b.y),
                  maxX: Math.max(a.x, b.x),
                  maxY: Math.max(a.y, b.y),
                },
                color,
              )}
              {statsBox(ds, d.a, d.b, a, b, isHovered)}
              {hover === d.id && (
                <RemoveHandle
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        if (d.type === "hrange") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const yTop = Math.min(a.y, b.y);
          const yBottom = Math.max(a.y, b.y);
          const priceTop = Math.max(d.a.price, d.b.price);
          const priceBottom = Math.min(d.a.price, d.b.price);
          const range = priceTop - priceBottom;
          const isUp = d.b.price >= d.a.price;
          const color = ds?.color ?? (isUp ? TV_GREEN : TV_RED);
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              <rect
                x={0}
                y={yTop}
                width={containerWidth}
                height={yBottom - yTop}
                fill={color}
                fillOpacity={0.08}
              />
              <line
                x1={0}
                y1={yTop}
                x2={containerWidth}
                y2={yTop}
                stroke={color}
                strokeWidth={1}
              />
              <line
                x1={0}
                y1={yBottom}
                x2={containerWidth}
                y2={yBottom}
                stroke={color}
                strokeWidth={1}
              />
              <text
                x={8}
                y={(yTop + yBottom) / 2}
                fill={color}
                fontSize={11}
                fontFamily="var(--font-sans), Inter, sans-serif"
              >
                {priceTop.toFixed(2)} → {priceBottom.toFixed(2)} (Δ{" "}
                {range.toFixed(2)})
              </text>
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={containerWidth - 20}
                  y={yTop + 8}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        if (d.type === "fib") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const yHigh = Math.min(a.y, b.y);
          const yLow = Math.max(a.y, b.y);
          const priceHigh = Math.max(d.a.price, d.b.price);
          const priceLow = Math.min(d.a.price, d.b.price);
          const xLeft = Math.min(a.x, b.x);
          const xRight = containerWidth;
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              {FIB_LEVELS.map(({ level, color }) => {
                const y = yHigh + (yLow - yHigh) * level;
                const price = priceHigh - (priceHigh - priceLow) * level;
                return (
                  <g key={level}>
                    <line
                      x1={xLeft}
                      y1={y}
                      x2={xRight}
                      y2={y}
                      stroke={color}
                      strokeWidth={1}
                      strokeOpacity={0.7}
                      strokeDasharray={level === 0 || level === 1 ? "" : "4 3"}
                    />
                    <text
                      x={xLeft + 4}
                      y={y - 3}
                      fill={color}
                      fontSize={10}
                      fontFamily="var(--font-sans), Inter, sans-serif"
                    >
                      {level.toFixed(3)} ({price.toFixed(2)})
                    </text>
                  </g>
                );
              })}
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={a.x}
                  y={a.y - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        if (d.type === "rect") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const x = Math.min(a.x, b.x);
          const y = Math.min(a.y, b.y);
          const w = Math.abs(b.x - a.x);
          const h = Math.abs(b.y - a.y);
          const isUp = d.b.price >= d.a.price;
          const color = ds?.color ?? (isUp ? TV_GREEN : TV_RED);
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill={color}
                fillOpacity={0.1}
                stroke={color}
                strokeWidth={1}
              />
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={x + w}
                  y={y - 4}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        if (d.type === "ray") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const isUp = d.b.price >= d.a.price;
          const color = ds?.color ?? (isUp ? TV_GREEN : TV_RED);
          // Extend beyond b in the same direction up to the right edge
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          let endX = b.x;
          let endY = b.y;
          if (Math.abs(dx) > 0.001) {
            const t = (containerWidth - a.x) / dx;
            if (t > 1) {
              endX = a.x + dx * t;
              endY = a.y + dy * t;
            }
          }
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              <line
                x1={a.x}
                y1={a.y}
                x2={endX}
                y2={endY}
                stroke="transparent"
                strokeWidth={12}
              />
              <line
                x1={a.x}
                y1={a.y}
                x2={endX}
                y2={endY}
                stroke={color}
                strokeWidth={1.5 + selectedWidth}
              />
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        if (d.type === "vline") {
          const p = toCoord(d.at.time, d.at.price);
          if (!p) return null;
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              <line
                x1={p.x}
                y1={0}
                x2={p.x}
                y2={containerHeight}
                stroke="transparent"
                strokeWidth={12}
              />
              <line
                x1={p.x}
                y1={0}
                x2={p.x}
                y2={containerHeight}
                stroke={TV_BLUE}
                strokeWidth={1 + selectedWidth}
                strokeDasharray="4 3"
              />
              <DragHandle
                cx={p.x}
                cy={Math.max(20, Math.min(containerHeight - 20, p.y))}
                onDown={(e) => onHandleDown(e, d.id, "at")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={p.x + 10}
                  y={20}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        if (d.type === "hlineExt") {
          const p = toCoord(d.at.time, d.at.price);
          if (!p) return null;
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              <line
                x1={0}
                y1={p.y}
                x2={containerWidth}
                y2={p.y}
                stroke="transparent"
                strokeWidth={12}
              />
              <line
                x1={0}
                y1={p.y}
                x2={containerWidth}
                y2={p.y}
                stroke={TV_BLUE}
                strokeWidth={1 + selectedWidth}
                strokeDasharray="4 3"
              />
              <text
                x={8}
                y={p.y - 3}
                fill={TV_BLUE}
                fontSize={11}
                fontFamily="var(--font-sans), Inter, sans-serif"
              >
                {d.at.price.toFixed(2)}
              </text>
              <DragHandle
                cx={Math.min(p.x, containerWidth - 10)}
                cy={p.y}
                onDown={(e) => onHandleDown(e, d.id, "at")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={containerWidth - 16}
                  y={p.y - 12}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        if (d.type === "long" || d.type === "short") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          const c = toCoord(d.c.time, d.c.price);
          if (!a || !b || !c) return null;
          const isLong = d.type === "long";
          const entry = d.a.price;
          const stop = d.b.price;
          const target = d.c.price;
          const risk = Math.abs(entry - stop);
          const reward = Math.abs(target - entry);
          const rr = risk > 0 ? reward / risk : 0;
          // Validate direction
          const stopOk = isLong ? stop < entry : stop > entry;
          const targetOk = isLong ? target > entry : target < entry;
          const xLeft = a.x;
          // Use a finite right edge (entry + 60px or further-out handle), preview extends a bit more
          const xRight = isPreview
            ? a.x + 80
            : Math.max(a.x + 60, Math.max(b.x, c.x));
          // Show a thin full-width dashed guide line ONLY while the user is dragging the SL or TP handle
          const dragForThis = drag && drag.id === d.id ? drag : null;
          const dragHandle =
            dragForThis && "handle" in dragForThis
              ? dragForThis.handle
              : null;
          const showSLGuide = !isPreview && dragHandle === "b";
          const showTPGuide = !isPreview && dragHandle === "c";
          // Stop zone (red) and Target zone (green)
          const stopY1 = Math.min(a.y, b.y);
          const stopY2 = Math.max(a.y, b.y);
          const targetY1 = Math.min(a.y, c.y);
          const targetY2 = Math.max(a.y, c.y);
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              {/* Stop zone (red translucent) */}
              <rect
                x={xLeft}
                y={stopY1}
                width={xRight - xLeft}
                height={stopY2 - stopY1}
                fill={TV_RED}
                fillOpacity={stopOk ? 0.15 : 0.05}
                stroke={TV_RED}
                strokeWidth={1}
              />
              {/* Target zone (green translucent) */}
              <rect
                x={xLeft}
                y={targetY1}
                width={xRight - xLeft}
                height={targetY2 - targetY1}
                fill={TV_GREEN}
                fillOpacity={targetOk ? 0.15 : 0.05}
                stroke={TV_GREEN}
                strokeWidth={1}
              />
              {/* Entry line */}
              <line
                x1={xLeft}
                y1={a.y}
                x2={xRight}
                y2={a.y}
                stroke={TV_BLUE}
                strokeWidth={1.5}
              />
              {/* While dragging SL handle: full-width dashed guide */}
              {showSLGuide && (
                <line
                  x1={0}
                  y1={b.y}
                  x2={containerWidth}
                  y2={b.y}
                  stroke={TV_RED}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  opacity={0.7}
                />
              )}
              {/* While dragging TP handle: full-width dashed guide */}
              {showTPGuide && (
                <line
                  x1={0}
                  y1={c.y}
                  x2={containerWidth}
                  y2={c.y}
                  stroke={TV_GREEN}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  opacity={0.7}
                />
              )}
              {/* Labels */}
              <text
                x={xLeft + 4}
                y={a.y - 3}
                fill={TV_BLUE}
                fontSize={10}
                fontFamily="var(--font-sans), Inter, sans-serif"
              >
                Entry {entry.toFixed(2)} · {isLong ? "LONG" : "SHORT"} · R:R{" "}
                {rr.toFixed(2)}
              </text>
              <text
                x={xLeft + 4}
                y={(stopY1 + stopY2) / 2 + 4}
                fill={TV_RED}
                fontSize={10}
                fontFamily="var(--font-sans), Inter, sans-serif"
              >
                SL {stop.toFixed(2)} ({risk.toFixed(2)})
              </text>
              <text
                x={xLeft + 4}
                y={(targetY1 + targetY2) / 2 + 4}
                fill={TV_GREEN}
                fontSize={10}
                fontFamily="var(--font-sans), Inter, sans-serif"
              >
                TP {target.toFixed(2)} ({reward.toFixed(2)})
              </text>
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={a.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={a.x}
                cy={c.y}
                onDown={(e) => onHandleDown(e, d.id, "c")}
                hidden={hideHandle}
              />
              {!isPreview && hover === d.id && (
                <RemoveHandle
                  x={xRight - 16}
                  y={a.y - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        if (d.type === "text") {
          const p = toCoord(d.at.time, d.at.price);
          if (!p) return null;
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              <text
                x={p.x}
                y={p.y}
                fill={TV_YELLOW}
                fontSize={12}
                fontFamily="var(--font-sans), Inter, sans-serif"
                style={{ userSelect: "none" }}
              >
                {d.text}
              </text>
              <DragHandle
                cx={p.x - 4}
                cy={p.y - 4}
                onDown={(e) => onHandleDown(e, d.id, "at")}
                small
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={p.x + Math.max(20, d.text.length * 7)}
                  y={p.y - 12}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // ============================================================
        // Wave 6A — 14 nuevas herramientas (1 y 2 puntos)
        // ============================================================

        // --- hline (1pt, full-width dashed) ---
        if (d.type === "hline") {
          const a = toCoord(d.at.time, d.at.price);
          if (!a) return null;
          const color = ds?.color ?? d.color ?? TV_BLUE;
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              <line
                x1={0}
                y1={a.y}
                x2={containerWidth}
                y2={a.y}
                stroke="transparent"
                strokeWidth={12}
              />
              <line
                x1={0}
                y1={a.y}
                x2={containerWidth}
                y2={a.y}
                stroke={color}
                strokeWidth={1 + selectedWidth}
                strokeDasharray="4 3"
              />
              <rect
                x={containerWidth - 70}
                y={a.y - 9}
                width={64}
                height={18}
                fill={color}
                opacity={0.85}
              />
              <text
                x={containerWidth - 38}
                y={a.y + 4}
                fill="#fff"
                fontSize={10}
                fontFamily="var(--font-mono), monospace"
                textAnchor="middle"
              >
                {d.at.price.toFixed(2)}
              </text>
              <DragHandle
                cx={containerWidth / 2}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "at")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={containerWidth / 2 + 14}
                  y={a.y - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- cross (1pt H+V dashed cross) ---
        if (d.type === "cross") {
          const a = toCoord(d.at.time, d.at.price);
          if (!a) return null;
          const color = ds?.color ?? d.color ?? TV_BLUE;
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              <line
                x1={0}
                y1={a.y}
                x2={containerWidth}
                y2={a.y}
                stroke={color}
                strokeWidth={1 + selectedWidth}
                strokeDasharray="4 3"
              />
              <line
                x1={a.x}
                y1={0}
                x2={a.x}
                y2={containerHeight}
                stroke={color}
                strokeWidth={1 + selectedWidth}
                strokeDasharray="4 3"
              />
              <rect
                x={containerWidth - 70}
                y={a.y - 9}
                width={64}
                height={18}
                fill={color}
                opacity={0.85}
              />
              <text
                x={containerWidth - 38}
                y={a.y + 4}
                fill="#fff"
                fontSize={10}
                fontFamily="var(--font-mono), monospace"
                textAnchor="middle"
              >
                {d.at.price.toFixed(2)}
              </text>
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "at")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={a.x + 14}
                  y={a.y - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- flag (1pt pin marker) ---
        if (d.type === "flag") {
          const a = toCoord(d.at.time, d.at.price);
          if (!a) return null;
          const color = ds?.color ?? d.color ?? TV_YELLOW;
          const flagH = 18;
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              <line
                x1={a.x}
                y1={a.y}
                x2={a.x}
                y2={a.y + flagH}
                stroke={color}
                strokeWidth={1.5 + selectedWidth}
              />
              <polygon
                points={`${a.x},${a.y} ${a.x + 12},${a.y + 4} ${a.x},${a.y + 8}`}
                fill={color}
              />
              {d.text && (
                <text
                  x={a.x + 16}
                  y={a.y + 6}
                  fill={TV_TEXT}
                  fontSize={10}
                  fontFamily="var(--font-sans), Inter, sans-serif"
                >
                  {d.text}
                </text>
              )}
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "at")}
                hidden={hideHandle}
                small
              />
              {hover === d.id && (
                <RemoveHandle
                  x={a.x + 14}
                  y={a.y - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- plabel (1pt right-edge price badge) ---
        if (d.type === "plabel") {
          const a = toCoord(d.at.time, d.at.price);
          if (!a) return null;
          const color = ds?.color ?? d.color ?? TV_BLUE;
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              <line
                x1={a.x}
                y1={a.y}
                x2={containerWidth - 82}
                y2={a.y}
                stroke={color}
                strokeWidth={0.75}
                strokeDasharray="3 3"
                opacity={0.5}
              />
              <rect
                x={containerWidth - 82}
                y={a.y - 10}
                width={78}
                height={20}
                fill={color}
                opacity={0.95}
                rx={2}
              />
              <text
                x={containerWidth - 43}
                y={a.y + 4}
                fill="#fff"
                fontSize={11}
                fontFamily="var(--font-mono), monospace"
                fontWeight={500}
                textAnchor="middle"
              >
                {d.text ?? d.at.price.toFixed(2)}
              </text>
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "at")}
                hidden={hideHandle}
                small
              />
              {hover === d.id && (
                <RemoveHandle
                  x={a.x + 14}
                  y={a.y - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- ellipse (2pt diagonal corners) ---
        if (d.type === "ellipse") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const cx = (a.x + b.x) / 2;
          const cy = (a.y + b.y) / 2;
          const rx = Math.abs(b.x - a.x) / 2;
          const ry = Math.abs(b.y - a.y) / 2;
          const color = ds?.color ?? d.color ?? (d.b.price >= d.a.price ? TV_GREEN : TV_RED);
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              <ellipse
                cx={cx}
                cy={cy}
                rx={rx}
                ry={ry}
                stroke={color}
                strokeWidth={1.5 + selectedWidth}
                fill={color}
                fillOpacity={0.08}
              />
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={cx}
                  y={Math.min(a.y, b.y) - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- trange (2pt vertical date band, full height) ---
        if (d.type === "trange") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const xL = Math.min(a.x, b.x);
          const xW = Math.abs(b.x - a.x);
          const color = ds?.color ?? d.color ?? TV_BLUE;
          // Estimate bars by guessing avg bar pixel width (rough)
          const bars = Math.max(1, Math.round(xW / 6));
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              <rect
                x={xL}
                y={0}
                width={xW}
                height={containerHeight}
                fill={color}
                fillOpacity={0.08}
                stroke={color}
                strokeWidth={1 + selectedWidth}
                strokeDasharray="4 3"
              />
              <text
                x={xL + xW / 2}
                y={16}
                fill={color}
                fontSize={11}
                fontFamily="var(--font-mono), monospace"
                textAnchor="middle"
              >
                ~{bars} bars
              </text>
              <DragHandle
                cx={a.x}
                cy={containerHeight / 2}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={containerHeight / 2}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={xL + xW / 2 + 30}
                  y={20}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- forecast (2pt projection rect with Δ labels) ---
        if (d.type === "forecast") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const isUp = d.b.price >= d.a.price;
          const color = ds?.color ?? d.color ?? (isUp ? TV_GREEN : TV_RED);
          const x = Math.min(a.x, b.x);
          const y = Math.min(a.y, b.y);
          const w = Math.abs(b.x - a.x);
          const h = Math.abs(b.y - a.y);
          const dp = d.b.price - d.a.price;
          const dpct = d.a.price ? (dp / d.a.price) * 100 : 0;
          const bars = Math.max(1, Math.round(w / 6));
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill={color}
                fillOpacity={0.1}
                stroke={color}
                strokeWidth={1 + selectedWidth}
              />
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={color}
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              <text
                x={x + w / 2}
                y={y - 6}
                fill={color}
                fontSize={11}
                fontFamily="var(--font-mono), monospace"
                textAnchor="middle"
              >
                {dp >= 0 ? "+" : ""}
                {dp.toFixed(2)} ({dpct >= 0 ? "+" : ""}
                {dpct.toFixed(2)}%) · {bars}b
              </text>
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={x + w / 2}
                  y={y - 22}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- cycle (2pt repeating vlines at constant period) ---
        if (d.type === "cycle") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const color = ds?.color ?? d.color ?? TV_BLUE;
          const period = Math.abs(b.x - a.x);
          if (period < 4) return null;
          const startX = Math.min(a.x, b.x);
          const lines: number[] = [];
          for (let x = startX; x < containerWidth; x += period) {
            lines.push(x);
          }
          for (let x = startX - period; x > 0; x -= period) {
            lines.push(x);
          }
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              {lines.map((x, i) => (
                <line
                  key={i}
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={containerHeight}
                  stroke={color}
                  strokeWidth={Math.abs(x - a.x) < 1 || Math.abs(x - b.x) < 1 ? 1.5 + selectedWidth : 1}
                  strokeDasharray="3 3"
                  opacity={
                    Math.abs(x - a.x) < 1 || Math.abs(x - b.x) < 1 ? 0.9 : 0.5
                  }
                />
              ))}
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- regression (2pt linear regression channel) ---
        if (d.type === "regression") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const color = ds?.color ?? d.color ?? TV_BLUE;
          // Band offset perpendicular to the trend line — using a simple
          // y-axis offset proportional to the y delta for a clean look.
          const bandHalf = Math.max(8, Math.abs(b.y - a.y) * 0.25);
          const ax = a.x;
          const bx = b.x;
          const ay = a.y;
          const by = b.y;
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              <polygon
                points={`${ax},${ay - bandHalf} ${bx},${by - bandHalf} ${bx},${by + bandHalf} ${ax},${ay + bandHalf}`}
                fill={color}
                fillOpacity={0.08}
              />
              <line
                x1={ax}
                y1={ay - bandHalf}
                x2={bx}
                y2={by - bandHalf}
                stroke={color}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <line
                x1={ax}
                y1={ay + bandHalf}
                x2={bx}
                y2={by + bandHalf}
                stroke={color}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <line
                x1={ax}
                y1={ay}
                x2={bx}
                y2={by}
                stroke={color}
                strokeWidth={1.5 + selectedWidth}
              />
              <DragHandle
                cx={ax}
                cy={ay}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={bx}
                cy={by}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={(ax + bx) / 2}
                  y={(ay + by) / 2 - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- fibext (2pt Fibonacci extension; levels include >1.0) ---
        if (d.type === "fibext") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const diff = d.b.price - d.a.price;
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              {FIB_EXT_LEVELS.map(({ level, color }) => {
                const levelPrice = d.a.price + diff * level;
                const lp = toCoord(d.b.time, levelPrice);
                if (!lp) return null;
                const ly = lp.y;
                return (
                  <g key={level}>
                    <line
                      x1={Math.min(a.x, b.x)}
                      y1={ly}
                      x2={containerWidth}
                      y2={ly}
                      stroke={color}
                      strokeWidth={1 + selectedWidth}
                      strokeDasharray="3 3"
                      opacity={0.7}
                    />
                    <rect
                      x={containerWidth - 90}
                      y={ly - 8}
                      width={86}
                      height={16}
                      fill={color}
                      opacity={0.18}
                    />
                    <text
                      x={containerWidth - 48}
                      y={ly + 4}
                      fill={color}
                      fontSize={10}
                      fontFamily="var(--font-mono), monospace"
                      textAnchor="middle"
                    >
                      {level.toFixed(3).replace(/\.?0+$/, "")} · {levelPrice.toFixed(2)}
                    </text>
                  </g>
                );
              })}
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={TV_TEXT}
                strokeWidth={1}
                opacity={0.5}
                strokeDasharray="2 4"
              />
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- fibarc (2pt Fib semicircles centered at A, radius |AB|) ---
        if (d.type === "fibarc") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const color = ds?.color ?? d.color ?? TV_BLUE;
          const r = Math.hypot(b.x - a.x, b.y - a.y);
          if (r < 4) return null;
          const ratios = [0.382, 0.5, 0.618, 1.0];
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              {ratios.map((ratio, i) => {
                const rr = r * ratio;
                // semicircle: a sweep arc from (a.x - rr, a.y) to (a.x + rr, a.y) going down
                const path = `M ${a.x - rr} ${a.y} A ${rr} ${rr} 0 0 0 ${a.x + rr} ${a.y}`;
                return (
                  <path
                    key={i}
                    d={path}
                    stroke={color}
                    strokeWidth={1 + selectedWidth}
                    strokeDasharray="3 3"
                    fill="none"
                    opacity={0.7}
                  />
                );
              })}
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={color}
                strokeWidth={0.75}
                strokeDasharray="2 4"
                opacity={0.5}
              />
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={a.x}
                  y={a.y - r - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- fibfan (2pt Fib radiating lines from A through ratio-scaled B) ---
        if (d.type === "fibfan") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const color = ds?.color ?? d.color ?? TV_BLUE;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const ratios = [0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              {ratios.map((r, i) => {
                // Endpoint: extend far along ratio-scaled direction
                const ex = a.x + dx * 20;
                const ey = a.y + dy * r * 20;
                return (
                  <line
                    key={i}
                    x1={a.x}
                    y1={a.y}
                    x2={ex}
                    y2={ey}
                    stroke={color}
                    strokeWidth={1 + selectedWidth}
                    opacity={0.65}
                  />
                );
              })}
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={a.x}
                  y={a.y - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- gannbox (2pt rect with inner grid + diagonals) ---
        if (d.type === "gannbox") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const color = ds?.color ?? d.color ?? TV_BLUE;
          const x = Math.min(a.x, b.x);
          const y = Math.min(a.y, b.y);
          const w = Math.abs(b.x - a.x);
          const h = Math.abs(b.y - a.y);
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill={color}
                fillOpacity={0.04}
                stroke={color}
                strokeWidth={1 + selectedWidth}
              />
              {GANN_DIVS.map((div, i) => (
                <line
                  key={`v${i}`}
                  x1={x + w * div}
                  y1={y}
                  x2={x + w * div}
                  y2={y + h}
                  stroke={color}
                  strokeWidth={0.5}
                  opacity={0.4}
                  strokeDasharray="2 3"
                />
              ))}
              {GANN_DIVS.map((div, i) => (
                <line
                  key={`h${i}`}
                  x1={x}
                  y1={y + h * div}
                  x2={x + w}
                  y2={y + h * div}
                  stroke={color}
                  strokeWidth={0.5}
                  opacity={0.4}
                  strokeDasharray="2 3"
                />
              ))}
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={color}
                strokeWidth={0.75}
                opacity={0.6}
              />
              <line
                x1={a.x}
                y1={b.y}
                x2={b.x}
                y2={a.y}
                stroke={color}
                strokeWidth={0.75}
                opacity={0.6}
              />
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={x + w / 2}
                  y={y - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- trendangle (2pt trendline + reference horiz + angle arc + label) ---
        if (d.type === "trendangle") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const isUp = d.b.price >= d.a.price;
          const color = ds?.color ?? d.color ?? (isUp ? TV_GREEN : TV_RED);
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const angleDeg = (Math.atan2(-dy, dx) * 180) / Math.PI;
          const pricePct = d.a.price
            ? ((d.b.price - d.a.price) / d.a.price) * 100
            : 0;
          // Arc: 20px radius at A, from horizontal to the trend direction
          const arcR = 20;
          // Endpoint of arc (along the trend direction)
          const len = Math.hypot(dx, dy) || 1;
          const arcEndX = a.x + (dx / len) * arcR;
          const arcEndY = a.y + (dy / len) * arcR;
          const sweep = dy < 0 ? 0 : 1;
          const arcPath = `M ${a.x + arcR} ${a.y} A ${arcR} ${arcR} 0 0 ${sweep} ${arcEndX} ${arcEndY}`;
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="transparent"
                strokeWidth={12}
              />
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={color}
                strokeWidth={1.5 + selectedWidth}
              />
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={a.y}
                stroke={color}
                strokeWidth={0.75}
                strokeDasharray="3 3"
                opacity={0.5}
              />
              <path d={arcPath} stroke={color} strokeWidth={1} fill="none" />
              <text
                x={a.x + arcR + 6}
                y={a.y - 4}
                fill={color}
                fontSize={11}
                fontFamily="var(--font-mono), monospace"
              >
                {angleDeg.toFixed(1)}° · {pricePct >= 0 ? "+" : ""}
                {pricePct.toFixed(2)}%
              </text>
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // ============================================================
        // Wave 6B — 11 nuevas herramientas multi-punto + callout + gannfan
        // ============================================================

        // helper: convert d.points → SVG coords; null if any off-chart
        const renderNPoint = (
          dd: typeof d & { points: DrawingPoint[] },
          color: string,
          renderShape: (pts: Coord[]) => React.ReactNode,
        ): React.ReactNode => {
          const pts = dd.points.map((p) => toCoord(p.time, p.price));
          if (pts.some((p) => p == null)) return null;
          const coords = pts as Coord[];
          const xs = coords.map((c) => c.x);
          const ys = coords.map((c) => c.y);
          const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
          const yMin = Math.min(...ys);
          return (
            <g
              key={dd.id}
              onMouseEnter={() => setHover(dd.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(dd.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, dd.id)}
              onPointerDown={(e) => onBodyDown(e, dd)}
              style={grStyle}
            >
              {renderShape(coords)}
              {coords.map((c, i) => (
                <DragHandle
                  key={`h-${i}`}
                  cx={c.x}
                  cy={c.y}
                  onDown={(e) =>
                    onPointsHandleDown(e, dd.id, i, dd.points)
                  }
                  hidden={hideHandle}
                />
              ))}
              {hover === dd.id && (
                <RemoveHandle
                  x={cx}
                  y={yMin - 14}
                  onRemove={() => onRemove(dd.id)}
                />
              )}
              {/* unused color binding kept for symmetry */}
              <title>{color}</title>
            </g>
          );
        };

        // --- channel (3pt) — parallel channel ---
        if (d.type === "channel") {
          if (d.points.length < 3) return null;
          const color =
            d.color ?? (d.points[1].price >= d.points[0].price ? TV_GREEN : TV_RED);
          return renderNPoint(d, color, (pts) => {
            const [a, b, c] = pts;
            // Offset for second parallel line = c's y minus interpolated y at c.x on line ab
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const tAtC = dx !== 0 ? (c.x - a.x) / dx : 0;
            const yLineAtC = a.y + dy * tAtC;
            const offset = c.y - yLineAtC;
            const a2 = { x: a.x, y: a.y + offset };
            const b2 = { x: b.x, y: b.y + offset };
            return (
              <>
                <polygon
                  points={`${a.x},${a.y} ${b.x},${b.y} ${b2.x},${b2.y} ${a2.x},${a2.y}`}
                  fill={color}
                  fillOpacity={0.06}
                />
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={color}
                  strokeWidth={1.5 + selectedWidth}
                />
                <line
                  x1={a2.x}
                  y1={a2.y}
                  x2={b2.x}
                  y2={b2.y}
                  stroke={color}
                  strokeWidth={1.5 + selectedWidth}
                />
              </>
            );
          });
        }

        // --- pitch (pitchfork, 3pt) ---
        if (d.type === "pitch") {
          if (d.points.length < 3) return null;
          const color =
            d.color ?? (d.points[2].price >= d.points[1].price ? TV_GREEN : TV_RED);
          return renderNPoint(d, color, (pts) => {
            const [a, b, c] = pts;
            const mx = (b.x + c.x) / 2;
            const my = (b.y + c.y) / 2;
            // Direction of median
            const dx = mx - a.x;
            const dy = my - a.y;
            // Extend median far to the right; tines parallel to median from b, c
            const fac = 6;
            const medianEnd = { x: mx + dx * fac, y: my + dy * fac };
            const tineB = { x: b.x + dx * fac, y: b.y + dy * fac };
            const tineC = { x: c.x + dx * fac, y: c.y + dy * fac };
            return (
              <>
                <polygon
                  points={`${b.x},${b.y} ${tineB.x},${tineB.y} ${tineC.x},${tineC.y} ${c.x},${c.y}`}
                  fill={color}
                  fillOpacity={0.06}
                />
                <line
                  x1={b.x}
                  y1={b.y}
                  x2={c.x}
                  y2={c.y}
                  stroke={color}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.6}
                />
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={medianEnd.x}
                  y2={medianEnd.y}
                  stroke={color}
                  strokeWidth={1.5 + selectedWidth}
                />
                <line
                  x1={b.x}
                  y1={b.y}
                  x2={tineB.x}
                  y2={tineB.y}
                  stroke={color}
                  strokeWidth={1.5 + selectedWidth}
                />
                <line
                  x1={c.x}
                  y1={c.y}
                  x2={tineC.x}
                  y2={tineC.y}
                  stroke={color}
                  strokeWidth={1.5 + selectedWidth}
                />
              </>
            );
          });
        }

        // --- triangle (3pt) / triangle3 (3pt) ---
        if (d.type === "triangle" || d.type === "triangle3") {
          if (d.points.length < 3) return null;
          const color = ds?.color ?? d.color ?? TV_BLUE;
          return renderNPoint(d, color, (pts) => {
            const polyStr = pts.map((p) => `${p.x},${p.y}`).join(" ");
            return (
              <polygon
                points={polyStr}
                fill={color}
                fillOpacity={0.08}
                stroke={color}
                strokeWidth={1.5 + selectedWidth}
              />
            );
          });
        }

        // --- elliott3 (3pt: a/b/c) ---
        if (d.type === "elliott3") {
          if (d.points.length < 3) return null;
          const color = ds?.color ?? d.color ?? TV_BLUE;
          const labels = ["a", "b", "c"];
          return renderNPoint(d, color, (pts) => (
            <>
              <polyline
                points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                stroke={color}
                strokeWidth={1.5 + selectedWidth}
                fill="none"
              />
              {pts.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={6} fill={color} fillOpacity={0.85} />
                  <text
                    x={p.x}
                    y={p.y + 3}
                    fill="#000"
                    fontSize={9}
                    fontWeight={700}
                    fontFamily="var(--font-mono), monospace"
                    textAnchor="middle"
                  >
                    {labels[i]}
                  </text>
                </g>
              ))}
            </>
          ));
        }

        // --- abcd (4pt: A/B/C/D) ---
        if (d.type === "abcd") {
          if (d.points.length < 4) return null;
          const color = ds?.color ?? d.color ?? TV_BLUE;
          const labels = ["A", "B", "C", "D"];
          return renderNPoint(d, color, (pts) => (
            <>
              <polyline
                points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                stroke={color}
                strokeWidth={1.5 + selectedWidth}
                fill="none"
              />
              {pts.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={4} fill={color} />
                  <text
                    x={p.x + 8}
                    y={p.y - 6}
                    fill={color}
                    fontSize={11}
                    fontWeight={700}
                    fontFamily="var(--font-mono), monospace"
                  >
                    {labels[i]}
                  </text>
                </g>
              ))}
            </>
          ));
        }

        // --- xabcd (5pt: X/A/B/C/D) ---
        if (d.type === "xabcd") {
          if (d.points.length < 5) return null;
          const color = ds?.color ?? d.color ?? TV_BLUE;
          const labels = ["X", "A", "B", "C", "D"];
          return renderNPoint(d, color, (pts) => (
            <>
              <polyline
                points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                stroke={color}
                strokeWidth={1.5 + selectedWidth}
                fill="none"
              />
              {pts.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={4} fill={color} />
                  <text
                    x={p.x + 8}
                    y={p.y - 6}
                    fill={color}
                    fontSize={11}
                    fontWeight={700}
                    fontFamily="var(--font-mono), monospace"
                  >
                    {labels[i]}
                  </text>
                </g>
              ))}
            </>
          ));
        }

        // --- elliott5 (5pt: 1/2/3/4/5) ---
        if (d.type === "elliott5") {
          if (d.points.length < 5) return null;
          const color = ds?.color ?? d.color ?? TV_BLUE;
          const labels = ["1", "2", "3", "4", "5"];
          return renderNPoint(d, color, (pts) => (
            <>
              <polyline
                points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                stroke={color}
                strokeWidth={1.5 + selectedWidth}
                fill="none"
              />
              {pts.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={7} fill={color} fillOpacity={0.85} />
                  <text
                    x={p.x}
                    y={p.y + 4}
                    fill="#000"
                    fontSize={10}
                    fontWeight={700}
                    fontFamily="var(--font-mono), monospace"
                    textAnchor="middle"
                  >
                    {labels[i]}
                  </text>
                </g>
              ))}
            </>
          ));
        }

        // --- hs (head-and-shoulders, 5pt) ---
        if (d.type === "hs") {
          if (d.points.length < 5) return null;
          const color = ds?.color ?? d.color ?? TV_BLUE;
          const labels = ["L", "H", "Cabeza", "H", "R"];
          return renderNPoint(d, color, (pts) => (
            <>
              <polyline
                points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                stroke={color}
                strokeWidth={1.5 + selectedWidth}
                fill="none"
              />
              {/* Neckline */}
              <line
                x1={pts[0].x}
                y1={pts[1].y}
                x2={pts[4].x}
                y2={pts[3].y}
                stroke={color}
                strokeWidth={1}
                strokeDasharray="4 3"
                opacity={0.7}
              />
              {pts.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={3} fill={color} />
                  <text
                    x={p.x}
                    y={p.y - 8}
                    fill={color}
                    fontSize={10}
                    fontWeight={700}
                    fontFamily="var(--font-mono), monospace"
                    textAnchor="middle"
                  >
                    {labels[i]}
                  </text>
                </g>
              ))}
            </>
          ));
        }

        // --- gannfan (2pt: 9 ratio fan lines from A) ---
        if (d.type === "gannfan") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const color = ds?.color ?? d.color ?? TV_BLUE;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          // 9 Gann ratios — y-slope multipliers relative to dy
          const ratios: [number, number][] = [
            [1, 8],
            [1, 4],
            [1, 3],
            [1, 2],
            [1, 1],
            [2, 1],
            [3, 1],
            [4, 1],
            [8, 1],
          ];
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              {ratios.map(([n, dd2], i) => {
                const sx = dx * 30;
                const sy = dy * (n / dd2) * 30;
                return (
                  <line
                    key={i}
                    x1={a.x}
                    y1={a.y}
                    x2={a.x + sx}
                    y2={a.y + sy}
                    stroke={color}
                    strokeWidth={1 + selectedWidth}
                    opacity={0.65}
                  />
                );
              })}
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={a.x}
                  y={a.y - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- brush (variable-N polyline, freehand) ---
        if (d.type === "brush") {
          if (d.points.length < 2) return null;
          const color = ds?.color ?? d.color ?? TV_BLUE;
          const coords = d.points
            .map((p) => toCoord(p.time, p.price))
            .filter((c): c is Coord => c !== null);
          if (coords.length < 2) return null;
          const path = coords.map((p) => `${p.x},${p.y}`).join(" ");
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              <polyline
                points={path}
                stroke="transparent"
                strokeWidth={12}
                fill="none"
              />
              <polyline
                points={path}
                stroke={color}
                strokeWidth={1.5 + selectedWidth}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {hover === d.id && (
                <RemoveHandle
                  x={coords[0].x}
                  y={coords[0].y - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- callout (2pt: arrow from a to text balloon at b) ---
        if (d.type === "callout") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const color = ds?.color ?? d.color ?? TV_YELLOW;
          const text = d.text || "";
          // Approximate text width: ~6px per char + padding
          const w = Math.max(40, text.length * 6.5 + 14);
          const h = 22;
          const rx = b.x - w / 2;
          const ry = b.y - h / 2;
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={color}
                strokeWidth={1.25}
                opacity={0.7}
              />
              <circle cx={a.x} cy={a.y} r={3} fill={color} />
              <rect
                x={rx}
                y={ry}
                width={w}
                height={h}
                fill={color}
                opacity={0.92}
                rx={3}
              />
              <text
                x={b.x}
                y={b.y + 4}
                fill="#000"
                fontSize={11}
                fontWeight={500}
                fontFamily="var(--font-sans), Inter, sans-serif"
                textAnchor="middle"
              >
                {text}
              </text>
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={rx + w + 10}
                  y={ry}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- anchoredVwap (1pt anchor → polyline computed from candles[anchor..]) ---
        if (d.type === "anchoredVwap") {
          const a = toCoord(d.at.time, d.at.price);
          if (!a) return null;
          const color = ds?.color ?? d.color ?? "#ab47bc"; // morado tipo TV
          // Buscar la vela más cercana al ancla (en tiempo)
          const all = candles ?? [];
          if (all.length === 0) return null;
          let anchorIdx = -1;
          let bestDiff = Infinity;
          for (let i = 0; i < all.length; i++) {
            const diff = Math.abs(all[i].time - d.at.time);
            if (diff < bestDiff) {
              bestDiff = diff;
              anchorIdx = i;
            }
          }
          if (anchorIdx < 0) return null;
          // Computar VWAP acumulado: Σ(TP·V) / Σ(V), TP=(H+L+C)/3
          const pts: Coord[] = [];
          let cumPV = 0;
          let cumV = 0;
          for (let i = anchorIdx; i < all.length; i++) {
            const c = all[i];
            const tp = (c.high + c.low + c.close) / 3;
            const v = c.volume > 0 ? c.volume : 1;
            cumPV += tp * v;
            cumV += v;
            const vwap = cumPV / cumV;
            const cd = toCoord(c.time, vwap);
            if (cd) pts.push(cd);
          }
          if (pts.length < 2) {
            // Sólo se ve el ancla — render del marker para que el usuario sepa que está
            return (
              <g
                key={d.id}
                onMouseEnter={() => setHover(d.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => handleClick(d.id)}
                onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
                onPointerDown={(e) => onBodyDown(e, d)}
                style={grStyle}
              >
                <circle cx={a.x} cy={a.y} r={4} fill={color} stroke="#fff" strokeWidth={1} />
                <DragHandle
                  cx={a.x}
                  cy={a.y}
                  onDown={(e) => onHandleDown(e, d.id, "at")}
                  hidden={hideHandle}
                />
              </g>
            );
          }
          const path = pts.map((p) => `${p.x},${p.y}`).join(" ");
          const lastPt = pts[pts.length - 1];
          // El último valor del VWAP (sólo cómputo, no coord): la mostramos como label
          const lastVwap =
            cumV > 0 ? cumPV / cumV : null;
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              onDoubleClick={(e) => onDrawingDblClick(e, d.id)}
              onPointerDown={(e) => onBodyDown(e, d)}
              style={grStyle}
            >
              {/* hit area gruesa transparente */}
              <polyline
                points={path}
                stroke="transparent"
                strokeWidth={10}
                fill="none"
              />
              {/* curva del VWAP */}
              <polyline
                points={path}
                stroke={color}
                strokeWidth={1.5 + selectedWidth}
                strokeDasharray={lineDash(ds)}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* marker del ancla */}
              <line
                x1={a.x}
                y1={0}
                x2={a.x}
                y2={containerHeight}
                stroke={color}
                strokeWidth={0.75}
                strokeDasharray="2 4"
                opacity={0.5}
              />
              <circle cx={a.x} cy={a.y} r={4} fill={color} stroke="#fff" strokeWidth={1} />
              {/* label de valor a la derecha */}
              {lastVwap !== null && (
                <>
                  <rect
                    x={containerWidth - 70}
                    y={lastPt.y - 9}
                    width={64}
                    height={18}
                    fill={color}
                    opacity={0.85}
                  />
                  <text
                    x={containerWidth - 38}
                    y={lastPt.y + 4}
                    fill="#fff"
                    fontSize={10}
                    fontFamily="var(--font-mono), monospace"
                    textAnchor="middle"
                  >
                    {lastVwap.toFixed(2)}
                  </text>
                </>
              )}
              {/* mini-pill "AVWAP" cerca del ancla */}
              <g transform={`translate(${a.x + 6}, ${a.y - 18})`} style={{ pointerEvents: "none" }}>
                <rect
                  width={42}
                  height={14}
                  fill="rgba(30,34,45,0.92)"
                  stroke={color}
                  strokeWidth={0.75}
                  rx={2}
                />
                <text
                  x={21}
                  y={10}
                  fill={color}
                  fontSize={9}
                  fontWeight={600}
                  fontFamily="var(--font-mono), monospace"
                  textAnchor="middle"
                >
                  AVWAP
                </text>
              </g>
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "at")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={a.x + 14}
                  y={a.y - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        return null;
      })}
    </svg>
  );
}

function DragHandle({
  cx,
  cy,
  onDown,
  small,
  hidden,
}: {
  cx: number;
  cy: number;
  onDown: (e: React.PointerEvent<SVGCircleElement>) => void;
  small?: boolean;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={small ? 3 : 4.5}
      fill={TV_BLUE}
      stroke="#fff"
      strokeWidth={1}
      style={{ cursor: "grab", pointerEvents: "auto" }}
      onPointerDown={onDown}
    />
  );
}

function RemoveHandle({
  x,
  y,
  onRemove,
}: {
  x: number;
  y: number;
  onRemove: () => void;
}) {
  return (
    <g style={{ cursor: "pointer", pointerEvents: "auto" }} onClick={onRemove}>
      <circle cx={x} cy={y} r={8} fill="#1e222d" stroke={TV_TEXT} strokeWidth={1} />
      <line
        x1={x - 4}
        y1={y - 4}
        x2={x + 4}
        y2={y + 4}
        stroke={TV_TEXT}
        strokeWidth={1.5}
      />
      <line
        x1={x + 4}
        y1={y - 4}
        x2={x - 4}
        y2={y + 4}
        stroke={TV_TEXT}
        strokeWidth={1.5}
      />
    </g>
  );
}
