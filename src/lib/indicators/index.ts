import type { Candle } from "@/lib/binance/types";

export interface IndicatorPoint {
  time: number;
  value: number;
}

export interface MACDPoint {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
}

/**
 * Simple Moving Average
 */
export function sma(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) out.push({ time: candles[i].time, value: sum / period });
  }
  return out;
}

/**
 * Exponential Moving Average — seeded with SMA of first `period` candles.
 */
export function ema(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += candles[i].close;
  prev /= period;
  out.push({ time: candles[period - 1].time, value: prev });
  for (let i = period; i < candles.length; i++) {
    prev = candles[i].close * k + prev * (1 - k);
    out.push({ time: candles[i].time, value: prev });
  }
  return out;
}

export interface BollingerPoint {
  time: number;
  basis: number;
  upper: number;
  lower: number;
}

/**
 * Bollinger Bands — SMA basis ± (stdDev × population standard deviation).
 */
export function bollinger(
  candles: Candle[],
  period = 20,
  mult = 2,
): BollingerPoint[] {
  const out: BollingerPoint[] = [];
  if (candles.length < period) return out;
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
    const mean = sum / period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = candles[j].close - mean;
      variance += d * d;
    }
    const sd = Math.sqrt(variance / period);
    out.push({
      time: candles[i].time,
      basis: mean,
      upper: mean + mult * sd,
      lower: mean - mult * sd,
    });
  }
  return out;
}

/**
 * RSI (Wilder) — period typically 14.
 */
export function rsi(candles: Candle[], period = 14): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  gain /= period;
  loss /= period;
  let rs = loss === 0 ? 100 : gain / loss;
  out.push({ time: candles[period].time, value: 100 - 100 / (1 + rs) });
  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    rs = loss === 0 ? 100 : gain / loss;
    out.push({ time: candles[i].time, value: 100 - 100 / (1 + rs) });
  }
  return out;
}

/**
 * MACD — fast EMA, slow EMA, signal EMA of the MACD line.
 * Defaults: 12 / 26 / 9.
 */
export function macd(
  candles: Candle[],
  fast = 12,
  slow = 26,
  signal = 9,
): MACDPoint[] {
  if (candles.length < slow + signal) return [];
  const emaFast = ema(candles, fast);
  const emaSlow = ema(candles, slow);
  // align: emaSlow starts later
  const slowStartTime = emaSlow[0].time;
  const fastByTime = new Map(emaFast.map((p) => [p.time, p.value]));
  const macdLine: IndicatorPoint[] = [];
  for (const p of emaSlow) {
    const f = fastByTime.get(p.time);
    if (f !== undefined) macdLine.push({ time: p.time, value: f - p.value });
  }
  // signal = EMA of MACD line. Build synthetic candles for ema()
  const synth: Candle[] = macdLine.map((p) => ({
    time: p.time,
    open: p.value,
    high: p.value,
    low: p.value,
    close: p.value,
    volume: 0,
  }));
  const sig = ema(synth, signal);
  const sigByTime = new Map(sig.map((p) => [p.time, p.value]));
  const out: MACDPoint[] = [];
  for (const p of macdLine) {
    const s = sigByTime.get(p.time);
    if (s === undefined) continue;
    out.push({ time: p.time, macd: p.value, signal: s, histogram: p.value - s });
  }
  void slowStartTime;
  return out;
}

/**
 * ATR — Average True Range (Wilder smoothing).
 */
export function atr(candles: Candle[], period = 14): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length <= period) return out;
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr.push(candles[i].high - candles[i].low);
      continue;
    }
    const pc = candles[i - 1].close;
    tr.push(
      Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - pc),
        Math.abs(candles[i].low - pc),
      ),
    );
  }
  let prev = 0;
  for (let i = 1; i <= period; i++) prev += tr[i];
  prev /= period;
  out.push({ time: candles[period].time, value: prev });
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out.push({ time: candles[i].time, value: prev });
  }
  return out;
}

/**
 * OBV — On-Balance Volume (cumulative).
 */
export function obv(candles: Candle[]): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length === 0) return out;
  let acc = 0;
  out.push({ time: candles[0].time, value: 0 });
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) acc += candles[i].volume;
    else if (candles[i].close < candles[i - 1].close) acc -= candles[i].volume;
    out.push({ time: candles[i].time, value: acc });
  }
  return out;
}

