"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useTestingStore } from "@/lib/store/testing-store";
import { getInstrument } from "@/lib/instruments";

interface Props {
  params: Promise<{ id: string }>;
}

export default function SessionChartPage({ params }: Props) {
  const { id } = use(params);
  const session = useTestingStore((s) => s.sessions.find((x) => x.id === id));

  if (!session) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Link
          href="/testing/sessions"
          className="inline-flex items-center gap-1 text-[12px] text-tv-text-muted hover:text-tv-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver
        </Link>
        <div className="mt-6 rounded-lg border border-tv-border p-6 text-center text-sm text-tv-text-muted">
          Esa sesión no existe.
        </div>
      </div>
    );
  }
  const inst = getInstrument(session.symbol);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <Link
        href={`/testing/sessions/${session.id}`}
        className="inline-flex w-fit items-center gap-1 text-[12px] text-tv-text-muted hover:text-tv-text"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver al resumen
      </Link>
      <header>
        <h1 className="text-xl font-semibold text-tv-text">
          {session.name} · Chart
        </h1>
        <p className="mt-0.5 text-[12px] text-tv-text-muted">
          {inst.displayName} · {session.timeframe}
        </p>
      </header>
      <section className="grid min-h-[400px] place-items-center rounded-lg border border-dashed border-tv-border bg-tv-panel/20 p-8 text-center">
        <div>
          <p className="text-sm text-tv-text">
            🚧 El chart de la sesión llega en <b>Wave 18a</b>.
          </p>
          <p className="mt-2 text-[12px] text-tv-text-muted">
            Acá va a vivir el chart con replay + Place Order + posiciones vivas
            + account ticker. Por ahora la foundation (store + IDB + sidebar +
            sesiones) está lista.
          </p>
        </div>
      </section>
    </div>
  );
}
