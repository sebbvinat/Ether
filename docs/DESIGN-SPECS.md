# Design Specs — paridad TradingView + FXReplay

Especificaciones implementation-ready para las waves del roadmap
(`docs/ROADMAP-TV-FXREPLAY.md`). Cada sección es autocontenida: objetivo,
decisiones de diseño ya tomadas (con justificación), cambios exactos por
archivo, edge cases y criterios de aceptación.

**Instrucciones para la sesión implementadora (Opus):**
- Implementar UNA sección por commit. No mezclar secciones.
- Las decisiones de diseño acá son FINALES — no re-litigar salvo error objetivo.
- Después de cada sección: `npx next build` limpio + verificar los criterios
  de aceptación en el dev server antes de commitear.
- Los nombres de tipos/funciones citados existen en el repo; si un anchor no
  matchea exacto, buscar por nombre de símbolo (el código pudo moverse).
- Patrón de commit: branch `claude/...` → merge no-ff a `main` → push ambos.

Referencias de archivos clave:
- Store testing: `src/lib/store/testing-store.ts` (SessionMeta, SessionDetail, acciones)
- Engine: `src/lib/testing/engine.ts` (stepEngine, EngineState, EngineConfig)
- Chart: `src/components/testing/TestingChart.tsx`
- Página del chart: `src/app/testing/sessions/[id]/chart/page.tsx`
- Candles: `src/lib/testing/candles.ts` (LazyCandleStore, fetchRange, TF_MINUTES)
- Storage IDB: `src/lib/testing/storage.ts`
- Overlays: `PositionOverlay.tsx`, `PendingOrdersOverlay.tsx`, `ClosedTradesLayer.tsx`, `TestingDrawingsLayer.tsx`
- Panel: `src/components/testing/PositionsPanel.tsx`
- Order dialog: `src/components/testing/PlaceOrderDialog.tsx`

---

## §1. Undo/Redo de drawings (C2)

### Objetivo
Ctrl+Z / Ctrl+Shift+Z (y Ctrl+Y) para deshacer/rehacer operaciones de dibujo,
en el live chart y en testing.

### Decisiones de diseño
1. **Snapshot stack, NO command pattern.** Los arrays de drawings son chicos
   (<500 items × ~100 bytes). Un snapshot completo por mutación cuesta <50KB.
   El command pattern (op + inversa) es más eficiente pero triplica la
   superficie de bugs. Cap del stack: 50 entradas.
2. **Scope v1: SOLO drawings** (+ drawingStyles en live). NO undo de órdenes:
   deshacer una orden cancelada después de que el engine avanzó es ambiguo
   financieramente. Documentado como fuera de alcance.
3. **Un stack por área**: live (chart-store) y testing (sesión activa). El de
   testing NO persiste a IDB (se pierde al recargar — aceptable, igual que TV
   que pierde el undo stack al recargar).
4. **El problema del drag**: mover un dibujo dispara N updates por frame. El
   snapshot se toma UNA vez al inicio del gesto, no por update.

### Cambios

**Nuevo `src/lib/history.ts`:**
```ts
export class HistoryStack<T> {
  private past: T[] = [];
  private future: T[] = [];
  constructor(private cap = 50) {}
  push(snapshot: T) {
    this.past.push(snapshot);
    if (this.past.length > this.cap) this.past.shift();
    this.future = []; // toda mutación nueva invalida el redo
  }
  undo(current: T): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(current);
    return prev;
  }
  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    return next;
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
}
```

**`testing-store.ts`:**
- Módulo-level (fuera del create): `const drawingsHistory = new HistoryStack<Drawing[]>()`.
- En `addDrawingToActive`, `removeDrawingFromActive`, `clearDrawingsInActive`:
  ANTES de mutar → `drawingsHistory.push(detail.drawings)` (la referencia vieja
  sirve como snapshot porque las acciones crean arrays nuevos — verificar que
  ninguna mute in-place).
- Nuevas acciones:
```ts
undoDrawings: async () => {
  const detail = get().activeDetail; const active = get().activeSessionId;
  if (!detail || !active) return;
  const prev = drawingsHistory.undo(detail.drawings);
  if (!prev) return;
  const newDetail = { ...detail, drawings: prev };
  set({ activeDetail: newDetail });
  await idbSet(sessionDetailKey(active), newDetail);
},
redoDrawings: async () => { /* espejo con .redo() */ },
```
- IMPORTANTE: al cambiar de sesión (`setActiveSession`) → `drawingsHistory` se
  resetea (crear método `clear()` en HistoryStack, llamarlo ahí).

**`chart-store.ts` (live):** mismo patrón. El snapshot acá es
`{ drawings: Drawing[], styles: Record<string, DrawingStyle> }` porque los
estilos viven en mapa paralelo. Hook en `addDrawing`, `removeDrawing`,
`clearDrawings`, `setDrawingStyle`, `setDrawingStyleFull`. Para
`updateDrawing` (drag): NO push por update — ver siguiente punto.

**Transacción de drag:** en `DrawingsLayer.tsx` (live) y overlays de testing,
al INICIAR un drag (`onHandleDown` / `onBodyDown` / `onPointerDown` de
handles), llamar una nueva acción `beginDrawingsTransaction()` que hace el
push del snapshot. Los `updateDrawing` subsecuentes no pushean. Así un drag
entero = 1 entrada de undo.

**Keyboard:** en `page.tsx` (live, handler global existente) y en la chart
page de testing: `Ctrl+Z` → undo, `Ctrl+Shift+Z` o `Ctrl+Y` → redo. Guard
`isTypingTarget` (ya existe en `lib/shortcuts.ts`). En live respetar el
sistema de shortcuts configurable si es trivial; sino hardcodear Ctrl+Z
(TV también lo tiene fijo).

