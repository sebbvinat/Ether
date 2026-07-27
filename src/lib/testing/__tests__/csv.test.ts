/**
 * F6 — tests del export a CSV.
 *
 * El riesgo real no es el formato: es que un tag o un nombre de sesión con
 * una coma corra todas las columnas siguientes y el archivo quede mal sin
 * que nadie lo note hasta abrirlo.
 */

import { describe, expect, it } from "vitest";
import type { Trade } from "@/lib/store/testing-store";
import { csvField, csvFilename, tradeToRow, tradesToCsv } from "../csv";

const META = { name: "NQ 1A1 RT", symbol: "^IXIC" };
const OPENED = Date.UTC(2024, 2, 5, 14, 30);
const CLOSED = Date.UTC(2024, 2, 5, 15, 0);

function mkTrade(over: Partial<Trade> = {}): Trade {
  return {
    id: "t1",
    sessionId: "s1",
    side: "buy",
    size: 2,
    entry: 100,
    closePrice: 110,
    sl: 95,
    tp: 120,
    closeReason: "tp",
    openedAt: OPENED,
    closedAt: CLOSED,
    realizedPnL: 20,
    commission: 1.5,
    rMultiple: 2,
    idealRR: 2.5,
    outcome: "win",
    maxAdverse: -3,
    maxFavorable: 25,
    tags: ["ict", "ny-am"],
    ...over,
  };
}

describe("csvField", () => {
  it("deja pasar lo que no necesita comillas", () => {
    expect(csvField("buy")).toBe("buy");
    expect(csvField(42)).toBe("42");
  });

  it("entrecomilla lo que tiene comas, comillas o saltos", () => {
    expect(csvField("NQ, RT")).toBe('"NQ, RT"');
    expect(csvField('el "setup"')).toBe('"el ""setup"""');
    expect(csvField("linea1\nlinea2")).toBe('"linea1\nlinea2"');
  });

  it("null y undefined quedan vacíos, no 'null'", () => {
    expect(csvField(undefined)).toBe("");
    expect(csvField(null)).toBe("");
  });
});

describe("tradeToRow", () => {
  it("arma la fila con los campos del trade", () => {
    const row = tradeToRow(mkTrade(), META);

    expect(row[0]).toBe("NQ 1A1 RT");
    expect(row[1]).toBe("^IXIC");
    expect(row[2]).toBe("buy");
    expect(row[10]).toBe("30.0"); // duración en minutos
    expect(row[11]).toBe("tp");
    expect(row[13]).toBe("20.00"); // realized
    expect(row[19]).toBe("ict ny-am");
  });

  it("los campos opcionales ausentes quedan vacíos", () => {
    const row = tradeToRow(
      mkTrade({ sl: undefined, tp: undefined, rMultiple: undefined, idealRR: undefined }),
      META,
    );
    expect([row[6], row[7], row[15], row[16]]).toEqual(["", "", "", ""]);
  });
});

describe("tradesToCsv", () => {
  it("encabezado + una fila por trade, separadas por CRLF", () => {
    const csv = tradesToCsv([mkTrade(), mkTrade({ id: "t2" })], META);
    const lines = csv.split("\r\n");

    expect(lines).toHaveLength(3);
    expect(lines[0].startsWith("session,symbol,side,size,entry,close")).toBe(true);
  });

  it("sin trades deja sólo el encabezado", () => {
    expect(tradesToCsv([], META).split("\r\n")).toHaveLength(1);
  });

  it("una coma en el nombre o en un tag no corre las columnas", () => {
    const csv = tradesToCsv([mkTrade({ tags: ["a,b", "c"] })], {
      name: "NQ, RT",
      symbol: "^IXIC",
    });
    const header = csv.split("\r\n")[0].split(",").length;
    const row = csv.split("\r\n")[1];

    // Contar sólo las comas que están FUERA de comillas: tienen que ser las
    // mismas que separan el encabezado.
    let inQuotes = false;
    let commas = 0;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === "," && !inQuotes) commas++;
    }
    expect(commas + 1).toBe(header);
  });
});

describe("csvFilename", () => {
  it("arma un nombre sin caracteres problemáticos", () => {
    expect(csvFilename("NQ 1A1 RT / NY AM", Date.UTC(2024, 2, 5))).toBe(
      "ether-nq-1a1-rt-ny-am-2024-03-05.csv",
    );
  });

  it("un nombre que queda vacío al limpiarlo no deja el archivo sin nombre", () => {
    expect(csvFilename("///", Date.UTC(2024, 2, 5))).toBe("ether-sesion-2024-03-05.csv");
  });
});