export interface StochasticPoint {
  time: number;
  k: number;
  d: number;
}

/**
 * Stochastic oscillator — %K over kPeriod, %D = SMA(%K, dPeriod).
 */
export function stochastic(
  candles: Candle[],
  kPeriod = 14,
  dPeriod = 3,
): StochasticPoint[] {
  if (candles.length < kPeriod) return [];
  const kRaw: { time: number; value: number }[] = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    const range = hh - ll;
    const k = range === 0 ? 50 : ((candles[i].close - ll) / range) * 100;
    kRaw.push({ time: candles[i].time, value: k });
  }
  const out: StochasticPoint[] = [];
  for (let i = 0; i < kRaw.length; i++) {
    if (i < dPeriod - 1) continue;
    let sum = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) sum += kRaw[j].value;
    out.push({
      time: kRaw[i].time,
      k: kRaw[i].value,
      d: sum / dPeriod,
    });
  }
  return out;
}

/**
 * VWAP — Volume-Weighted Average Price.
 * Cumulative from the first candle, reset daily.
 * Each candle: typicalPrice = (high + low + close) / 3
 */
export function vwap(candles: Candle[]): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  let cumPV = 0;
  let cumV = 0;
  let prevDay = -1;
  for (const c of candles) {
    const day = Math.floor(c.time / 86400);
    if (day !== prevDay) {
      cumPV = 0;
      cumV = 0;
      prevDay = day;
    }
    const tp = (c.high + c.low + c.close) / 3;
    cumPV += tp * c.volume;
    cumV += c.volume;
    out.push({ time: c.time, value: cumV > 0 ? cumPV / cumV : c.close });
  }
  return out;
}

/**
 * Heikin Ashi candles — smoothed transformation of regular candles.
 * Formula:
 *  haClose = (O + H + L + C) / 4
 *  haOpen  = (prevHaOpen + prevHaClose) / 2  (first bar: (O + C) / 2)
 *  haHigh  = max(H, haOpen, haClose)
 *  haLow   = min(L, haOpen, haClose)
 */
export function heikinAshi(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    let haOpen: number;
    if (i === 0) {
      haOpen = (c.open + c.close) / 2;
    } else {
      const prev = out[i - 1];
      haOpen = (prev.open + prev.close) / 2;
    }
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    out.push({
      time: c.time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: c.volume,
      isFinal: c.isFinal,
    });
  }
  return out;
}

/**
 * Wave 16 — Renko chart.
 *
 * Cada brick es de tamaño `box` (en unidades de precio). Cuando el precio se
 * mueve `box` unidades en una dirección desde el último brick, se forma un
 * brick nuevo del mismo color. Para invertir hay que moverse `2*box` (anti-
 * tendencia primero llena el gap).
 *
 * Devolvemos "candles" sintéticas — open/close son los extremos del brick;
 * high/low duplican esos valores (los Renko no tienen mecha). El `time` se
 * mapea al timestamp original de la candle que terminó el brick.
 *
 * Si `box` es 0 o negativo, devuelve [] (sin crash).
 */
