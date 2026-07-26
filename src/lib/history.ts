/**
 * §1 — stack de undo/redo genérico por snapshots.
 *
 * Por qué snapshots y no command pattern: los arrays de dibujos son chicos
 * (cientos de items de ~100 bytes), así que guardar el estado entero por
 * mutación cuesta poco y elimina toda una clase de bugs (la operación inversa
 * mal calculada). El cap evita que un usuario muy activo acumule memoria.
 *
 * El stack NO persiste: al recargar la página se pierde, igual que en
 * TradingView. Los dibujos sí persisten (IDB / localStorage).
 */
export class HistoryStack<T> {
  private past: T[] = [];
  private future: T[] = [];

  constructor(private readonly cap = 50) {}

  /** Registra un snapshot del estado ANTES de mutarlo. */
  push(snapshot: T): void {
    this.past.push(snapshot);
    if (this.past.length > this.cap) this.past.shift();
    // Cualquier acción nueva invalida la rama de redo.
    this.future = [];
  }

  /** Devuelve el estado anterior, o null si no hay nada que deshacer. */
  undo(current: T): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(current);
    return prev;
  }

  /** Devuelve el estado rehecho, o null si no hay nada que rehacer. */
  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    return next;
  }

  /** Vacía el historial (ej. al cambiar de sesión — no cruzar contextos). */
  clear(): void {
    this.past = [];
    this.future = [];
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }
}
