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
