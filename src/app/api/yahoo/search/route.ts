import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.trim().length === 0) {
    return NextResponse.json({ quotes: [] });
  }
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=20&newsCount=0&listsCount=0`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ quotes: [] }, { status: res.status });
    }
    const json = await res.json();
    return NextResponse.json(json, {
      headers: { "cache-control": "public, max-age=30" },
    });
  } catch (e) {
    return NextResponse.json(
      { quotes: [], error: (e as Error).message },
      { status: 502 },
    );
  }
}
