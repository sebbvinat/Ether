import { NextRequest, NextResponse } from "next/server";
import { listAlerts, markTriggered } from "@/lib/alerts/store";
import { sendTelegramMessage } from "@/lib/alerts/telegram";
import type { Alert } from "@/lib/alerts/types";

export const dynamic = "force-dynamic";

const BINANCE_BASE = "https://api.binance.com/api/v3";
const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

async function fetchBinancePrices(
  symbols: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (symbols.length === 0) return out;
  const arr = JSON.stringify(symbols.map((s) => s.toUpperCase()));
  const url = `${BINANCE_BASE}/ticker/price?symbols=${encodeURIComponent(arr)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return out;
  const data = (await res.json()) as Array<{ symbol: string; price: string }>;
  for (const t of data) out.set(t.symbol, parseFloat(t.price));
  return out;
}

async function fetchYahooPrice(symbol: string): Promise<number | null> {
  try {
    const url = `${YAHOO_BASE}/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      chart: {
        result?: Array<{ meta?: { regularMarketPrice?: number } }> | null;
      };
    };
    const p = j.chart.result?.[0]?.meta?.regularMarketPrice;
    return typeof p === "number" ? p : null;
  } catch {
    return null;
  }
}

function shouldTrigger(alert: Alert, price: number): boolean {
  if (alert.direction === "above") return price >= alert.price;
  return price <= alert.price;
}

function formatAlertMessage(alert: Alert, price: number): string {
  const arrow = alert.direction === "above" ? "📈" : "📉";
  const cmp = alert.direction === "above" ? "≥" : "≤";
  const note = alert.note ? `\n📝 <i>${alert.note}</i>` : "";
  return (
    `${arrow} <b>${alert.symbol}</b> ${cmp} ${alert.price}\n` +
    `💰 Precio actual: <b>${price}</b>` +
    note
  );
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return new NextResponse("unauthorized", { status: 401 });
    }
  }

  try {
    const alerts = await listAlerts();
    if (alerts.length === 0) {
      return NextResponse.json({ checked: 0, triggered: 0 });
    }

    const binanceSymbols = Array.from(
      new Set(
        alerts
          .filter((a) => a.provider === "binance")
          .map((a) => a.resolvedSymbol),
      ),
    );
    const yahooSymbols = Array.from(
      new Set(
        alerts
          .filter((a) => a.provider === "yahoo")
          .map((a) => a.resolvedSymbol),
      ),
    );

    const [binancePrices, yahooPriceEntries] = await Promise.all([
      fetchBinancePrices(binanceSymbols),
      Promise.all(
        yahooSymbols.map(async (s) => [s, await fetchYahooPrice(s)] as const),
      ),
    ]);
    const yahooPrices = new Map<string, number>();
    for (const [s, p] of yahooPriceEntries) {
      if (p !== null) yahooPrices.set(s, p);
    }

    let triggered = 0;
    for (const alert of alerts) {
      const price =
        alert.provider === "binance"
          ? binancePrices.get(alert.resolvedSymbol)
          : yahooPrices.get(alert.resolvedSymbol);
      if (price === undefined) continue;
      if (!shouldTrigger(alert, price)) continue;

      const msg = formatAlertMessage(alert, price);
      const sent = await sendTelegramMessage(msg);
      if (sent.ok) {
        await markTriggered(alert);
        triggered++;
      }
    }

    return NextResponse.json({ checked: alerts.length, triggered });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