### Edge cases
- Undo con 0 entradas → no-op silencioso.
- Cambio de sesión → stack limpio (no cross-contaminar sesiones).
- El draft en curso (primer click de trendline) no genera entrada hasta
  commitearse.

### Aceptación
1. Dibujar 3 líneas → Ctrl+Z ×3 las quita en orden inverso → Ctrl+Y las trae.
2. Mover un dibujo con drag largo → UN Ctrl+Z vuelve a la posición original.
3. Borrar todo con 🗑 → Ctrl+Z restaura todo.
4. Recargar página → stack vacío, drawings persisten (IDB intacto).

---

## §2. Atajos de replay + jump-to-date + tools por teclado (A3/A4/A5)

### Decisiones
1. El estado `tool` vive DENTRO de TestingChart. En vez de liftearlo (refactor
   con riesgo), la página emite un CustomEvent `ether-testing:set-tool` y
   TestingChart lo escucha. Barato y consistente con el patrón existente
   (`ether-testing:last-price`).
2. `Space` hace preventDefault SIEMPRE (sino scrollea la página).
3. `End` = saltar al endDate de la sesión (el "presente" de la sesión).
4. Pausa-en-cierre (A5): checkbox "Pausar por vela" en el replay bar; con
   autoplay ON y el checkbox ON, el intervalo avanza 1 barra y pausa
   (setAutoplay(false)) tras cada step. Trivial pero muy usado.

### Cambios

**`src/app/testing/sessions/[id]/chart/page.tsx`** — nuevo useEffect:
```ts
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (isTypingTarget(document.activeElement)) return;
    if (!session) return;
    const k = e.key;
    if (k === " ") { e.preventDefault(); setAutoplay(v => !v); return; }
    if (k === "ArrowRight") { e.preventDefault(); setReplayCursor(currentTimeMs + (e.shiftKey ? 10 : 1) * stepMs); return; }
    if (k === "ArrowLeft")  { e.preventDefault(); setReplayCursor(currentTimeMs - (e.shiftKey ? 10 : 1) * stepMs); return; }
    if (k === "Home") { setReplayCursor(session.startDate); return; }
    if (k === "End")  { setReplayCursor(session.endDate); return; }
    const toolMap: Record<string, string> = { t: "trendline", h: "hline", r: "rect", f: "fib", l: "long", s: "short", e: "eraser", Escape: "cursor" };
    const tool = toolMap[k.length === 1 ? k.toLowerCase() : k];
    if (tool) window.dispatchEvent(new CustomEvent("ether-testing:set-tool", { detail: { tool } }));
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [session, currentTimeMs, stepMs, setReplayCursor]);
```
(Los atajos Y/Z/I/L/N de Go To chocan con L=long y S=short: prioridad a las
tools; Go To queda solo por menú. Documentado.)

**`TestingChart.tsx`** — escuchar el evento:
```ts
useEffect(() => {
  const h = (e: Event) => {
    const t = (e as CustomEvent<{ tool: DrawingTool }>).detail?.tool;
    if (t) { setTool(t); setDraft(null); }
  };
  window.addEventListener("ether-testing:set-tool", h);
  return () => window.removeEventListener("ether-testing:set-tool", h);
}, []);
```

**Jump-to-date:** en el replay bar, el label de fecha actual se vuelve un
`<button>` que abre un popover con `<input type="datetime-local">` (min/max =
startDate/endDate de la sesión). On change → `setReplayCursor(new Date(v).getTime())`
(el store ya clampea). Cerrar popover al elegir.

**Pausa por vela:** estado `pauseEachBar` (useState local). En el interval del
autoplay: tras `setReplayCursor(next)`, si `pauseEachBar` → `setAutoplay(false)`.
Checkbox al lado del selector de velocidad, label "Pausar c/vela".

### Aceptación
1. Space arranca/pausa; la página no scrollea.
2. →/← avanzan/retroceden 1 barra del TF; con Shift, 10.
3. T activa trendline (cursor crosshair), Esc vuelve a cursor.
4. Click en la fecha → elegir otra fecha → el chart salta ahí.
5. Con "Pausar c/vela" ON, play avanza exactamente 1 vela y pausa.

---

## §3. Sizing por riesgo (B1)

### Decisiones
1. Fórmula: `size = (equity × riskPct/100) / |entry − sl|`. `equity` =
   `session.currentBalance`. Sin pointValue en v1 (crypto lineal = 1;
   cuando entren futuros con Databento se agrega `pointValue` a SessionMeta).
2. Redondeo: `Math.floor(size × 1000) / 1000` (3 decimales) — crypto permite
   fraccional. Guard: si resultado < 0.001 → mostrar error "riesgo demasiado
   chico para este SL".
3. El modo riesgo REQUIERE SL habilitado — si no hay SL el input de riesgo se
   deshabilita con hint "Activá el Stop Loss".
4. `SessionMeta += defaultRiskPct?: number` (default 0.5, editable en
   NewSessionDialog sección avanzada). El dialog arranca en modo riesgo si
   defaultRiskPct existe.
5. Fast Buy/Sell NO cambia (sigue por cantidad manual) — documentado.

### Cambios

**`testing-store.ts`:** `SessionMeta += defaultRiskPct?: number`. Backfill en
`merge` del persist: `defaultRiskPct: sess.defaultRiskPct ?? 0.5`.

**`PlaceOrderDialog.tsx`:**
- Estado nuevo: `sizeMode: "manual" | "risk"` (default `"risk"` si la sesión
  tiene defaultRiskPct), `riskPct: string`.
- Prop nueva: `sessionBalance: number` y `defaultRiskPct?: number` (pasar
  desde la chart page).
- Toggle segmentado arriba del campo tamaño: `[Manual | Por riesgo]`.
- En modo riesgo: input "Riesgo %" + preview en vivo:
  `Riesgo: $500.00 · Tamaño: 0.85` recalculado en cada cambio de
  entry/sl/riskPct.
