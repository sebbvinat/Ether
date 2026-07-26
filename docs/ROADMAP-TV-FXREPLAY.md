# Roadmap: paridad con TradingView + FXReplay

Análisis de brechas al detalle entre Ether (estado actual) y las dos referencias,
con plan de acción priorizado. Actualizado: 2026-07-26.

## Estado actual (resumen)

**Live chart (`/`)**: 25 indicadores, 30+ herramientas de dibujo, replay básico,
alertas client+server, watchlist, Pine editor básico, backtest dialog, temas,
atajos configurables, Renko/LineBreak, Volume Profile, sesiones, Data Window.

**Testing (`/testing`)**: sesiones con cursor por tiempo, engine de órdenes
(market/limit/stop, SL/TP intra-bar), overlays draggeables, panel de posiciones,
equity curve, journal, analytics con Montecarlo, 6 drawing tools, 10 indicadores,
cache Supabase + IDB + prefetcher.

---

## A. Replay realista (el corazón de FXReplay)

| # | Gap | Detalle | Esfuerzo | Impacto |
|---|-----|---------|----------|---------|
| A1 | **Intra-bar playback** | FXReplay anima la vela ACTUAL formándose (la ves crecer O→L→H→C). Ether salta velas enteras. Implementación: cuando TF>1m, traer las sub-velas 1m de la barra actual y animarlas al speed elegido; el cursor avanza en sub-pasos y el engine evalúa fills en cada sub-vela (más realista aún que el intra-bar actual). | Alto | **Enorme** — es LA diferencia de realismo |
| A2 | **Multi-TF sync** | Dos charts de la misma sesión lado a lado (ej. 1m ejecución + 15m contexto) clippeados al mismo cursor. Vital para ICT/SMC. | Medio | Alto |
| A3 | **Jump-to-date** | Date picker con calendario para saltar a cualquier fecha del rango. Hoy solo hay Go To por sesión horaria. | Bajo | Medio |
| A4 | **Atajos de replay** | Space = play/pause · →/← = step · Shift+→ = step ×10 · Home = inicio · End = skip-to-end. | Bajo | Alto |
| A5 | **Pausa en cierre de barra** | Toggle "pausar al cierre de cada vela del TF" durante autoplay (para decidir bar-by-bar sin apurarse). | Bajo | Medio |

## B. Ejecución de órdenes (paridad FXReplay)

| # | Gap | Detalle | Esfuerzo | Impacto |
|---|-----|---------|----------|---------|
| B1 | **Sizing por riesgo** | Campo "Riesgo %" (o $ fijo) en PlaceOrderDialog: al setear SL autocalcula contratos = (balance × riesgo%) / \|entry − SL\|. FXReplay lo tiene y es lo más usado. | Bajo | **Alto** |
| B2 | **Cierre parcial** | Botones 25%/50%/custom en posición abierta. Requiere refactor Position → lots[] con avg price. | Medio | Alto |
| B3 | **SL a breakeven** | Botón "BE" en el overlay + opción auto-BE al tocar 1R. | Bajo | Alto |
| B4 | **Trailing stop** | Trail por ticks o por % desde el máximo favorable. | Bajo-medio | Medio |
| B5 | **Comisiones y spread** | Config por sesión (commission/contrato + spread en ticks aplicado al fill). Hoy commission=0 hardcoded. | Bajo | Alto (PnL realista) |
| B6 | **Edición inline en panel** | Editar SL/TP/size desde la tabla de posiciones sin ir al chart. | Bajo | Medio |
| B7 | **Margen/leverage sim** | Margin call warning. | Medio | Bajo |

## C. Chart UX / estética TradingView