export function renko(candles: Candle[], box: number): Candle[] {
  if (candles.length === 0 || box <= 0) return [];
  const out: Candle[] = [];
  let lastClose = candles[0].close;
  // dir: +1 alcista, -1 bajista, 0 sin tendencia (al inicio)
  let dir: 0 | 1 | -1 = 0;
  for (const c of candles) {
    let price = c.close;
    // Mientras el delta exceda `box` (o 2*box si invertimos), formamos bricks
    while (true) {
      if (dir === 0) {
        const delta = price - lastClose;
        if (delta >= box) {
          out.push({
            time: c.time,
            open: lastClose,
            high: lastClose + box,
            low: lastClose,
            close: lastClose + box,
            volume: c.volume,
            isFinal: c.isFinal,
          });
          lastClose += box;
          dir = 1;
        } else if (delta <= -box) {
          out.push({
            time: c.time,
            open: lastClose,
            high: lastClose,
            low: lastClose - box,
            close: lastClose - box,
            volume: c.volume,
            isFinal: c.isFinal,
          });
          lastClose -= box;
          dir = -1;
        } else {
          break;
        }
      } else if (dir === 1) {
        if (price >= lastClose + box) {
          out.push({
            time: c.time,
            open: lastClose,
            high: lastClose + box,
            low: lastClose,
            close: lastClose + box,
            volume: c.volume,
            isFinal: c.isFinal,
          });
          lastClose += box;
        } else if (price <= lastClose - 2 * box) {
          // Inversión: primero "salta" el brick alcista anterior y forma uno bajista
          out.push({
            time: c.time,
            open: lastClose - box,
            high: lastClose - box,
            low: lastClose - 2 * box,
            close: lastClose - 2 * box,
            volume: c.volume,
            isFinal: c.isFinal,
          });
          lastClose -= 2 * box;
          dir = -1;
        } else {
          break;
        }
      } else {
        // dir === -1
        if (price <= lastClose - box) {
          out.push({
            time: c.time,
            open: lastClose,
            high: lastClose,
            low: lastClose - box,
            close: lastClose - box,
            volume: c.volume,
            isFinal: c.isFinal,
          });
          lastClose -= box;
        } else if (price >= lastClose + 2 * box) {
          out.push({
            time: c.time,
            open: lastClose + box,
            high: lastClose + 2 * box,
            low: lastClose + box,
            close: lastClose + 2 * box,
            volume: c.volume,
            isFinal: c.isFinal,
          });
          lastClose += 2 * box;
          dir = 1;
        } else {
          break;
        }
      }
    }
  }
  return out;
}

/**
 * Wave 16 — Line Break chart (3-line break por defecto).
 *
 * Un brick nuevo se forma cuando:
 *  - El precio supera el HIGH (close) de la última barra → brick alcista.
 *  - El precio rompe el LOW (close) de las últimas N barras anti-tendencia →
 *    brick bajista (reversal).
 * En tendencia normal sólo hay que superar el extremo anterior; para revertir
 * hay que romper el extremo de las N (3 por default) últimas barras.
 */
export function lineBreak(candles: Candle[], lines = 3): Candle[] {
  if (candles.length === 0) return [];
  const out: Candle[] = [];
  // Seed: primer "brick" con el primer precio
  out.push({
    time: candles[0].time,
    open: candles[0].open,
    high: Math.max(candles[0].open, candles[0].close),
    low: Math.min(candles[0].open, candles[0].close),
    close: candles[0].close,
    volume: candles[0].volume,
  });
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const last = out[out.length - 1];
    const lastIsUp = last.close >= last.open;
    // Para tendencia continuada: superar el extremo del último brick.
    // Para revertir: superar el extremo opuesto de los últimos `lines` bricks.
    const recent = out.slice(-lines);
    const recentHigh = Math.max(...recent.map((r) => Math.max(r.open, r.close)));
    const recentLow = Math.min(...recent.map((r) => Math.min(r.open, r.close)));
    if (lastIsUp) {
      if (c.close > last.close) {
        // continúa alcista
        out.push({
          time: c.time,
          open: last.close,
          high: c.close,
          low: last.close,
          close: c.close,
          volume: c.volume,
        });
      } else if (c.close < recentLow) {
        // reversal bajista (cerrar bajo el mín de los últimos N bricks)
        out.push({
          time: c.time,
          open: last.open,
          high: last.open,
          low: c.close,
          close: c.close,
          volume: c.volume,
        });
      }
      // sino: no hay brick nuevo
    } else {
      if (c.close < last.close) {
        // continúa bajista
        out.push({
          time: c.time,
          open: last.close,
          high: last.close,
          low: c.close,
          close: c.close,
          volume: c.volume,
        });
      } else if (c.close > recentHigh) {
        // reversal alcista
        out.push({
          time: c.time,
          open: last.open,
          high: c.close,
          low: last.open,
          close: c.close,
          volume: c.volume,
        });
      }
    }
  }
  return out;
}

// =========================================================================
// Biblioteca extendida — Batch 1: osciladores de sub-panel
// =========================================================================

/** CCI — Commodity Channel Index. */
export function cci(candles: Candle[], period = 20): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += tp[j];
    const mean = sum / period;
    let dev = 0;
    for (let j = i - period + 1; j <= i; j++) dev += Math.abs(tp[j] - mean);
    const meanDev = dev / period;
    const value = meanDev === 0 ? 0 : (tp[i] - mean) / (0.015 * meanDev);
    out.push({ time: candles[i].time, value });
  }
  return out;
}

