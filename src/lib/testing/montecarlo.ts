/**
 * Wave 22 — Montecarlo simulator.
 *
 * Tomando los parámetros (n sims, trades per sim, balance inicial, avg gain,
 * avg loss, win rate), corre N simulaciones aleatorias y devuelve las
 * equity curves resultantes.
 *
 * Útil para responder: "si mi setup tiene 60% win rate y 1.8R promedio,
 * ¿cuál es la dispersión de outcomes después de 100 trades?"
 */

export interface MontecarloInput {
  nSimulations: number;
  tradesPerSim: number;
  startBalance: number;
  avgGain: number; // monto positivo $ por trade ganador
  avgLoss: number; // monto positivo $ por trade perdedor (lo restamos)
  winRate: number; // 0..1 (no 0..100)
}

export interface MontecarloResult {
  /** Array de equity series (cada series: array de balances). */
  simulations: number[][];
  /** Final balances ordenados ASC. */
  finals: number[];
  /** Estadísticas. */
  median: number;
  p10: number;
  p90: number;
  best: number;
  worst: number;
  /** Probabilidad de terminar arriba del start. */
  probWin: number;
}

export function runMontecarlo(input: MontecarloInput): MontecarloResult {
  const sims: number[][] = [];
  const wr = Math.max(0, Math.min(1, input.winRate));
  for (let s = 0; s < input.nSimulations; s++) {
    const series: number[] = [input.startBalance];
    let bal = input.startBalance;
    for (let i = 0; i < input.tradesPerSim; i++) {
      const win = Math.random() < wr;
      bal += win ? input.avgGain : -input.avgLoss;
      series.push(bal);
    }
    sims.push(series);
  }
  const finals = sims.map((s) => s[s.length - 1]).sort((a, b) => a - b);
  const med = finals[Math.floor(finals.length / 2)] ?? input.startBalance;
  const p10 = finals[Math.floor(finals.length * 0.1)] ?? input.startBalance;
  const p90 = finals[Math.floor(finals.length * 0.9)] ?? input.startBalance;
  const winners = finals.filter((f) => f > input.startBalance).length;
  return {
    simulations: sims,
    finals,
    median: med,
    p10,
    p90,
    best: finals[finals.length - 1] ?? input.startBalance,
    worst: finals[0] ?? input.startBalance,
    probWin: finals.length > 0 ? winners / finals.length : 0,
  };
}