- `handleSave` en modo riesgo: computa sizeN con la fórmula; valida > 0.001.

### Aceptación
1. Balance 100k, riesgo 1%, entry 100, SL 90 → tamaño 100.
2. Cambiar el SL recalcula el tamaño en vivo.
3. Sin SL activado, modo riesgo deshabilitado con hint.
4. La orden creada lleva el size calculado; el risk preview del dialog
   coincide con `|entry−sl|×size` ≈ balance×riesgo%.

---

## §4. Breakeven manual + Auto-BE (B3)

### Decisiones
1. **BE manual**: botón que setea `sl = entry`. Guard: deshabilitado si
   `unrealizedPnL <= 0` (mover SL a entry con precio del lado equivocado lo
   dispararía en la próxima vela — sería un close disfrazado).
2. **Auto-BE**: `Order.autoBreakeven` YA existe en el tipo. Se propaga a la
   posición al fill y el engine lo aplica cuando `maxFavorable >= risk` (1R).
3. **Orden de evaluación**: el auto-BE se aplica AL FINAL del procesamiento de
   la vela (después de chequear SL/TP hits) → toma efecto desde la vela
   siguiente. Evita la ambigüedad "tocó 1R y volvió a entry en la misma vela".

### Cambios

**`testing-store.ts`:** `Position += autoBreakeven?: boolean; beApplied?: boolean`.

**`engine.ts`:**
- En el fill de orden (bloque que crea la Position en `stepEngine`):
  `autoBreakeven: order.autoBreakeven, beApplied: false`.
- En el loop de posiciones, rama "sigue abierta", después de computar
  maxFavorable:
```ts
let sl = pos.sl;
let beApplied = pos.beApplied;
if (pos.autoBreakeven && !beApplied && pos.sl !== undefined) {
  const risk = Math.abs(pos.entry - pos.sl) * pos.size;
  if (risk > 0 && maxFavorable >= risk) { sl = pos.entry; beApplied = true; }
}
newPositions.push({ ...pos, sl, beApplied, unrealizedPnL: unrealized, maxAdverse, maxFavorable });
```
- PlaceOrderDialog: checkbox "Auto Break-even (mueve SL a entry al alcanzar 1R)"
  ya existe visualmente como campo del Order — verificar que se esté pasando
  (`autoBreakeven` en makeLimitOrder/makeStopOrder/openPositionNow inputs; si
  falta el plumbing, agregarlo).

**UI BE manual:**
- `PositionsPanel.tsx` → columna acciones: botón `BE` antes de `Close`:
  `onClick={() => updatePositionLevels(p.id, { sl: p.entry })}`,
  `disabled={upnl <= 0}`.
- `PositionOverlay.tsx` → en el grupo del label izquierdo (LONG · size · RR),
  agregar mini-botón `BE` con `pointerEvents: "auto"` que llama igual.

### Aceptación
1. Posición long en ganancia → click BE → la línea SL salta al entry.
2. Posición en pérdida → botón BE deshabilitado.
3. Orden con auto-BE: cuando el precio recorre 1R a favor, el SL pasa a
   entry automáticamente en la vela siguiente; un retorno a entry después
   cierra con realized ≈ 0 (reason "sl").

---

## §5. Comisiones y spread por sesión (B5)

### Decisiones
1. `SessionMeta += commissionPerUnit?: number` (USD por unidad por lado,
   default 0) `+= spreadTicks?: number` (default 0) `+= tickSize?: number`
   (default 0.01).
2. **Modelo de spread simplificado**: las velas son "bid". Toda ejecución de
   COMPRA (entry buy, cierre de short por SL/TP/manual) se llena
   `spreadTicks × tickSize` PEOR (precio + spread). Las ventas se llenan al
   precio de la vela. Aproximación honesta y barata — documentar en el
   NewSessionDialog con un hint.
3. La comisión ya está modelada en `closeTradeAtPrice` (×2 lados). Solo falta
   el plumbing desde la sesión.

### Cambios

**`engine.ts`:** `EngineConfig += spreadAmount?: number` (en unidades de
precio, ya multiplicado: `spreadTicks × tickSize`; lo computa el caller).
- `tryFillOrder`: en fills de BUY sumar `spreadAmount` al precio devuelto.
- `closeTradeAtPrice`: si `pos.side === "sell"` (short cierra comprando),
  `closePrice + spreadAmount` — pasar spreadAmount como parámetro.
- `stepEngine`/`manualClose`: propagar desde config.

**`TestingChart.tsx`** (effect del engine) y `closePositionManual` en el
store: construir config con
`{ sessionId, commissionPerUnit: session.commissionPerUnit, spreadAmount: (session.spreadTicks ?? 0) * (session.tickSize ?? 0.01) }`.
NOTA: `closePositionManual` en el store hoy computa el PnL a mano con
commission 0 — actualizarla para restar `commissionPerUnit × size × 2` y
aplicar spread si es short.

**`NewSessionDialog.tsx`:** sección colapsable "Configuración avanzada" con
los 3 campos + defaultRiskPct (§3). Persisten en SessionMeta.

### Aceptación
1. Sesión con commission 2.5: un round-trip de 1 unidad resta $5 del realized.
2. Sesión con spread 2 ticks × tickSize 0.5: un buy market se llena 1.0 arriba
   del precio de vela; un sell al precio exacto.
3. Sesión con ambos en 0 → PnL idéntico al actual (regresión cero).

---

## §6. Cierre parcial (B2) — sin refactor de lots

### Decisiones
1. **NO refactor a lots[]**. Cierre parcial = reducir `position.size` y emitir
   un Trade por la fracción cerrada. Cubre el uso real (tomar parciales).
2. Scale-in queda como posiciones separadas (ya soportado — N posiciones
   concurrentes). Sin promedio de entrada en v1. Documentado.