| # | Gap | Detalle | Esfuerzo | Impacto |
|---|-----|---------|----------|---------|
| C1 | **Iconografía SVG real** | La toolbar usa glyphs unicode (╱ ▢ φ). TV usa íconos SVG diseñados. Dibujar set custom de ~30 íconos. | Medio | **Alto visual** |
| C2 | **Undo/redo** | Ctrl+Z/Ctrl+Y para drawings (y cancel de órdenes). TV lo tiene; se extraña MUCHO al dibujar. History stack en ambos stores. | Medio | **Crítico** |
| C3 | **Context menu right-click** | "Agregar alerta acá" · "Línea horizontal acá" · "Copiar precio" · settings. | Medio | Alto |
| C4 | **Crosshair pills TV** | Labels redondeados en los ejes con el precio/fecha bajo el cursor. Parcial hoy. | Bajo | Medio |
| C5 | **Favoritos de tools** | Estrella en cada tool → barra flotante horizontal con favoritos (como TV). | Bajo-medio | Medio |
| C6 | **Estilo por defecto por tool** | Recordar último color/grosor usado por herramienta. | Bajo | Medio |
| C7 | **Symbol search estilo TV** | Modal con categorías (Crypto/Índices/Forex/Stocks), badges de exchange, historial, navegación por teclado. | Medio | Alto |
| C8 | **TF favoritos + custom** | Estrellas en TFs + input custom ("21m") con agregación client-side (ya existe la math). | Bajo-medio | Medio |
| C9 | **Watchlist pro** | Secciones colapsables, sparklines, columnas configurables. | Medio | Bajo-medio |
| C10 | **Multi-chart sync** | Layouts 2×1/2×2 con sync de crosshair/símbolo/TF. | Alto | Medio |
| C11 | **Object tree profundo** | Drag-reorder, lock/hide por dibujo, grupos. | Medio | Bajo |
| C12 | **Animaciones de precio** | Flash verde/rojo en el último precio, pulse en price line. | Bajo | Medio (feel) |
| C13 | **Skeletons + transiciones** | Loading states pulidos en vez de spinners. | Bajo | Medio (feel) |
| C14 | **Auditoría de theme** | Contrastar cada superficie contra la paleta TV exacta (#131722/#2a2e39/#d1d4dc). | Bajo | Medio |

## D. Indicadores / análisis

| # | Gap | Detalle | Esfuerzo | Impacto |
|---|-----|---------|----------|---------|
| D1 | **Settings de indicadores en testing** | Períodos editables (hoy RSI=14 fijo, etc.). Reusar IndicatorSettingsDialog. | Medio | Alto |
| D2 | Indicator-on-indicator | MA sobre RSI, etc. | Medio | Bajo |
| D3 | **Portar los 25 indicadores** al testing (math ya existe). | Bajo c/u | Medio |
| D4 | Templates de indicadores en testing. | Bajo | Medio |
| D5 | **Anchored VWAP en testing** (portar Wave 12). | Bajo-medio | Alto (ICT) |
| D6 | **Volume Profile en testing** + Fixed Range. | Medio | Alto (ICT) |

## E. Data (el elefante en la sala)

| # | Gap | Detalle | Esfuerzo | Impacto |
|---|-----|---------|----------|---------|
| E1 | **1m histórico de NQ/ES real** | Yahoo da solo 7 días de 1m y 60 de 15m. Para ICT en futuros hace falta proveedor pago: **Databento** (~$10-50 one-time por años de NQ 1m), Polygon ($29/mes). Decisión de presupuesto del usuario. | Medio | **Crítico para futuros** |
| E2 | **Backfill batch a Supabase** | Script one-shot que llena AÑOS de historia (el cron actual solo trae incremental). | Bajo | Alto |
| E3 | **1m crypto completo** | Binance da todo desde 2017. BTC 1m completo ≈ 400MB (cerca del límite free 500MB de Supabase). Decidir: últimos 2 años (~150MB) o upgrade ($25/mes por 8GB). | Bajo | Alto |
| E4 | Continuous contracts (roll) para futuros si va Databento. | Medio | Medio |

## F. Journal / analytics (paridad FXReplay)

| # | Gap | Detalle | Esfuerzo | Impacto |
|---|-----|---------|----------|---------|
| F1 | **Auto-screenshot** en entry y exit de cada trade. | Bajo | Alto |
| F2 | Tags con autocomplete (recordar tags usados). | Bajo | Medio |
| F3 | **Checklist pre-trade enforced** — modal con la checklist de la estrategia antes de confirmar la orden (toggle por sesión). | Medio | Alto (disciplina) |
| F4 | **Límites estilo prop firm** — max trades/día, max loss/día, profit target; banner + bloqueo al violarlos. | Medio | Alto |
| F5 | Day streak + gamification en dashboard. | Bajo | Bajo |
| F6 | Export/import CSV de trades. | Bajo | Medio |
| F7 | Comparar sesiones (equity curves superpuestas). | Medio | Medio |

## G. Procesos / calidad

| # | Gap | Detalle | Esfuerzo | Impacto |
|---|-----|---------|----------|---------|
| G1 | Undo/redo global (ver C2). | — | — |
| G2 | Indicador de autosave ("guardado ✓"). | Bajo | Bajo |
| G3 | Guard multi-tab (BroadcastChannel) para no pisar IDB. | Bajo | Medio |
| G4 | Toasts de error consistentes (hoy hay `alert()`). | Bajo | Medio |
| G5 | Responsive móvil del área testing. | Alto | Bajo (es desktop-first) |
| G6 | **Tests unitarios del engine** (fills, SL/TP, edge cases SL+TP misma vela). | Bajo-medio | Alto (confianza) |
| G7 | Perf: virtualizar tablas de 1000+ trades, memo de overlays. | Medio | Medio |

---

## Plan de acción priorizado

### Fase 1 — Retorno inmediato (1-2 sesiones de trabajo)
1. **C2** Undo/redo de drawings (Ctrl+Z/Y)
2. **A4** Atajos de replay (Space/→/←/Home/End) + **A3** jump-to-date
3. **B1** Sizing por riesgo + **B3** SL a breakeven + **B5** comisiones/spread por sesión
4. **G6** Tests del engine
5. **C12+C13+C14** Polish visual barato (flash de precio, skeletons, theme audit)
6. **D1** Settings de indicadores en testing

### Fase 2 — Realismo core
7. **A1** Intra-bar playback (la joya de FXReplay)
8. **B2** Cierre parcial + **B6** edición inline
9. **E2+E3** Backfill batch histórico a Supabase (decidir retención 1m)
10. **C1** Iconografía SVG custom
11. **C7** Symbol search modal estilo TV

### Fase 3 — Profundidad
12. **A2** Multi-TF sync (2 charts misma sesión)
13. **C3** Context menu + **C5** favoritos + **C6** estilos por defecto
14. **F3** Checklist enforced + **F4** límites prop firm
15. **D5** AVWAP + **D6** Volume Profile en testing
16. **F1** Auto-screenshots + **F2** tags autocomplete

### Fase 4 — Data pro (requiere decisión de presupuesto)
17. **E1** Proveedor de futuros (Databento recomendado)
18. **E4** Continuous contracts
19. **C10** Multi-chart layout sync
