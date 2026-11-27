import type { Candle, MtfTrendItem, TechnicalBias, TechnicalSummary } from '../types';

export interface SeriesPoint {
  time: number;
  value: number;
}

export function calculateEMA(candles: Candle[], period: number): SeriesPoint[] {
  if (candles.length < period) return [];
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  let ema = sum / period;
  const result: SeriesPoint[] = [{ time: candles[period - 1].time, value: ema }];

  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
    result.push({ time: candles[i].time, value: ema });
  }
  return result;
}

export function calculateRSI(candles: Candle[], period = 14): SeriesPoint[] {
  if (candles.length <= period) return [];
  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gainSum += diff;
    else lossSum += Math.abs(diff);
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  const toRsi = (g: number, l: number): number => {
    if (l === 0) return 100;
    const rs = g / l;
    return 100 - 100 / (1 + rs);
  };

  const result: SeriesPoint[] = [
    { time: candles[period].time, value: Number(toRsi(avgGain, avgLoss).toFixed(2)) },
  ];

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result.push({ time: candles[i].time, value: Number(toRsi(avgGain, avgLoss).toFixed(2)) });
  }

  return result;
}

export function calculateATR(candles: Candle[], period = 14): SeriesPoint[] {
  if (candles.length <= period) return [];
  const trueRanges: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i];
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prevClose),
      Math.abs(cur.low - prevClose),
    );
    trueRanges.push(tr);
  }

  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result: SeriesPoint[] = [{ time: candles[period].time, value: atr }];

  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    result.push({ time: candles[i + 1].time, value: atr });
  }

  return result;
}

export function detectSupportResistance(
  candles: Candle[],
): { supports: number[]; resistances: number[] } {
  if (candles.length < 20) return { supports: [], resistances: [] };
  const recent = candles.slice(-140);
  const currentPrice = recent[recent.length - 1].close;
  const pivotHighs: number[] = [];
  const pivotLows: number[] = [];

  const lookback = 4;
  for (let i = lookback; i < recent.length - lookback; i++) {
    const h = recent[i].high;
    const l = recent[i].low;
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (recent[j].high >= h) isHigh = false;
      if (recent[j].low <= l) isLow = false;
    }
    if (isHigh) pivotHighs.push(h);
    if (isLow) pivotLows.push(l);
  }

  const clusterLevels = (levels: number[], tolerancePct = 0.014): number[] => {
    const sorted = [...levels].sort((a, b) => a - b);
    const clusters: number[][] = [];
    for (const lv of sorted) {
      const last = clusters[clusters.length - 1];
      if (!last || Math.abs(lv - last[0]) / Math.max(last[0], 1e-9) > tolerancePct) {
        clusters.push([lv]);
      } else {
        last.push(lv);
      }
    }
    return clusters
      .sort((a, b) => b.length - a.length)
      .map((c) => c.reduce((s, v) => s + v, 0) / c.length);
  };

  const supports = clusterLevels(pivotLows.filter((p) => p < currentPrice * 0.996))
    .sort((a, b) => b - a)
    .slice(0, 3);

  const resistances = clusterLevels(pivotHighs.filter((p) => p > currentPrice * 1.004))
    .sort((a, b) => a - b)
    .slice(0, 3);

  // Ensure at least 2 fallback S/R levels derived from recent range if pivots sparse
  const recentLow = Math.min(...recent.slice(-40).map((c) => c.low));
  const recentHigh = Math.max(...recent.slice(-40).map((c) => c.high));

  if (supports.length === 0) {
    supports.push(Number((Math.min(recentLow, currentPrice * 0.965)).toPrecision(6)));
    supports.push(Number((currentPrice * 0.92).toPrecision(6)));
  }
  if (resistances.length === 0) {
    resistances.push(Number((Math.max(recentHigh, currentPrice * 1.035)).toPrecision(6)));
    resistances.push(Number((currentPrice * 1.08).toPrecision(6)));
  }

  return { supports, resistances };
}