3. `maxAdverse`/`maxFavorable` del Trade parcial: se copian proporcionalmente
   (`× fraction`) — aproximación, documentar en comment.
4. `Trade.closeReason += "partial"` (union type).

### Cambios

**`testing-store.ts`:**
- `Trade.closeReason` union: agregar `"partial"`.
- Nueva acción:
```ts
closePositionPartial: async (positionId, fraction, closePrice, closedAtMs) => {
  // fraction ∈ (0,1). Crea Trade con size×fraction (realized proporcional,
  // commission proporcional, spread si short), reduce position.size al resto.
  // Si el resto < 0.001 → cierre total (delegar a closePositionManual).
  // Actualiza meta: realizedPnL, currentBalance, totalTrades, wins/losses.
}
```
(Estructura espejo de `closePositionManual` — copiar y ajustar. rMultiple del
parcial usa el risk de la FRACCIÓN: `|entry−sl| × size×fraction`.)

**`PositionsPanel.tsx`:** en la fila: botones `[25%] [50%] [Close]` — los dos
primeros llaman `closePositionPartial(p.id, 0.25|0.5, lastPrice, Date.now())`.

**`PositionOverlay.tsx`:** botón `½` junto al BE del label (cierra 50% al
último precio — la página le pasa un callback `onPartialClose`).

### Aceptación
1. Posición size 1 → [50%] → queda size 0.5 abierta + Trade "partial" con
   realized = mitad del PnL al precio actual.
2. [50%] de nuevo → size 0.25. Close → cierra el resto.
3. Equity curve y analytics cuentan los parciales como trades.
4. SL/TP de la posición restante intactos tras el parcial.

---

## §7. Edición inline en PositionsPanel (B6)

### Decisiones
Los valores SL/TP de la tabla (open + pending) se vuelven inputs inline
(click → editable, Enter/blur → commit). Sin dialog.

### Cambios
**`PositionsPanel.tsx`:** componente `EditableCell` (input number chico,
estilo tabla). En OpenTable: SL y TP → `updatePositionLevels(p.id, {...})`.
En PendingTable: Entry/SL/TP → `updateOrderLevels(o.id, {...})`. Validar
NaN → revert. Borrar el valor (vacío) → `undefined` (quita el nivel; para
Entry de pending NO permitir vacío).

### Aceptación
1. Editar SL en la tabla mueve la línea del chart al instante.
2. Vaciar TP quita la línea TP.
3. Escape durante la edición revierte.

---

## §8. Tests del engine con Vitest (G6)

### Decisiones
1. Runner: **vitest** (devDependency, cero config para TS). Script
   `"test": "vitest run"` en package.json.
2. Un solo archivo `src/lib/testing/__tests__/engine.test.ts`.
3. Fixture helper: `mkCandle(time, o, h, l, c, v=1000)`.

### Casos obligatorios (tabla exacta)
| # | Setup | Acción | Assert |
|---|---|---|---|
| 1 | market buy pendiente | stepEngine con vela o=100 | fill price 100 + spread; posición abierta; order.status filled |
| 2 | buy limit 95 | vela low=96 | NO fill |
| 3 | buy limit 95 | vela low=94, open=97 | fill a min(95, 97)=95 |
| 4 | buy limit 95 | vela open=93 (gap down) | fill a 93 (mejor precio) |
| 5 | sell limit 105 | vela high=106 | fill a max(105, open) |
| 6 | buy stop 105 | vela high=106 | fill a max(105, open) |
| 7 | long entry 100 sl 95 | vela low=94 | trade closeReason "sl", realized=(95−100)×size−comisión |
| 8 | long entry 100 tp 110 | vela high=111 | trade "tp", realized=(110−100)×size−comisión |
| 9 | long sl 95 tp 110 | vela low=94 high=111 (ambos) | gana SL (conservador) |
| 10 | short entry 100 sl 105 | vela high=106 | trade "sl" |
| 11 | short entry 100 tp 90 | vela low=89 | trade "tp" |
| 12 | trade cerrado con sl definido | — | rMultiple = realized/(|entry−sl|×size) |
| 13 | commissionPerUnit=2, size=3 | round-trip | commission=12 (2×3×2) |
| 14 | spreadAmount=0.5, buy market | vela o=100 | entry=100.5 |
| 15 | intraBarFills=false, long sl 95 | vela low=94 close=96 | NO SL (solo body) |
| 16 | autoBreakeven, risk=5 | vela con maxFavorable≥5 | sl===entry en la vela siguiente |
| 17 | manualClose | posición long +10 | realized correcto, position removida |
| 18 | computeUnrealized | 2 posiciones mixtas | suma correcta con dirección |

### Aceptación
`npm run test` verde con los 18 casos. Los casos 14/16 dependen de §4/§5 —
si se implementa §8 antes, marcarlos `test.todo`.

---

## §9. Settings de indicadores en Testing (D1)

### Decisiones
1. `SessionDetail.config` YA existe (IndicatorConfig completo, persiste en
   IDB). Solo está sin usar: `renderIndicators` hardcodea períodos.
2. UI mínima: en `IndicatorsMenu`, cada indicador ACTIVO muestra un ⚙ a la
   derecha; click → sub-popover con los campos numéricos de ese indicador.
   Sin dialog modal (más rápido que TV incluso).
3. Campos v1 (keys exactas de IndicatorConfig — verificar nombres en
   chart-store): rsiPeriod, macdFast/macdSlow/macdSignal, stochK/stochD,
   bbPeriod/bbMult. EMAs/SMAs quedan fijas (son 6 series distintas por
   diseño, igual que hoy).

### Cambios
- **`testing-store.ts`**: acción `updateIndicatorConfig(patch: Partial<IndicatorConfig>)`
  → merge en `detail.config` + idbSet.