/** Williams %R — rango -100..0. */
export function williamsR(candles: Candle[], period = 14): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  for (let i = period - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    const range = hh - ll;
    const value =
      range === 0 ? -50 : (-100 * (hh - candles[i].close)) / range;
    out.push({ time: candles[i].time, value });
  }
  return out;
}

/** MFI — Money Flow Index (RSI ponderado por volumen). */
export function mfi(candles: Candle[], period = 14): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period + 1) return out;
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const posMF: number[] = [0];
  const negMF: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const rmf = tp[i] * candles[i].volume;
    if (tp[i] > tp[i - 1]) {
      posMF.push(rmf);
      negMF.push(0);
    } else if (tp[i] < tp[i - 1]) {
      posMF.push(0);
      negMF.push(rmf);
    } else {
      posMF.push(0);
      negMF.push(0);
    }
  }
  for (let i = period; i < candles.length; i++) {
    let pos = 0;
    let neg = 0;
    for (let j = i - period + 1; j <= i; j++) {
      pos += posMF[j];
      neg += negMF[j];
    }
    const value = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
    out.push({ time: candles[i].time, value });
  }
  return out;
}

export interface ADXPoint {
  time: number;
  adx: number;
  plusDI: number;
  minusDI: number;
}

/** ADX/DMI — suavizado Wilder, igual que TradingView. */
export function adx(candles: Candle[], period = 14): ADXPoint[] {
  const out: ADXPoint[] = [];
  if (candles.length < period * 2 + 1) return out;
  const tr: number[] = [0];
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    const pc = candles[i - 1].close;
    tr.push(
      Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - pc),
        Math.abs(candles[i].low - pc),
      ),
    );
  }
  let trS = 0;
  let pdmS = 0;
  let mdmS = 0;
  for (let i = 1; i <= period; i++) {
    trS += tr[i];
    pdmS += plusDM[i];
    mdmS += minusDM[i];
  }
  const dxArr: { time: number; dx: number; pdi: number; mdi: number }[] = [];
  for (let i = period + 1; i < candles.length; i++) {
    trS = trS - trS / period + tr[i];
    pdmS = pdmS - pdmS / period + plusDM[i];
    mdmS = mdmS - mdmS / period + minusDM[i];
    const pdi = trS === 0 ? 0 : (100 * pdmS) / trS;
    const mdi = trS === 0 ? 0 : (100 * mdmS) / trS;
    const sum = pdi + mdi;
    const dx = sum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / sum;
    dxArr.push({ time: candles[i].time, dx, pdi, mdi });
  }
  if (dxArr.length < period) return out;
  let adxVal = 0;
  for (let i = 0; i < period; i++) adxVal += dxArr[i].dx;
  adxVal /= period;
  out.push({
    time: dxArr[period - 1].time,
    adx: adxVal,
    plusDI: dxArr[period - 1].pdi,
    minusDI: dxArr[period - 1].mdi,
  });
  for (let i = period; i < dxArr.length; i++) {
    adxVal = (adxVal * (period - 1) + dxArr[i].dx) / period;
    out.push({
      time: dxArr[i].time,
      adx: adxVal,
      plusDI: dxArr[i].pdi,
      minusDI: dxArr[i].mdi,
    });
  }
  return out;
}

export interface StochRsiPoint {
  time: number;
  k: number;
  d: number;
}

/** Stochastic RSI — estocástico aplicado sobre la serie de RSI. */
export function stochRsi(
  candles: Candle[],
  rsiPeriod = 14,
  stochPeriod = 14,
  kSmooth = 3,
  dSmooth = 3,
): StochRsiPoint[] {
  const rsiArr = rsi(candles, rsiPeriod);
  if (rsiArr.length < stochPeriod) return [];
  const raw: { time: number; value: number }[] = [];
  for (let i = stochPeriod - 1; i < rsiArr.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - stochPeriod + 1; j <= i; j++) {
      if (rsiArr[j].value > hh) hh = rsiArr[j].value;
      if (rsiArr[j].value < ll) ll = rsiArr[j].value;
    }
    const range = hh - ll;
    raw.push({
      time: rsiArr[i].time,
      value: range === 0 ? 0 : ((rsiArr[i].value - ll) / range) * 100,
    });
  }
  const kArr: { time: number; value: number }[] = [];
  for (let i = kSmooth - 1; i < raw.length; i++) {
    let s = 0;
    for (let j = i - kSmooth + 1; j <= i; j++) s += raw[j].value;
    kArr.push({ time: raw[i].time, value: s / kSmooth });
  }
  const out: StochRsiPoint[] = [];
  for (let i = dSmooth - 1; i < kArr.length; i++) {
    let s = 0;
    for (let j = i - dSmooth + 1; j <= i; j++) s += kArr[j].value;
    out.push({ time: kArr[i].time, k: kArr[i].value, d: s / dSmooth });
  }
  return out;
}