export function buildTechnicalSummary(candles: Candle[]): TechnicalSummary {
  if (candles.length < 30) {
    const lastPrice = candles[candles.length - 1]?.close ?? 0;
    return {
      bias: 'Neutral',
      score: 0,
      patterns: ['Menunggu data candle cukup'],
      supports: lastPrice ? [lastPrice * 0.96] : [],
      resistances: lastPrice ? [lastPrice * 1.04] : [],
      ema20: lastPrice,
      ema50: lastPrice,
      ema200: lastPrice,
      rsi14: 50,
      atr14: lastPrice * 0.015,
    };
  }

  const last = candles[candles.length - 1];
  const ema20Arr = calculateEMA(candles, 20);
  const ema50Arr = calculateEMA(candles, 50);
  const ema200Arr = calculateEMA(candles, Math.min(200, candles.length - 1));
  const rsiArr = calculateRSI(candles, 14);
  const atrArr = calculateATR(candles, 14);

  const ema20 = ema20Arr[ema20Arr.length - 1]?.value ?? last.close;
  const ema50 = ema50Arr[ema50Arr.length - 1]?.value ?? last.close;
  const ema200 = ema200Arr[ema200Arr.length - 1]?.value ?? ema50;
  const rsi14 = rsiArr[rsiArr.length - 1]?.value ?? 50;
  const atr14 = atrArr[atrArr.length - 1]?.value ?? last.close * 0.015;

  const { supports, resistances } = detectSupportResistance(candles);

  let score = 0;
  if (last.close > ema20) score += 20;
  else score -= 20;

  if (last.close > ema50) score += 20;
  else score -= 20;

  if (last.close > ema200) score += 15;
  else score -= 15;

  if (ema20 > ema50) score += 18;
  else score -= 18;

  if (rsi14 >= 55 && rsi14 <= 72) score += 15;
  else if (rsi14 < 30) score += 12; // Oversold bounce zone
  else if (rsi14 > 78) score -= 12; // Overextended
  else if (rsi14 < 45) score -= 15;

  // Momentum over last 10 bars
  const prev10 = candles[Math.max(0, candles.length - 11)].close;
  const momPct = ((last.close - prev10) / Math.max(prev10, 1e-9)) * 100;
  if (momPct > 1.5) score += 12;
  else if (momPct < -1.5) score -= 12;

  score = Math.max(-100, Math.min(100, Math.round(score)));

  let bias: TechnicalBias = 'Neutral';
  if (score >= 55) bias = 'Strong Buy';
  else if (score >= 18) bias = 'Buy';
  else if (score <= -55) bias = 'Strong Sell';
  else if (score <= -18) bias = 'Sell';

  // Detect chart patterns
  const patterns: string[] = [];
  if (ema20 > ema50 && ema50 > ema200) {
    patterns.push('Bullish EMA Ribbon Alignment (20 > 50 > 200)');
  } else if (ema20 < ema50 && ema50 < ema200) {
    patterns.push('Bearish EMA Ribbon Alignment (20 < 50 < 200)');
  }

  const nearRes = resistances[0];
  const nearSup = supports[0];
  if (nearRes && (nearRes - last.close) / last.close < 0.015) {
    patterns.push('Testing Key Resistance (Breakout Watch)');
  }
  if (nearSup && (last.close - nearSup) / last.close < 0.015) {
    patterns.push('Retesting Key Support Zone');
  }

  if (rsi14 < 32) {
    patterns.push('RSI Oversold Reversal Zone (<32)');
  } else if (rsi14 > 70) {
    patterns.push('RSI Overbought — Waspada Pullback');
  }

  // Higher highs / lower lows check over last 24 bars
  const seg = candles.slice(-24);
  const firstHalfHigh = Math.max(...seg.slice(0, 12).map((c) => c.high));
  const secondHalfHigh = Math.max(...seg.slice(12).map((c) => c.high));
  const firstHalfLow = Math.min(...seg.slice(0, 12).map((c) => c.low));
  const secondHalfLow = Math.min(...seg.slice(12).map((c) => c.low));

  if (secondHalfHigh > firstHalfHigh && secondHalfLow > firstHalfLow) {
    patterns.push('Struktur Higher High & Higher Low');
  } else if (secondHalfHigh < firstHalfHigh && secondHalfLow < firstHalfLow) {
    patterns.push('Struktur Lower High & Lower Low');
  } else if (secondHalfHigh < firstHalfHigh && secondHalfLow > firstHalfLow) {
    patterns.push('Symmetrical Triangle / Volatility Squeeze');
  }

  if (patterns.length === 0) {
    patterns.push('Konsolidasi Range Netral');
  }

  return {
    bias,
    score,
    patterns: patterns.slice(0, 3),
    supports,
    resistances,
    ema20,
    ema50,
    ema200,
    rsi14,
    atr14,
  };
}

export function evaluateSingleTimeframeTrend(
  candles: Candle[],
  timeframe: '15m' | '1h' | '4h' | '1d',
): MtfTrendItem {
  if (candles.length < 30) {
    return { timeframe, trend: 'Sideways', rsi: 50, emaAlignment: 'EMA Netral' };
  }
  const summary = buildTechnicalSummary(candles);
  const lastClose = candles[candles.length - 1].close;

  let trend: 'Bullish' | 'Bearish' | 'Sideways' = 'Sideways';
  if (summary.score >= 22) trend = 'Bullish';
  else if (summary.score <= -22) trend = 'Bearish';

  const emaAlignment =
    lastClose > summary.ema20 && summary.ema20 > summary.ema50
      ? 'Harga > EMA20 > EMA50'
      : lastClose < summary.ema20 && summary.ema20 < summary.ema50
        ? 'Harga < EMA20 < EMA50'
        : 'EMA Konsolidasi';

  return {
    timeframe,
    trend,
    rsi: Number(summary.rsi14.toFixed(1)),
    emaAlignment,
  };
}