- **`TestingChart.tsx`**: `renderIndicators(candles, active, config, chart, series)`
  — reemplazar constantes: `rsi(candles, config.rsiPeriod ?? 14)`,
  `macd(candles, config.macdFast ?? 12, ...)`, `stochastic(candles, config.stochK ?? 14, config.stochD ?? 3)`,
  `bollinger(candles, config.bbPeriod ?? 20, config.bbMult ?? 2)`.
  El effect §5b agrega `detail?.config` a las deps.
- **`IndicatorsMenu.tsx`**: sub-popover con inputs; commit onBlur/Enter via
  `updateIndicatorConfig`.

### Aceptación
1. RSI a 7 → la curva cambia al instante y persiste tras recargar.
2. MACD 5/13/4 → recalcula.
3. Valores inválidos (0, negativo, NaN) → revert al anterior.

---

## §10. Polish visual (C12/C13/C14 + C4)

### 10a. Flash de precio
En TestingChart, junto al dispatch de `ether-testing:last-price`, la página
mantiene `lastPrice` + `prevPrice`. El span del precio en el ticker recibe
clase `price-flash-up` / `price-flash-down` cuando cambia, removida a los
400ms (setTimeout). CSS global:
```css
@keyframes flashUp { 0% { background: rgba(38,166,154,.35);} 100% { background: transparent;} }
@keyframes flashDown { 0% { background: rgba(239,83,80,.35);} 100% { background: transparent;} }
.price-flash-up { animation: flashUp .4s ease-out; }
.price-flash-down { animation: flashDown .4s ease-out; }
```
Aplicar igual al precio grande del live chart (PriceChart, bloque lastPrice).

### 10b. Crosshair pills
En `createChart` options de TestingChart (y auditar PriceChart):
```ts
crosshair: {
  horzLine: { labelBackgroundColor: "#2962ff" },
  vertLine: { labelBackgroundColor: "#2962ff" },
}
```
(lightweight-charts v5 los pinta redondeados por defecto — solo falta el color.)

### 10c. Skeleton de carga
Reemplazar el spinner del TestingChart por un skeleton de velas: 40 `<div>`
verticales de alturas pseudo-aleatorias determinísticas (usar `i*7919 % 60`)
con `animate-pulse` de Tailwind, en un flex row centrado. Mantener el texto
"Descargando velas…" debajo.

### 10d. Auditoría de theme (checklist para pasar una vez)
| Superficie | Valor TV | Verificar en |
|---|---|---|
| Chart bg | `#131722` | TestingChart TV.bg ✓, PriceChart, layout testing bg |
| Grid | `#1e222d` | ambos charts |
| Bordes | `#2a2e39` | tv-border en tailwind config |
| Texto primario | `#d1d4dc` | tv-text |
| Texto muted | `#787b86` | tv-text-muted |
| Verde | `#26a69a` / Rojo `#ef5350` / Azul `#2962ff` | constantes duplicadas en ~6 archivos — extraer a `src/lib/theme.ts` y importar |

### Aceptación
1. El precio del ticker flashea verde al subir, rojo al bajar.
2. Crosshair labels con fondo azul en ambos ejes.
3. Al abrir una sesión se ve el skeleton de velas, no un spinner genérico.
4. `theme.ts` es la única fuente de los hex (grep sin duplicados).

---

## §11. Intra-bar playback (A1) — LA feature

### Objetivo
Ver la vela actual del TF formándose a partir de sus sub-velas de 1m, con el
engine evaluando fills en resolución 1m.

### Decisiones de diseño (leer con atención)
1. **El cursor sigue siendo `replayCursorMs`, único source of truth.** No se
   agrega "sub-cursor". La definición del chart pasa a ser FUNCIONAL:
   - `boundary = floor(cursorSec / tfSec) × tfSec`
   - Barras completas: todas las velas TF con `time + tfSec <= cursorSec`
     (ojo: una barra está completa cuando su CIERRE ≤ cursor, no su apertura).
   - **Barra parcial**: si `cursorSec > boundary` y hay velas 1m en
     `[boundary, cursorSec]` → agregarlas con `aggregateCandles`-style a una
     única vela con `time = boundary`.
   Esta definición hace que TF-switch, reload y rewind "just work" — el
   parcial se reconstruye desde datos, no desde estado.
2. **Dos LazyCandleStore**: el actual (TF del chart) + `subStoreRef` con
   tf="1m", cargado lazy SOLO alrededor del cursor (±1 día) y SOLO cuando el
   modo intrabar está activo. Cache IDB por (symbol, "1m") ya funciona.
3. **Modo por sesión**: `SessionMeta += playbackMode?: "bar" | "intrabar"`
   (default "bar" para no cambiar el comportamiento existente). Toggle en el
   replay bar: `[Velas | Ticks]`.
4. **Degradación**: si no hay 1m para el cursor (Yahoo >7 días atrás, o
   Binance pre-listing), el modo intrabar cae a bar-mode transparente para
   esa barra, con un toast una sola vez: "Sin data 1m acá — avanzando por
   vela completa".
5. **Engine en 1m cuando intrabar ON**: el effect del engine procesa velas 1m
   del subStore entre prevCursor y cursor (en vez de velas TF). MÁS preciso
   que hoy. Cuando OFF, comportamiento actual intacto. Nota consciente:
   alternar el modo a mitad de sesión puede producir fills ligeramente
   distintos a haberlo tenido siempre — aceptable, documentado.
6. **Velocidad en modo intrabar**: significa "minutos de mercado por segundo
   real". Presets: 1×(1m/s), 5×, 15×, 60×. Implementación: interval de 100ms
   que acumula `speed × 100/1000` minutos y avanza el cursor por el entero
   acumulado (guardar residuo fraccional en un ref).