/** Awesome Oscillator — SMA(median,5) − SMA(median,34). */
export function awesomeOscillator(
  candles: Candle[],
  fast = 5,
  slow = 34,
): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < slow) return out;
  const median = candles.map((c) => (c.high + c.low) / 2);
  const smaAt = (p: number, idx: number) => {
    let s = 0;
    for (let j = idx - p + 1; j <= idx; j++) s += median[j];
    return s / p;
  };
  for (let i = slow - 1; i < candles.length; i++) {
    out.push({ time: candles[i].time, value: smaAt(fast, i) - smaAt(slow, i) });
  }
  return out;
}

// =========================================================================
// Biblioteca extendida — Batch 2: overlays de canal / tendencia
// =========================================================================

export interface ChannelPoint {
  time: number;
  upper: number;
  mid: number;
  lower: number;
}

/** Donchian Channels — máximo/mínimo de N velas. */
export function donchian(candles: Candle[], period = 20): ChannelPoint[] {
  const out: ChannelPoint[] = [];
  if (candles.length < period) return out;
  for (let i = period - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    out.push({
      time: candles[i].time,
      upper: hh,
      lower: ll,
      mid: (hh + ll) / 2,
    });
  }
  return out;
}

/** Keltner Channels — EMA ± multiplicador × ATR. */
export function keltner(
  candles: Candle[],
  emaPeriod = 20,
  atrPeriod = 10,
  mult = 2,
): ChannelPoint[] {
  const emaArr = ema(candles, emaPeriod);
  const atrArr = atr(candles, atrPeriod);
  const atrMap = new Map(atrArr.map((p) => [p.time, p.value]));
  const out: ChannelPoint[] = [];
  for (const e of emaArr) {
    const a = atrMap.get(e.time);
    if (a === undefined) continue;
    out.push({
      time: e.time,
      mid: e.value,
      upper: e.value + mult * a,
      lower: e.value - mult * a,
    });
  }
  return out;
}

export interface SupertrendPoint {
  time: number;
  value: number;
  trend: "up" | "down";
}

/** Supertrend — banda ATR con "trabado", algoritmo canónico. */
export function supertrend(
  candles: Candle[],
  atrPeriod = 10,
  mult = 3,
): SupertrendPoint[] {
  const atrArr = atr(candles, atrPeriod);
  if (atrArr.length === 0) return [];
  const atrMap = new Map(atrArr.map((p) => [p.time, p.value]));
  const out: SupertrendPoint[] = [];
  let prevFU = 0;
  let prevFL = 0;
  let prevST = 0;
  let prevClose = 0;
  let started = false;
  for (let i = 0; i < candles.length; i++) {
    const a = atrMap.get(candles[i].time);
    if (a === undefined) continue;
    const hl2 = (candles[i].high + candles[i].low) / 2;
    const basicUpper = hl2 + mult * a;
    const basicLower = hl2 - mult * a;
    if (!started) {
      out.push({ time: candles[i].time, value: basicLower, trend: "up" });
      prevFU = basicUpper;
      prevFL = basicLower;
      prevST = basicLower;
      prevClose = candles[i].close;
      started = true;
      continue;
    }
    const fu =
      basicUpper < prevFU || prevClose > prevFU ? basicUpper : prevFU;
    const fl =
      basicLower > prevFL || prevClose < prevFL ? basicLower : prevFL;
    let st: number;
    if (prevST === prevFU) {
      st = candles[i].close <= fu ? fu : fl;
    } else {
      st = candles[i].close >= fl ? fl : fu;
    }
    const trend: "up" | "down" = st === fu ? "down" : "up";
    out.push({ time: candles[i].time, value: st, trend });
    prevFU = fu;
    prevFL = fl;
    prevST = st;
    prevClose = candles[i].close;
  }
  return out;
}