export interface MacdPoint {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
}

export function calculateMACD(
  candles: Candle[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MacdPoint[] {
  if (candles.length < slowPeriod + signalPeriod) return [];
  const fastEma = calculateEMA(candles, fastPeriod);
  const slowEma = calculateEMA(candles, slowPeriod);
  const fastMap = new Map(fastEma.map((p) => [p.time, p.value]));

  const macdRaw: Array<{ time: number; value: number }> = [];
  for (const s of slowEma) {
    const f = fastMap.get(s.time);
    if (f !== undefined) {
      macdRaw.push({ time: s.time, value: f - s.value });
    }
  }
  if (macdRaw.length < signalPeriod) return [];

  const k = 2 / (signalPeriod + 1);
  let signalEma =
    macdRaw.slice(0, signalPeriod).reduce((acc, p) => acc + p.value, 0) / signalPeriod;

  const result: MacdPoint[] = [
    {
      time: macdRaw[signalPeriod - 1].time,
      macd: macdRaw[signalPeriod - 1].value,
      signal: signalEma,
      histogram: macdRaw[signalPeriod - 1].value - signalEma,
    },
  ];

  for (let i = signalPeriod; i < macdRaw.length; i++) {
    signalEma = macdRaw[i].value * k + signalEma * (1 - k);
    result.push({
      time: macdRaw[i].time,
      macd: macdRaw[i].value,
      signal: signalEma,
      histogram: macdRaw[i].value - signalEma,
    });
  }
  return result;
}

export interface AdxResult {
  adx: number;
  plusDI: number;
  minusDI: number;
}

export function calculateADX(candles: Candle[], period = 14): AdxResult {
  if (candles.length <= period * 2) {
    return { adx: 18, plusDI: 20, minusDI: 20 };
  }

  const trList: number[] = [];
  const plusDmList: number[] = [];
  const minusDmList: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;
    const plusDM = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDM = downMove > upMove && downMove > 0 ? downMove : 0;
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close),
    );
    trList.push(tr);
    plusDmList.push(plusDM);
    minusDmList.push(minusDM);
  }

  let smoothTR = trList.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothPlus = plusDmList.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinus = minusDmList.slice(0, period).reduce((a, b) => a + b, 0);

  const dxValues: number[] = [];
  let lastPlusDI = 20;
  let lastMinusDI = 20;

  for (let i = period; i < trList.length; i++) {
    smoothTR = smoothTR - smoothTR / period + trList[i];
    smoothPlus = smoothPlus - smoothPlus / period + plusDmList[i];
    smoothMinus = smoothMinus - smoothMinus / period + minusDmList[i];

    const plusDI = smoothTR > 0 ? (smoothPlus / smoothTR) * 100 : 0;
    const minusDI = smoothTR > 0 ? (smoothMinus / smoothTR) * 100 : 0;
    const denom = plusDI + minusDI;
    const dx = denom > 0 ? (Math.abs(plusDI - minusDI) / denom) * 100 : 0;
    dxValues.push(dx);
    lastPlusDI = plusDI;
    lastMinusDI = minusDI;
  }

  if (dxValues.length < period) {
    return { adx: 18, plusDI: Number(lastPlusDI.toFixed(1)), minusDI: Number(lastMinusDI.toFixed(1)) };
  }

  let adx = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i]) / period;
  }

  return {
    adx: Number(adx.toFixed(1)),
    plusDI: Number(lastPlusDI.toFixed(1)),
    minusDI: Number(lastMinusDI.toFixed(1)),
  };
}

export function calculateRollingVWAP(candles: Candle[], lookback = 24): number {
  if (candles.length === 0) return 0;
  const slice = candles.slice(-lookback);
  let pvSum = 0;
  let volSum = 0;
  for (const c of slice) {
    const typical = (c.high + c.low + c.close) / 3;
    pvSum += typical * c.volume;
    volSum += c.volume;
  }
  return volSum > 0 ? pvSum / volSum : slice[slice.length - 1].close;
}

export interface BollingerBandSnapshot {
  upper: number;
  middle: number;
  lower: number;
  bandwidthPercent: number;
  percentB: number; // 0 = lower band, 0.5 = middle, 1 = upper band
}