7. **Render perf**: NO hacer setData completo por tick. Mantener
   `lastBoundaryRef`. Si el cursor avanzó sin cruzar boundary → solo
   `candleSeries.update(partialBar)`. Si cruzó → `update(completedBar)` y
   `update(newPartial)`. setData completo solo en TF-switch/rewind/load.

### Cambios

**`testing-store.ts`:** `SessionMeta += playbackMode?: "bar" | "intrabar"`
+ acción `setPlaybackMode` + backfill "bar" en merge.

**`TestingChart.tsx`:**
- `subStoreRef = useRef<LazyCandleStore | null>(null)` — crear cuando
  `session.playbackMode === "intrabar"` (y symbol/1m), destruir al cambiar.
- Prefetch effect: cuando intrabar ON, `subStore.ensureLoaded(cursorMs, 720, 720)`
  (±12h de 1m = 1 request) con el mismo patrón de proximidad del prefetch actual.
- `displayed` memo: implementar la definición funcional del punto 1. Extraer
  a función pura exportada `composeDisplayed(tfCandles, oneMinCandles | null, cursorSec, tfSec)`
  → TESTEABLE (agregar 3 casos al engine.test o archivo aparte).
- Effect de pintado: implementar la estrategia update-vs-setData del punto 7.
- Engine effect: si intrabar ON y subStore tiene el rango → iterar 1m; sino TF
  (fallback punto 4).

**Chart page:**
- Toggle `[Velas | Ticks]` junto al selector de velocidad → `setPlaybackMode`.
- El selector de velocidad muestra presets distintos según modo (bar: los
  SPEEDS actuales; intrabar: 1m/s, 5m/s, 15m/s, 1h/s).
- Autoplay: rama intrabar usa el acumulador fraccional del punto 6.
- Los botones step en intrabar: → avanza 1 minuto; Shift+→ salta al cierre de
  la barra actual (`boundary + tfSec`).

### Edge cases
- Cursor exactamente en boundary → no hay parcial (la barra anterior está
  completa; la nueva no empezó).
- Mercado cerrado (futuros/índices): minutos sin vela 1m — la agregación usa
  las que haya en el rango; si 0, no hay parcial.
- Rewind con intrabar: `lastBoundaryRef` se invalida → detectar
  `cursor < prevCursor` y forzar setData completo.
- TF=1m con modo intrabar → no tiene sentido (no hay sub-resolución);
  deshabilitar el toggle con tooltip.

### Aceptación
1. BTCUSDT 15m, modo Ticks, play a 1m/s: la última vela crece minuto a
   minuto; al completar 15 sub-velas nace una nueva.
2. Una posición con TP dentro de la barra actual se cierra EN el minuto que
   lo toca, no al cierre de la barra de 15m.
3. Cambiar a modo Velas → comportamiento actual exacto.
4. Ir 60 días atrás en ^GSPC con Ticks → toast de degradación y avance por
   vela completa (sin crash).
5. Pan/zoom fluido durante el playback (validar que no hay setData por tick
   — instrumentar con console.count en dev si hace falta).

---

## §12. Multi-TF sync (A2)

### Decisiones
1. Layout `[1 | 2]` en la toolbar del chart page. En modo 2: split horizontal
   50/50, dos `<TestingChart>` con la MISMA session.
2. `SessionMeta += chartTimeframe2?: Timeframe` (default "1m"). TestingChart
   recibe props nuevas: `tfOverride?: Timeframe` y `onTfChange?: (tf) => void`
  — si `tfOverride` está, usa ese TF en lugar de `session.chartTimeframe` y
   el TF selector de ESE chart llama `onTfChange`.
3. **El engine corre en UN solo chart**: prop `engineEnabled: boolean`
   (primario true, secundario false). Los dos effects de engine + el de
   pending-orders se skipean cuando false. CRÍTICO — sin esto los fills se
   procesan doble.
4. Cursor sync: gratis (ambos leen `replayCursorMs`).
5. Overlays: ambos charts muestran posiciones/órdenes/trades (leen el mismo
   detail). Drawing tools activos en ambos (escriben al mismo detail).
   El toolbar de drawings del secundario se oculta (prop `showToolbar={false}`)
   para no duplicar UI — se dibuja desde el primario.
6. Crosshair sync entre charts: v2, fuera de alcance.

### Cambios
- `TestingChart.tsx`: 3 props nuevas (`tfOverride`, `onTfChange`,
  `engineEnabled = true`, `showToolbar = true`). Reemplazar lecturas de
  `session.chartTimeframe` por `const chartTf = tfOverride ?? session.chartTimeframe`.
  Guard `if (!engineEnabled) return;` al inicio de los effects de engine.
- Chart page: estado layout, split flex, segundo chart con
  `tfOverride={session.chartTimeframe2 ?? "1m"}`
  `onTfChange={(tf) => updateSessionMeta(session.id, { chartTimeframe2: tf })}`
  `engineEnabled={false}` `showToolbar={false}`.
- El TF selector global de la toolbar aplica al primario (sin cambio).

### Aceptación
1. Modo 2 charts: 15m arriba/izquierda, 1m derecha, ambos avanzan juntos.
2. Abrir una posición → visible en ambos.
3. Los trades/balance NO se duplican (verificar contra modo 1 chart con el
   mismo recorrido).
4. Cambiar el TF del secundario no toca el primario.

---

## §13. Backfill histórico a Supabase (E2/E3)

### Decisiones
1. Ruta nueva `GET /api/admin/backfill?symbol=X&tf=Y&fromMs=A&toMs=B`
   protegida por `CRON_SECRET` (mismo header Bearer). Ingesta UN chunk
   bounded (máx ~30 requests a Binance ≈ 30k velas) y responde
   `{ done: boolean, nextToMs: number, inserted }` — paginación hacia atrás.
