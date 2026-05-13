# Setup de alertas Telegram

Las alertas ya están funcionando a nivel código pero requieren 2 servicios externos.
Mientras no estén configurados, la UI deja crear alertas pero **no se dispararán** (muestra un warning amarillo arriba del dialog).

## 1. Crear bot de Telegram (5 min)

1. En Telegram, hablale a `@BotFather`
2. Mandá `/newbot`
3. Elegí un nombre (ej: "Ether Alerts") y un username (ej: `ether_sebbvinat_bot`)
4. BotFather te da un **token** tipo `123456789:ABCDEF...`. **Guardalo**.
5. Hablale a tu bot (mandale `/start` o cualquier cosa) — necesita haber al menos 1 mensaje tuyo para que pueda escribirte.
6. Obtené tu **chat_id**: abrí en el browser:
   ```
   https://api.telegram.org/bot<TU_TOKEN>/getUpdates
   ```
   Buscá `"chat":{"id": NÚMERO, ...}` — ese número es tu chat_id.

## 2. Crear Upstash Redis (gratis, 3 min)

1. Andá a https://console.upstash.com/ (login con GitHub)
2. **Create Database** → name: `ether-alerts`, region cercana (us-east-1 por ej.), tipo Regional
3. Una vez creado, en la sección **REST API** te muestra:
   - `UPSTASH_REDIS_REST_URL` (ej: `https://us1-quick-fox-12345.upstash.io`)
   - `UPSTASH_REDIS_REST_TOKEN` (ej: `AYasASQg...`)

## 3. Agregar env vars en Vercel

1. Vercel dashboard → proyecto `ether` → **Settings** → **Environment Variables**
2. Agregá las 4 variables (las 3 son Production):

   | Name | Value |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | el token del paso 1 |
   | `TELEGRAM_CHAT_ID` | tu chat_id del paso 1 |
   | `UPSTASH_REDIS_REST_URL` | del paso 2 |
   | `UPSTASH_REDIS_REST_TOKEN` | del paso 2 |
   | `CRON_SECRET` *(opcional)* | string random — Vercel lo manda en el Authorization del cron |

3. Después de agregar, **Redeploy** el último deployment (Deployments → ... → Redeploy).

## 4. Verificar

1. Abrí la app → tocá el icono 🔔 (campana) arriba a la derecha
2. El warning amarillo debería desaparecer
3. Creá una alerta:
   - Símbolo: el actual (cambialo desde el chart si querés otro)
   - Dirección: ≥ o ≤
   - Precio: un número cerca del actual (ej: BTC actual 80k → poné 79k con `≥` para que dispare ya)
4. El cron corre cada minuto. En máximo 60s deberías recibir un msg en Telegram con:
   ```
   📈 BTCUSDT ≥ 79000
   💰 Precio actual: 80123.45
   ```

## Troubleshooting

- **No llega nada**: verificá que le hayas mandado un mensaje al bot primero. Si no, Telegram bloquea las APIs.
- **Cron no corre**: en Vercel free tier los cron jobs solo corren en Production deployments. Verificá en Vercel → **Crons** que aparezca `* * * * * /api/cron/check-alerts`.
- **Test manual del cron**: abrí `https://ether-three-sable.vercel.app/api/cron/check-alerts` en el browser. Si configuraste `CRON_SECRET` necesitarás un curl con header.
- **Logs**: Vercel → Deployment → Functions → `/api/cron/check-alerts` → logs.
