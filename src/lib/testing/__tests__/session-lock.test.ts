/**
 * G3 — tests del desempate entre pestañas.
 *
 * Lo único que importa acá: dadas dos pestañas mirando el mismo par de
 * claims, tienen que llegar a conclusiones OPUESTAS. Si las dos ceden nadie
 * escribe; si ninguna cede, volvemos a que se pisen los datos.
 */

import { describe, expect, it } from "vitest";
import { newClaim, shouldYieldTo, type ClaimId } from "../session-lock";

const A: ClaimId = { tabId: "aaa", at: 1000 };
const B: ClaimId = { tabId: "bbb", at: 2000 };

describe("shouldYieldTo", () => {
  it("gana la que reclamó primero", () => {
    expect(shouldYieldTo(B, A)).toBe(true); // B llegó después → cede
    expect(shouldYieldTo(A, B)).toBe(false);
  });

  it("con el mismo instante desempata el tabId", () => {
    const x: ClaimId = { tabId: "aaa", at: 500 };
    const y: ClaimId = { tabId: "bbb", at: 500 };
    expect(shouldYieldTo(y, x)).toBe(true);
    expect(shouldYieldTo(x, y)).toBe(false);
  });

  it("nunca ceden las dos ni se queda ninguna", () => {
    const claims: ClaimId[] = [
      { tabId: "a", at: 1 },
      { tabId: "b", at: 1 },
      { tabId: "c", at: 2 },
      { tabId: "d", at: 0 },
    ];
    for (const p of claims) {
      for (const q of claims) {
        if (p.tabId === q.tabId) continue;
        // Exactamente una de las dos cede.
        expect(shouldYieldTo(p, q)).not.toBe(shouldYieldTo(q, p));
      }
    }
  });

  it("un claim forzado en at=0 le gana a cualquiera normal", () => {
    const forzado: ClaimId = { tabId: "zzz", at: 0 };
    const normal = newClaim(Date.now());
    expect(shouldYieldTo(normal, forzado)).toBe(true);
    expect(shouldYieldTo(forzado, normal)).toBe(false);
  });
});

describe("newClaim", () => {
  it("dos claims seguidos no comparten tabId", () => {
    expect(newClaim(1).tabId).not.toBe(newClaim(1).tabId);
  });
});
