# Runbook — poner en marcha el cache de velas

Todo el código ya está deployado. Lo que falta son 5 pasos de configuración
que sólo se pueden hacer desde las consolas de Supabase, Vercel y GitHub.

Hasta que estén hechos, la app **funciona igual**: cada navegador pide las
velas directo a Binance/Yahoo y las cachea en su propio IndexedDB. Lo que
cambia al terminar es que el cache pasa a ser tuyo y compartido — se llena
solo cada hora, sin que tengas que abrir la app, y una PC nueva ya lo
encuentra lleno.

---

## 0. Rotar la service key (primero que nada)

La `service_role` key que pegaste en el chat quedó comprometida. Esa key
**bypassea RLS**: con ella se lee y escribe cualquier tabla del proyecto.

1. Supabase → Project Settings → API → Service role → **Reset**.
2. Copiá la nueva. Va directo a Vercel en el paso 3 — no la pegues en un
   chat, ni en el código, ni en un commit.

---

## 1. Crear la tabla

Supabase → **SQL Editor** → New query → pegar el contenido de
[`supabase/migrations/001_candles.sql`](../supabase/migrations/001_candles.sql)
→ **Run**.

Crea `public.candles` con la PK `(symbol, tf, time_sec)` —de ahí sale que
re-ingestar el mismo rango actualice en vez de duplicar—, el índice de
rango, y deja RLS prendido sin políticas, así la tabla no queda abierta a
cualquiera que tenga la URL del proyecto.

Verificación: Table Editor → tiene que aparecer `candles`, vacía.

---

## 2. Apagar la protección de deploy

Vercel → tu proyecto → Settings → **Deployment Protection** → apagar
**"Vercel Authentication"** (el toggle que hoy está en *Standard
Protection*).

Con esto prendido, el cron de GitHub recibe un **302** hacia la pantalla de
login en vez de llegar al endpoint, y no ingesta nada. Es lo que venía
fallando.

Las rutas siguen protegidas igual: `/api/cron/*` y `/api/admin/*` exigen el
header `Authorization: Bearer <CRON_SECRET>` y responden 401 sin él.

---

## 3. Cargar las variables en Vercel

Vercel → Settings → **Environment Variables**. Las tres, marcadas para
**Production** (y Preview si querés probar ahí):

| Nombre | Valor |
|---|---|
| `SUPABASE_URL` | `https://fgdefuffyqurhatvnzvr.supabase.co` |
| `SUPABASE_SERVICE_KEY` | la key **nueva** del paso 0 |
| `CRON_SECRET` | una cadena larga al azar que inventes vos |

Para `CRON_SECRET` sirve cualquier cosa difícil de adivinar; es sólo el
secreto compartido entre GitHub y Vercel. Por ejemplo, en una terminal:

```bash
openssl rand -hex 32
```

**Después de guardar hay que redeployar** — Vercel no aplica variables
nuevas a un deploy que ya existe. Deployments → el último → ⋯ → Redeploy.

---

## 4. Cargar los secrets en GitHub

GitHub → repo `Ether` → Settings → Secrets and variables → **Actions** →
New repository secret. Dos:

| Nombre | Valor |
|---|---|
| `VERCEL_URL` | la URL de producción **sin barra final**, ej. `https://ether-xxxx.vercel.app` |
| `CRON_SECRET` | exactamente el mismo string que pusiste en Vercel |

Si los dos `CRON_SECRET` no coinciden, el workflow recibe 401.

---

## 5. Probar

GitHub → Actions → **"Ingest candles hourly"** → Run workflow.

- **Verde** → Supabase → Table Editor → `candles` tiene filas. Listo: de acá
  en más corre solo cada hora.
- **Rojo con 302** → falta el paso 2.
- **Rojo con 401** → los `CRON_SECRET` no coinciden, o falta redeployar
  después del paso 3.
- **Rojo con 500 "supabase not configured"** → faltan las variables del paso
  3, o el redeploy.

---

## Traer historia vieja (opcional, cuando quieras)

El cron horario mantiene la punta al día pero nunca va hacia atrás. Para
llenar el pasado: GitHub → Actions → **"Backfill histórico"** → Run
workflow, con:

- **symbol**: `BTCUSDT`, `ETHUSDT`, `SOLUSDT`, `^GSPC`, `^IXIC`, `^DJI`
- **tf**: `1m`, `15m`, `1h`, `4h`, `1d`
- **fromDate**: hasta dónde ir hacia atrás, `YYYY-MM-DD`

Corre en tandas hasta cubrir el rango y va mostrando el avance. Se puede
re-ejecutar sin miedo: el upsert no duplica.

### Cuánto entra en el free tier (500 MB)

| Qué | Aprox. |
|---|---|
| 15m/1h/4h/1d de los 6 símbolos, historia completa | ~40 MB |
| 1m de BTCUSDT + ETHUSDT, últimos 12 meses | ~90 MB |
| 1m de BTCUSDT desde 2017 | ~400 MB — solo, casi llena el tier |

Sugerencia de orden: primero los TFs altos de todo (baratos y es lo que más
se usa), después 1m de los dos pares de cripto que más operes.

**Yahoo no tiene historia intradía profunda**: 7 días de 1m, 60 de 5/15/30m,
730 de 60m. Para NQ/SPX/DJI el backfill de 1m no va a traer años por más que
se lo pidas — no es un error del script, es lo que Yahoo sirve. Para 1m real
de futuros hace falta un proveedor pago (Databento, Polygon).
