import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const symbol = sp.get("symbol");
  const interval = sp.get("interval") ?? "5m";
  const range = sp.get("range");
  const period1 = sp.get("period1");
  const period2 = sp.get("period2");
  if (!symbol) {
    return new NextResponse("symbol required", { status: 400 });
  }
  // Wave 18.12 — soportamos period1/period2 (unix seconds) para rangos
  // arbitrarios. Si se pasan, tienen prioridad sobre `range`.
  const rangeQuery =
    period1 && period2
      ? `period1=${period1}&period2=${period2}`
      : `range=${range ?? "1mo"}`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?interval=${interval}&${rangeQuery}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return new NextResponse(`fetch failed: ${(e as Error).message}`, {
      status: 502,
    });
  }
}
