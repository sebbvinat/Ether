/**
 * §1 — tests del stack de undo/redo.
 *
 * La lógica sutil está toda acá: que una acción nueva invalide el redo, que
 * el cap descarte lo más viejo (y no lo más nuevo), y que clear() deje ambas
 * ramas vacías. El cableado en los stores es una línea por acción y lo cubre
 * TypeScript.
 */

import { describe, expect, it } from "vitest";
import { HistoryStack } from "../history";

describe("HistoryStack", () => {
  it("deshace en orden inverso y rehace en orden directo", () => {
    const h = new HistoryStack<string>();
    // Estados: "" → "a" → "ab" → "abc". Se pushea el estado PREVIO a mutar.
    h.push("");
    h.push("a");
    h.push("ab");

    expect(h.undo("abc")).toBe("ab");
    expect(h.undo("ab")).toBe("a");
    expect(h.undo("a")).toBe("");
    expect(h.undo("")).toBeNull(); // ya no queda nada

    expect(h.redo("")).toBe("a");
    expect(h.redo("a")).toBe("ab");
    expect(h.redo("ab")).toBe("abc");
    expect(h.redo("abc")).toBeNull();
  });

  it("una acción nueva después de un undo invalida el redo", () => {
    const h = new HistoryStack<string>();
    h.push("a");
    h.push("ab");
    expect(h.undo("abc")).toBe("ab");
    expect(h.canRedo).toBe(true);

    // El usuario dibuja otra cosa en vez de rehacer.
    h.push("ab");
    expect(h.canRedo).toBe(false);
    expect(h.redo("abX")).toBeNull();
  });

  it("respeta el cap descartando el snapshot MÁS VIEJO", () => {
    const h = new HistoryStack<number>(3);
    h.push(1);
    h.push(2);
    h.push(3);
    h.push(4); // desplaza al 1

    expect(h.undo(5)).toBe(4);
    expect(h.undo(4)).toBe(3);
    expect(h.undo(3)).toBe(2);
    expect(h.undo(2)).toBeNull(); // el 1 se descartó por el cap
  });

  it("clear() vacía las dos ramas", () => {
    const h = new HistoryStack<string>();
    h.push("a");
    h.undo("b"); // deja algo en future
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(true);

    h.clear();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.undo("x")).toBeNull();
    expect(h.redo("x")).toBeNull();
  });

  it("canUndo/canRedo reflejan el estado en cada paso", () => {
    const h = new HistoryStack<string>();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);

    h.push("a");
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);

    h.undo("b");
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(true);

    h.redo("a");
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);
  });

  it("funciona con snapshots de objeto (el caso real: drawings + estilos)", () => {
    type Snap = { drawings: string[]; styles: Record<string, string> };
    const h = new HistoryStack<Snap>();
    const s0: Snap = { drawings: [], styles: {} };
    const s1: Snap = { drawings: ["d1"], styles: {} };
    const s2: Snap = { drawings: ["d1"], styles: { d1: "red" } };

    h.push(s0);
    h.push(s1);

    // Deshacer el cambio de color devuelve el estado sin estilo…
    const back1 = h.undo(s2);
    expect(back1).toEqual(s1);
    // …y deshacer de nuevo devuelve el lienzo vacío.
    expect(h.undo(back1!)).toEqual(s0);
    // Rehacer recupera ambos, incluyendo los estilos.
    expect(h.redo(s0)).toEqual(s1);
    expect(h.redo(s1)).toEqual(s2);
  });
});