export function calculateBollingerBands(
  candles: Candle[],
  period = 20,
  stdDevMul = 2,
): BollingerBandSnapshot {
  const slice = candles.slice(-period);
  if (slice.length === 0) {
    return { upper: 0, middle: 0, lower: 0, bandwidthPercent: 0, percentB: 0.5 };
  }
  const closes = slice.map((c) => c.close);
  const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
  const variance = closes.reduce((acc, v) => acc + (v - mean) ** 2, 0) / closes.length;
  const std = Math.sqrt(variance);
  const upper = mean + stdDevMul * std;
  const lower = mean - stdDevMul * std;
  const lastClose = closes[closes.length - 1];
  const bandwidthPercent = mean > 0 ? ((upper - lower) / mean) * 100 : 0;
  const percentB = upper > lower ? (lastClose - lower) / (upper - lower) : 0.5;

  return {
    upper,
    middle: mean,
    lower,
    bandwidthPercent: Number(bandwidthPercent.toFixed(2)),
    percentB: Number(percentB.toFixed(2)),
  };
}

export function calculateCandleVolumeRatio(candles: Candle[], lookback = 20): number {
  if (candles.length < lookback + 1) return 1;
  const target = candles[candles.length - 1];
  const prev = candles.slice(-(lookback + 1), -1);
  const avgVol = prev.reduce((acc, c) => acc + c.volume, 0) / Math.max(prev.length, 1);
  if (avgVol <= 0) return 1;
  return Number((target.volume / avgVol).toFixed(2));
}

export interface MarketStructureResult {
  structure: 'UPTREND_HH_HL' | 'DOWNTREND_LH_LL' | 'SQUEEZE' | 'RANGE';
  recentHigh: number;
  recentLow: number;
  bosBullish: boolean;
  bosBearish: boolean;
}

export function detectMarketStructure(candles: Candle[]): MarketStructureResult {
  if (candles.length < 24) {
    const close = candles[candles.length - 1]?.close ?? 0;
    return {
      structure: 'RANGE',
      recentHigh: close,
      recentLow: close,
      bosBullish: false,
      bosBearish: false,
    };
  }
  const seg = candles.slice(-25);
  const prev20 = seg.slice(0, 20);
  const firstHalf = seg.slice(0, 12);
  const secondHalf = seg.slice(12, 24);
  const lastBar = seg[seg.length - 1];

  const h1 = Math.max(...firstHalf.map((c) => c.high));
  const h2 = Math.max(...secondHalf.map((c) => c.high));
  const l1 = Math.min(...firstHalf.map((c) => c.low));
  const l2 = Math.min(...secondHalf.map((c) => c.low));

  const recentHigh = Math.max(...prev20.map((c) => c.high));
  const recentLow = Math.min(...prev20.map((c) => c.low));

  let structure: MarketStructureResult['structure'] = 'RANGE';
  if (h2 > h1 && l2 > l1) structure = 'UPTREND_HH_HL';
  else if (h2 < h1 && l2 < l1) structure = 'DOWNTREND_LH_LL';
  else if (h2 < h1 && l2 > l1) structure = 'SQUEEZE';

  return {
    structure,
    recentHigh,
    recentLow,
    bosBullish: lastBar.close > recentHigh,
    bosBearish: lastBar.close < recentLow,
  };
}

export function detectRsiDivergence(
  candles: Candle[],
  rsiSeries: SeriesPoint[],
): 'BULLISH' | 'BEARISH' | 'NONE' {
  if (candles.length < 30 || rsiSeries.length < 25) return 'NONE';
  const rsiMap = new Map(rsiSeries.map((p) => [p.time, p.value]));
  const seg = candles.slice(-26);
  const first = seg.slice(0, 13);
  const second = seg.slice(13);

  // Find swing low in each half for bullish divergence
  let low1 = first[0];
  for (const c of first) if (c.low < low1.low) low1 = c;
  let low2 = second[0];
  for (const c of second) if (c.low < low2.low) low2 = c;

  const rsiLow1 = rsiMap.get(low1.time);
  const rsiLow2 = rsiMap.get(low2.time);
  if (
    rsiLow1 !== undefined &&
    rsiLow2 !== undefined &&
    low2.low < low1.low * 0.998 &&
    rsiLow2 > rsiLow1 + 2.5 &&
    rsiLow1 < 42
  ) {
    return 'BULLISH';
  }

  // Find swing high in each half for bearish divergence
  let high1 = first[0];
  for (const c of first) if (c.high > high1.high) high1 = c;
  let high2 = second[0];
  for (const c of second) if (c.high > high2.high) high2 = c;

  const rsiHigh1 = rsiMap.get(high1.time);
  const rsiHigh2 = rsiMap.get(high2.time);
  if (
    rsiHigh1 !== undefined &&
    rsiHigh2 !== undefined &&
    high2.high > high1.high * 1.002 &&
    rsiHigh2 < rsiHigh1 - 2.5 &&
    rsiHigh1 > 58
  ) {
    return 'BEARISH';
  }

  return 'NONE';
}