2. Runner: workflow GitHub Actions `backfill.yml` con `workflow_dispatch` e
   inputs (symbol, tf, fromDate) que loopea llamando la ruta hasta `done`
   (máx 200 iteraciones). Corre en GH runners → gratis, sin límite de 60s de
   Vercel por llamada.
3. **Presupuesto de storage (decisión tomada)**: free tier 500MB.
   - 15m/1h/4h/1d de los 6 símbolos: historia COMPLETA (≈40MB total). Sí.
   - 1m: solo BTCUSDT y ETHUSDT, últimos 12 meses (~2×525k filas ≈ 90MB). Sí.
   - 1m de más símbolos/años → requiere upgrade; fuera de alcance.
4. El cron horario existente sigue igual (mantiene el tip actualizado).

### Cambios
- `src/app/api/admin/backfill/route.ts`: auth igual al cron; loop de
  `fetchKlines` hacia atrás desde `toMs` (reusar la lógica de paginación de
  `fetchRange` con cap de requests=30); `upsertCandles`; responde nextToMs =
  timestamp de la vela más vieja − tfMs; `done` cuando la API devuelve vacío
  o se alcanzó fromMs.
- `.github/workflows/backfill.yml`: dispatch con inputs; step bash con while
  loop + curl + jq para leer `done`/`nextToMs`; secrets VERCEL_URL/CRON_SECRET
  ya existen.

### Aceptación
1. Dispatch backfill BTCUSDT 1h fromDate 2020-01-01 → tabla con ~50k filas
   del rango; re-ejecutar no duplica (upsert).
2. `/api/candles` sirve un rango de 2021 sin tocar Binance (verificar
   `source: "supabase"`, `fresh: 0`).
3. Dispatch 1m BTCUSDT 12 meses → termina en <30 iteraciones.

---

## §14. Symbol search modal estilo TV (C7)

### Decisiones
1. Un solo componente nuevo `SymbolSearchModal.tsx` usado por NewSessionDialog
   (reemplaza el input libre + datalist actual) y a futuro por el live.
2. Layout TV: input grande arriba con autofocus · fila de category chips
   `[Todos | Crypto | Índices | Acciones | Forex]` · lista de resultados con
   columnas [símbolo bold] [nombre muted] [badge exchange] · navegación
   ↑↓/Enter/Esc · sección "Recientes" (localStorage `ether-recent-symbols`,
   máx 8) cuando el input está vacío.
3. Fuentes: crypto → `fetchExchangeSymbols` de `binance/rest.ts` (ya cachea);
   resto → `/api/yahoo/search?q=` (ya existe) con debounce 300ms.
   Categoría filtra por `quoteType`/provider.

### Aceptación
1. "btc" lista BTCUSDT arriba; Enter lo selecciona y cierra.
2. "nasdaq" (categoría Índices) lista ^IXIC vía Yahoo.
3. Recientes aparecen al abrir con input vacío; se actualizan al elegir.
4. Teclado completo sin mouse.

---

## §15. Iconografía SVG (C1)

### Decisiones
1. Archivo único `src/components/icons/ToolIcons.tsx`: componentes React,
   `viewBox="0 0 28 28"`, `fill="none" stroke="currentColor" strokeWidth={1.5}
   strokeLinecap="round" strokeLinejoin="round"`, tamaño por prop
   (default 18). Heredan color → los estados hover/active existentes siguen
   funcionando.
2. Paths iniciales (ajustar a ojo en el browser, son el punto de partida):

| Ícono | Contenido SVG (children del `<svg>`) |
|---|---|
| Cursor (cruz) | `<path d="M14 5v18M5 14h18"/>` |
| Trendline | `<path d="M7 21L21 7"/><circle cx="7" cy="21" r="2"/><circle cx="21" cy="7" r="2"/>` |
| HLine | `<path d="M4 14h20"/><circle cx="14" cy="14" r="2.2"/>` |
| VLine | `<path d="M14 4v20"/><circle cx="14" cy="14" r="2.2"/>` |
| Ray | `<circle cx="7" cy="21" r="2"/><path d="M8.6 19.4L24 4"/>` |
| Rect | `<rect x="5" y="8" width="18" height="12" rx="1"/><circle cx="5" cy="8" r="1.6"/><circle cx="23" cy="20" r="1.6"/>` |
| Elipse | `<ellipse cx="14" cy="14" rx="10" ry="6.5"/>` |
| Fib | `<path d="M5 6h18M5 11h11M5 16h14M5 21h18"/>` |
| Long | `<path d="M14 21V9M9 13l5-5 5 5"/><path d="M5 24h18" opacity=".5"/>` |
| Short | `<path d="M14 7v12M9 15l5 5 5-5"/><path d="M5 4h18" opacity=".5"/>` |
| Eraser | `<path d="M17 5l6 6-9.5 9.5H9L4.5 16z"/><path d="M9 21h13"/>` |
| Texto | `<path d="M7 7h14M14 7v14"/>` |
| Brush | `<path d="M5 23c3 0 3-3 5-5L21 7l-2-2L8 16c-2 2-3 4-3 7z"/>` |
| Medir | `<rect x="3" y="12" width="22" height="7" rx="1" transform="rotate(-25 14 15)"/><path d="M9 16l1.5 2M13 13l1.5 2M17 10l1.5 2" transform="rotate(0)"/>` |
| Magnet | `<path d="M9 4v9a5 5 0 0010 0V4"/><path d="M9 4h4M15 4h4M9 9h4M15 9h4" opacity=".6"/>` |
| Trash | `<path d="M5 8h18M11 8V5h6v3M8 8l1 15h10l1-15M12 12v7M16 12v7"/>` |

3. Reemplazos: `DrawingsToolbar` en TestingChart (glyphs → íconos) y
   `LeftSidebar.tsx` del live (campo `glyph` → campo `icon?: ComponentType`,
   fallback al glyph para las tools sin ícono aún — migración incremental).