// =========================================================================
// Biblioteca extendida — Batch 3: PSAR / Pivots / Ichimoku
// =========================================================================

/** Parabolic SAR — algoritmo de Wilder. Devuelve un punto por vela (dots). */
export function parabolicSar(
  candles: Candle[],
  step = 0.02,
  max = 0.2,
): IndicatorPoint[] {
  if (candles.length < 2) return [];
  const out: IndicatorPoint[] = [];
  let trendUp = candles[1].close >= candles[0].close;
  let af = step;
  let ep = trendUp ? candles[0].high : candles[0].low;
  let sar = trendUp ? candles[0].low : candles[0].high;
  out.push({ time: candles[0].time, value: sar });
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    let newSar = sar + af * (ep - sar);
    const prevLow1 = candles[i - 1].low;
    const prevLow2 = candles[Math.max(0, i - 2)].low;
    const prevHigh1 = candles[i - 1].high;
    const prevHigh2 = candles[Math.max(0, i - 2)].high;
    if (trendUp) {
      newSar = Math.min(newSar, prevLow1, prevLow2);
      if (l < newSar) {
        trendUp = false;
        newSar = ep;
        ep = l;
        af = step;
      } else if (h > ep) {
        ep = h;
        af = Math.min(af + step, max);
      }
    } else {
      newSar = Math.max(newSar, prevHigh1, prevHigh2);
      if (h > newSar) {
        trendUp = true;
        newSar = ep;
        ep = h;
        af = step;
      } else if (l < ep) {
        ep = l;
        af = Math.min(af + step, max);
      }
    }
    sar = newSar;
    out.push({ time: candles[i].time, value: sar });
  }
  return out;
}

export interface PivotLevels {
  p: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}

/** Pivot Points Standard — calculados de la HLC del último día completo. */
export function pivotPoints(candles: Candle[]): PivotLevels | null {
  if (candles.length < 2) return null;
  const dayKey = (t: number) =>
    new Date(t * 1000).toISOString().slice(0, 10);
  const lastDay = dayKey(candles[candles.length - 1].time);
  let targetDay: string | null = null;
  for (let i = candles.length - 1; i >= 0; i--) {
    const d = dayKey(candles[i].time);
    if (d !== lastDay) {
      targetDay = d;
      break;
    }
  }
  if (!targetDay) return null;
  let h = -Infinity;
  let l = Infinity;
  let c = 0;
  let found = false;
  for (const cd of candles) {
    if (dayKey(cd.time) === targetDay) {
      h = Math.max(h, cd.high);
      l = Math.min(l, cd.low);
      c = cd.close;
      found = true;
    }
  }
  if (!found) return null;
  const p = (h + l + c) / 3;
  return {
    p,
    r1: 2 * p - l,
    s1: 2 * p - h,
    r2: p + (h - l),
    s2: p - (h - l),
    r3: h + 2 * (p - l),
    s3: l - 2 * (h - p),
  };
}

export interface IchimokuPoint {
  time: number;
  tenkan: number | null;
  kijun: number | null;
  senkouA: number | null;
  senkouB: number | null;
  chikou: number | null;
}

