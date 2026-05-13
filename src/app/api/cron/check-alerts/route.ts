import { NextRequest, NextResponse } from "next/server";
import { listAlerts, markTriggered } from "@/lib/alerts/store";
import { sendTelegramMessage } from "@/lib/alerts/telegram";
import { ema, rsi, macd } from "@/lib/indicators";
import { describeCondition, type Alert } from "@/lib/alerts/types";
import type { Candle } from "@/lib/binance/types";

export const dynamic = "force-dynamic";

const BINANCE_BASE = "https://api.binance.com/api/v3";
const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

async function fetchBinanceKlines(
  symbol: string,
  interval: string,
): Promise<Candle[]> {
  const url = `${BINANCE_BASE}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=300`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as unknown[][];
  return data.map((k) => ({
    time: Math.floor((k[0] as number) / 1000),
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
    isFinal: true,
  }));
}

const YAHOO_TF_MAP: Record<string, { interval: string; range: string }> = {
  "1m": { interval: "1m", range: "5d" },
  "5m": { interval: "5m", range: "1mo" },
  "15m": { interval: "15m", range: "3mo" },
  "30m": { interval: "30m", range: "3mo" },
  "1h": { interval: "60m", range: "6mo" },
  "4h": { interval: "60m", range: "1y" },
  "1d": { interval: "1d", range: "5y" },
};

async function fetchYahooKlines(
  symbol: string,
  tf: string,
): Promise<Candle[]> {
  const conf = YAHOO_TF_MAP[tf] ?? YAHOO_TF_MAP["1h"];
  const url = `${YAHOO_BASE}/${encodeURIComponent(symbol)}?interval=${conf.interval}&range=${conf.range}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const j = (await res.json()) as {
    chart: {
      result?: Array<{
        timestamp?: number[];
        indicators: {
          quote: Array<{
            open: (number | null)[];
            high: (number | null)[];
            low: (number | null)[];
            close: (number | null)[];
            volume: (number | null)[];
          }>;
        };
      }> | null;
    };
  };
  const r = j.chart.result?.[0];
  if (!r) return [];
  const ts = r.timestamp ?? [];
  const q = r.indicators.quote[0];
  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open[i],
      h = q.high[i],
      l = q.low[i],
      c = q.close[i],
      v = q.volume[i];
    if (o == null || h == null || l == null || c == null) continue;
    out.push({
      time: ts[i],
      open: o,
      high: h,
      low: l,
      close: c,
      volume: v ?? 0,
      isFinal: true,
    });
  }
  return out;
}

async function fetchKlinesFor(alert: Alert): Promise<Candle[]> {
  const tf = alert.timeframe ?? "15m";
  if (alert.provider === "binance") {
    return fetchBinanceKlines(alert.resolvedSymbol, tf);
  }
  return fetchYahooKlines(alert.resolvedSymbol, tf);
}

function evaluateAlert(alert: Alert, candles: Candle[]): {
  triggered: boolean;
  detail: string;
} {
  if (candles.length < 5) return { triggered: false, detail: "" };
  const last = candles[candles.length - 1];
  const c = alert.condition;

  if (c.type === "price") {
    const t =
      c.direction === "above" ? last.close >= c.price : last.close <= c.price;
    return {
      triggered: t,
      detail: `Precio: ${last.close.toFixed(2)}`,
    };
  }

  if (c.type === "ema-cross") {
    if (candles.length < c.slow + 2)
      return { triggered: false, detail: "insufficient data" };
    const fast = ema(candles, c.fast);
    const slow = ema(candles, c.slow);
    if (fast.length < 2 || slow.length < 2)
      return { triggered: false, detail: "" };
    const fLast = fast.at(-1)!.value;
    const fPrev = fast.at(-2)!.value;
    const sLast = slow.at(-1)!.value;
    const sPrev = slow.at(-2)!.value;
    const crossedAbove = fPrev <= sPrev && fLast > sLast;
    const crossedBelow = fPrev >= sPrev && fLast < sLast;
    const triggered =
      c.direction === "above" ? crossedAbove : crossedBelow;
    return {
      triggered,
      detail: `EMA(${c.fast})=${fLast.toFixed(2)}  EMA(${c.slow})=${sLast.toFixed(2)}`,
    };
  }

  if (c.type === "rsi-threshold") {
    if (candles.length < c.period + 2)
      return { triggered: false, detail: "insufficient data" };
    const r = rsi(candles, c.period);
    if (r.length < 2) return { triggered: false, detail: "" };
    const last = r.at(-1)!.value;
    const prev = r.at(-2)!.value;
    const triggered =
      c.direction === "above"
        ? prev <= c.threshold && last > c.threshold
        : prev >= c.threshold && last < c.threshold;
    return {
      triggered,
      detail: `RSI(${c.period})=${last.toFixed(1)}`,
    };
  }

  if (c.type === "macd-cross") {
    if (candles.length < c.slow + c.signal + 2)
      return { triggered: false, detail: "insufficient data" };
    const m = macd(candles, c.fast, c.slow, c.signal);
    if (m.length < 2) return { triggered: false, detail: "" };
    const last = m.at(-1)!;
    const prev = m.at(-2)!;
    const crossedAbove =
      prev.macd <= prev.signal && last.macd > last.signal;
    const crossedBelow =
      prev.macd >= prev.signal && last.macd < last.signal;
    const triggered =
      c.direction === "above" ? crossedAbove : crossedBelow;
    return {
      triggered,
      detail: `MACD=${last.macd.toFixed(2)}  Signal=${last.signal.toFixed(2)}`,
    };
  }

  return { triggered: false, detail: "" };
}

function formatMessage(alert: Alert, detail: string): string {
  const note = alert.note ? `\n📝 <i>${alert.note}</i>` : "";
  return (
    `🔔 <b>${alert.symbol}</b>${alert.timeframe ? ` · ${alert.timeframe}` : ""}\n` +
    `${describeCondition(alert.condition)}\n` +
    `${detail}` +
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

    // Group by symbol+tf+provider to fetch klines once per group
    const groupKey = (a: Alert) =>
      `${a.provider}::${a.resolvedSymbol}::${a.timeframe ?? "15m"}`;
    const groups = new Map<string, Alert[]>();
    for (const a of alerts) {
      const k = groupKey(a);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(a);
    }

    let triggered = 0;
    for (const [, group] of groups) {
      const candles = await fetchKlinesFor(group[0]);
      if (candles.length === 0) continue;
      for (const alert of group) {
        const { triggered: t, detail } = evaluateAlert(alert, candles);
        if (!t) continue;
        const msg = formatMessage(alert, detail);
        const sent = await sendTelegramMessage(msg);
        if (sent.ok) {
          await markTriggered(alert);
          triggered++;
        }
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
