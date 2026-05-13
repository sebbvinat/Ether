import { NextRequest, NextResponse } from "next/server";
import {
  deleteAlert,
  hasUpstash,
  listAlerts,
  listTriggered,
  saveAlert,
} from "@/lib/alerts/store";
import { hasTelegram } from "@/lib/alerts/telegram";
import type { Alert, CreateAlertInput } from "@/lib/alerts/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [alerts, triggered] = await Promise.all([
      listAlerts(),
      listTriggered(),
    ]);
    return NextResponse.json({
      alerts,
      triggered,
      upstashConfigured: hasUpstash(),
      telegramConfigured: hasTelegram(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, alerts: [], triggered: [] },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateAlertInput;
    if (
      !body.symbol ||
      !body.resolvedSymbol ||
      !body.condition ||
      !body.condition.type
    ) {
      return NextResponse.json({ error: "invalid input" }, { status: 400 });
    }
    const alert: Alert = {
      id: crypto.randomUUID(),
      symbol: body.symbol,
      resolvedSymbol: body.resolvedSymbol,
      provider: body.provider,
      timeframe: body.timeframe,
      condition: body.condition,
      note: body.note,
      createdAt: Date.now(),
    };
    await saveAlert(alert);
    return NextResponse.json({ alert });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  try {
    await deleteAlert(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
