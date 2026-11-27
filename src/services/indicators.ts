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