/** Ichimoku Kinko Hyo — 5 líneas con desplazamiento (cloud no rellenada). */
export function ichimoku(
  candles: Candle[],
  tenkanP = 9,
  kijunP = 26,
  senkouBP = 52,
  displacement = 26,
): IchimokuPoint[] {
  const hh = (p: number, i: number) => {
    let m = -Infinity;
    for (let j = i - p + 1; j <= i; j++) m = Math.max(m, candles[j].high);
    return m;
  };
  const ll = (p: number, i: number) => {
    let m = Infinity;
    for (let j = i - p + 1; j <= i; j++) m = Math.min(m, candles[j].low);
    return m;
  };
  const tenkan: (number | null)[] = [];
  const kijun: (number | null)[] = [];
  const senkB: (number | null)[] = [];
  for (let i = 0; i < candles.length; i++) {
    tenkan.push(
      i >= tenkanP - 1 ? (hh(tenkanP, i) + ll(tenkanP, i)) / 2 : null,
    );
    kijun.push(i >= kijunP - 1 ? (hh(kijunP, i) + ll(kijunP, i)) / 2 : null);
    senkB.push(
      i >= senkouBP - 1 ? (hh(senkouBP, i) + ll(senkouBP, i)) / 2 : null,
    );
  }
  const senkA: (number | null)[] = [];
  for (let i = 0; i < candles.length; i++) {
    senkA.push(
      tenkan[i] != null && kijun[i] != null
        ? (tenkan[i]! + kijun[i]!) / 2
        : null,
    );
  }
  const out: IchimokuPoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    out.push({
      time: candles[i].time,
      tenkan: tenkan[i],
      kijun: kijun[i],
      // Senkou se proyecta +displacement: en el índice i mostramos el valor
      // calculado displacement velas atrás (lo que normalmente caería acá).
      senkouA: i >= displacement ? senkA[i - displacement] : null,
      senkouB: i >= displacement ? senkB[i - displacement] : null,
      // Chikou = close desplazado -displacement.
      chikou:
        i + displacement < candles.length
          ? candles[i + displacement].close
          : null,
    });
  }
  return out;
}

// =========================================================================
// Volume Profile — histograma de volumen por nivel de precio
// =========================================================================

export interface VolumeProfileBin {
  low: number;
  high: number;
  volume: number;
}

export interface VolumeProfileResult {
  bins: VolumeProfileBin[];
  /** Precio del Point of Control (bin de mayor volumen). */
  poc: number;
  /** Límites del Value Area (~70% del volumen alrededor del POC). */
  vaHigh: number;
  vaLow: number;
  maxVolume: number;
  totalVolume: number;
}

/**
 * Volume Profile — reparte el volumen de cada vela entre los bins de precio
 * que abarca su rango [low, high]. Devuelve POC y Value Area.
 */
export function volumeProfile(
  candles: Candle[],
  binCount = 24,
): VolumeProfileResult | null {
  if (candles.length === 0 || binCount < 2) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of candles) {
    if (c.low < lo) lo = c.low;
    if (c.high > hi) hi = c.high;
  }
  if (!isFinite(lo) || !isFinite(hi) || hi <= lo) return null;
  const binSize = (hi - lo) / binCount;
  const bins: VolumeProfileBin[] = [];
  for (let i = 0; i < binCount; i++) {
    bins.push({ low: lo + i * binSize, high: lo + (i + 1) * binSize, volume: 0 });
  }
  for (const c of candles) {
    const firstBin = Math.max(0, Math.floor((c.low - lo) / binSize));
    const lastBin = Math.min(
      binCount - 1,
      Math.floor((c.high - lo) / binSize),
    );
    const nBins = lastBin - firstBin + 1;
    const volPerBin = c.volume / nBins;
    for (let b = firstBin; b <= lastBin; b++) bins[b].volume += volPerBin;
  }
  let pocIdx = 0;
  let maxVolume = 0;
  for (let i = 0; i < bins.length; i++) {
    if (bins[i].volume > maxVolume) {
      maxVolume = bins[i].volume;
      pocIdx = i;
    }
  }
  const totalVolume = bins.reduce((s, b) => s + b.volume, 0);
  // Value Area: expandir desde el POC hasta cubrir ~70% del volumen.
  let vaVol = bins[pocIdx].volume;
  let loIdx = pocIdx;
  let hiIdx = pocIdx;
  const target = totalVolume * 0.7;
  while (vaVol < target && (loIdx > 0 || hiIdx < bins.length - 1)) {
    const belowVol = loIdx > 0 ? bins[loIdx - 1].volume : -1;
    const aboveVol = hiIdx < bins.length - 1 ? bins[hiIdx + 1].volume : -1;
    if (aboveVol >= belowVol) {
      hiIdx++;
      vaVol += bins[hiIdx].volume;
    } else {
      loIdx--;
      vaVol += bins[loIdx].volume;
    }
  }
  return {
    bins,
    poc: (bins[pocIdx].low + bins[pocIdx].high) / 2,
    vaHigh: bins[hiIdx].high,
    vaLow: bins[loIdx].low,
    maxVolume,
    totalVolume,
  };
}