### Aceptación
1. Toolbar de testing 100% con SVG (cero glyphs unicode).
2. Live sidebar: los 8 grupos principales con ícono SVG.
3. Estados hover/active mantienen colores (heredan currentColor).

---

## §16. Checklist enforced + límites prop firm (F3/F4)

### Decisiones
1. `SessionMeta += rules?: { maxTradesPerDay?: number; maxDailyLoss?: number; profitTarget?: number; enforceChecklist?: boolean }` — editable en
   NewSessionDialog (avanzado) y en la página de resumen de sesión.
2. `SessionDetail += checklistTemplate?: string[]` (editable en el resumen de
   sesión; textarea un item por línea).
3. **"Día" = día del CURSOR de replay** (no fecha real), en timezone
   America/New_York (consistente con Go To). Selector:
```ts
function tradesOfCursorDay(trades, cursorMs) {
  const day = nyDateString(cursorMs); // YYYY-MM-DD en NY
  return trades.filter(t => nyDateString(t.closedAt) === day);
}
```
4. Enforcement:
   - `maxTradesPerDay` alcanzado → deshabilitar Buy/Sell/Place Order +
     banner rojo fijo "Límite de trades diario alcanzado (N/N)".
   - `maxDailyLoss` (número positivo, ej 500 = −$500): si
     `sum(realized del día) <= −maxDailyLoss` → igual bloqueo, banner
     "Pérdida máxima diaria alcanzada".
   - `profitTarget`: banner VERDE no bloqueante "🎯 Objetivo diario alcanzado".
   - El bloqueo aplica a crear órdenes nuevas; cerrar/modificar posiciones
     existentes SIEMPRE permitido.
5. Checklist: si `enforceChecklist` y template no vacío → al confirmar
   cualquier orden se interpone un modal con los items como checkboxes; el
   botón "Confirmar orden" se habilita con todos tildados. El estado tildado
   se guarda en `order.notes` como líneas "✓ item".

### Cambios
- `testing-store.ts`: campos + backfill.
- Chart page: memo `dayStats = { trades, pnl }` del día del cursor; banners +
  disabled props hacia PlaceOrderDialog/fast buttons.
- Nuevo `ChecklistGate.tsx` (modal interpuesto).
- Página resumen de sesión: editor de rules + checklist.

### Aceptación
1. maxTradesPerDay=3: al cerrar el 3er trade del día del cursor, Buy/Sell se
   deshabilitan; avanzar el replay al día siguiente los rehabilita.
2. maxDailyLoss=500: dos pérdidas de 300 bloquean la tercera orden.
3. Checklist de 3 items: la orden no se confirma hasta tildar los 3; quedan
   registrados en las notas de la orden.

---

## Orden de implementación recomendado

| Orden | Sección | Dependencias | Tamaño |
|---|---|---|---|
| 1 | §8 tests (casos existentes) | — | S |
| 2 | §2 atajos + jump-to-date | — | S |
| 3 | §1 undo/redo | — | M |
| 4 | §5 comisiones/spread | §8 (agrega casos 13-14) | S |
| 5 | §3 sizing por riesgo | §5 (usa balance) | S |
| 6 | §4 breakeven | §8 (caso 16) | S |
| 7 | §7 edición inline | — | S |
| 8 | §6 cierre parcial | §5 | M |
| 9 | §9 settings indicadores | — | S |
| 10 | §10 polish visual | — | S |
| 11 | §13 backfill Supabase | infra ya deployada | M |
| 12 | §11 intra-bar playback | §13 recomendado (1m cacheado) | L |
| 13 | §12 multi-TF sync | §11 opcional | M |
| 14 | §15 íconos SVG | — | M |
| 15 | §14 symbol search | — | M |
| 16 | §16 checklist + límites | — | M |

---

## Estado — todas las secciones implementadas

| Sección | Commit | Notas |
|---|---|---|
| §8 tests del engine | `7273a6f` | base de la suite |
| §2 atajos + jump-to-date | `41c9921` | |
| §1 undo/redo de dibujos | `03f93b4` | snapshots, no persiste al recargar |
| §5 comisiones/spread | `cc9f26c` | |
| §3 sizing por riesgo | `1cae10c` | |
| §4 breakeven | — | incluido en §5/§7 |
| §7 edición inline | — | incluido con §4 |
| §9 settings de indicadores | `ef7083d` | |
| §10 polish visual | `02a9f3a` | paleta única en `lib/theme.ts` |
| §6 cierre parcial | `2f2c0a9` | |
| §13 backfill Supabase | `89ac06a` | requiere los pasos de infra de abajo |
| §11 intra-bar playback | `1c38a8d` | |
| §12 multi-TF sync | `fabb59d` | |
| §15 íconos SVG | `65fda30` | "Patrones" sigue con glifo |
| §14 symbol search | `9ee2b82` | |
| §16 checklist + límites | `7ac87e1` | |

Fuera del spec, en el camino: `3eb8b84` arregla que NQ/SPX/DJI dieran 500
desde el server (URL relativa al proxy de Yahoo + 422 por pedir más historia
de la que Yahoo sirve por interval).

### Lo que queda del lado de la infra (no es código)

1. Vercel → Settings → Deployment Protection → apagar "Require Log In"
   (con esto prendido el cron recibe un 302 y no ingesta nada).
2. Correr en Supabase la migración de `public.candles(symbol, tf, time_sec,
   o, h, l, c, v)` con su PK, índice y RLS.
3. Cargar en Vercel las env vars `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` y
   `CRON_SECRET`. La service key que se pegó en el chat quedó comprometida:
   rotarla antes de usarla.
4. GitHub Actions → "Ingest candles hourly" → Run workflow, para verificar.
5. Para traer historia vieja: GitHub Actions → "Backfill histórico" →
   Run workflow, eligiendo símbolo, TF y fecha de arranque.
