import type {
  BacktestResult,
  BacktestStrategyId,
  Candle,
  Timeframe,
  TradeDirection,
} from '../types';
import { runBacktest } from './backtestEngine';
import {
  calculateADX,
  calculateATR,
  calculateBollingerBands,
  calculateCandleVolumeRatio,
  calculateEMA,
  calculateMACD,
  calculateRSI,
  calculateRollingVWAP,
  detectMarketStructure,
  detectRsiDivergence,
  detectSupportResistance,
  evaluateSingleTimeframeTrend,
} from './indicators';

export function getHigherTimeframeForSetup(tf: Timeframe): '15m' | '1h' | '4h' | '1d' {
  if (tf === '5m') return '15m';
  if (tf === '15m') return '1h';
  if (tf === '1h') return '4h';
  return '1d';
}

export interface SmartFuturesLevels {
  direction: TradeDirection;
  entry1: number;
  entry2: number;
  entry3: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  recommendedLeverage: number;
  atrValue: number;
  slBasisLabel: string;
}

export interface FuturesSetupReadiness {
  readinessScore: number; // 0-100
  readinessGrade: 'A+' | 'A' | 'B' | 'C' | 'D';
  recommendedDirection: TradeDirection;
  htfTrend: 'Bullish' | 'Bearish' | 'Sideways';
  btcHtfTrend: 'Bullish' | 'Bearish' | 'Sideways';
  rsi14: number;
  adx14: number;
  volumeRatio: number;
  atr14: number;
  ema20: number;
  ema50: number;
  vwap: number;
  divergence: 'BULLISH' | 'BEARISH' | 'NONE';
  structureLabel: string;
  autoChecklist: string[];
  strengths: string[];
  warnings: string[];
  smartLevels: SmartFuturesLevels;
}

function roundPrice(p: number): number {
  if (!Number.isFinite(p) || p <= 0) return 0;
  return Number(p.toPrecision(6));
}

export function buildSmartFuturesLevels(
  closedCandles: Candle[],
  livePrice: number,
  direction: TradeDirection,
  atrMultiplier = 1.5,
): SmartFuturesLevels {
  const safePrice = Math.max(livePrice, 1e-8);
  const atrArr = calculateATR(closedCandles, 14);
  const ema20Arr = calculateEMA(closedCandles, 20);
  const vwap = calculateRollingVWAP(closedCandles, 24);
  const { supports, resistances } = detectSupportResistance(closedCandles);

  const atr = atrArr[atrArr.length - 1]?.value ?? safePrice * 0.015;
  const ema20 = ema20Arr[ema20Arr.length - 1]?.value ?? safePrice;
  const isLong = direction === 'LONG';

  // Build realistic pullback layering entries (Entry 1 near live, Entry 2 near EMA20/VWAP, Entry 3 near Support/Resistance)
  const entry1 = safePrice;
  let entry2 = isLong ? safePrice - atr * 0.55 : safePrice + atr * 0.55;
  let entry3 = isLong ? safePrice - atr * 1.1 : safePrice + atr * 1.1;

  if (isLong) {
    const pullMid = Math.min(ema20, vwap);
    if (pullMid < safePrice * 0.996 && pullMid > safePrice - atr * 1.4) {
      entry2 = pullMid;
    }
    if (supports[0] && supports[0] < entry2 * 0.996 && supports[0] > safePrice - atr * 2.2) {
      entry3 = supports[0];
    }
  } else {
    const pullMid = Math.max(ema20, vwap);
    if (pullMid > safePrice * 1.004 && pullMid < safePrice + atr * 1.4) {
      entry2 = pullMid;
    }
    if (resistances[0] && resistances[0] > entry2 * 1.004 && resistances[0] < safePrice + atr * 2.2) {
      entry3 = resistances[0];
    }
  }

  // Structural + ATR Stop Loss (protected beyond nearest swing S/R with buffer, capped at 5.5%)
  const rawAtrDist = Math.max(atr * atrMultiplier, safePrice * 0.008);
  let slDist = rawAtrDist;
  let slBasisLabel = `${atrMultiplier.toFixed(1)}× ATR`;

  if (isLong && supports[0] && supports[0] < safePrice) {
    const structDist = (safePrice - supports[0]) + atr * 0.35;
    if (structDist >= safePrice * 0.007 && structDist <= rawAtrDist * 1.5) {
      slDist = structDist;
      slBasisLabel = 'Swing Support + Buffer ATR';
    }
  } else if (!isLong && resistances[0] && resistances[0] > safePrice) {
    const structDist = (resistances[0] - safePrice) + atr * 0.35;
    if (structDist >= safePrice * 0.007 && structDist <= rawAtrDist * 1.5) {
      slDist = structDist;
      slBasisLabel = 'Swing Resistance + Buffer ATR';
    }
  }
  slDist = Math.min(slDist, safePrice * 0.055);

  const stopLoss = isLong ? Math.max(safePrice - slDist, safePrice * 0.5) : safePrice + slDist;

  // Smart TP1/TP2/TP3 combining structural S/R targets & clean R-multiples
  let tp1 = isLong ? safePrice + slDist * 1.5 : safePrice - slDist * 1.5;
  let tp2 = isLong ? safePrice + slDist * 2.5 : safePrice - slDist * 2.5;
  let tp3 = isLong ? safePrice + slDist * 3.8 : safePrice - slDist * 3.8;

  if (isLong) {
    if (resistances[0] && resistances[0] >= safePrice + slDist * 1.25 && resistances[0] <= safePrice + slDist * 2.1) {
      tp1 = resistances[0] * 0.998;
    }
    if (resistances[1] && resistances[1] >= safePrice + slDist * 2.1 && resistances[1] <= safePrice + slDist * 3.3) {
      tp2 = resistances[1] * 0.998;
    }
    if (tp2 <= tp1) tp2 = tp1 + slDist * 1.0;
    if (tp3 <= tp2) tp3 = tp2 + slDist * 1.2;
  } else {
    if (supports[0] && supports[0] <= safePrice - slDist * 1.25 && supports[0] >= safePrice - slDist * 2.1) {
      tp1 = supports[0] * 1.002;
    }
    if (supports[1] && supports[1] <= safePrice - slDist * 2.1 && supports[1] >= safePrice - slDist * 3.3) {
      tp2 = supports[1] * 1.002;
    }
    if (tp2 >= tp1) tp2 = tp1 - slDist * 1.0;
    if (tp3 >= tp2) tp3 = tp2 - slDist * 1.2;
  }

  // Recommend safe leverage keeping liquidation >= 1.5x further than SL
  const slPct = slDist / safePrice;
  const recommendedLeverage = Math.max(2, Math.min(15, Math.floor(1 / Math.max(slPct * 1.65 + 0.006, 0.04))));

  return {
    direction,
    entry1: roundPrice(entry1),
    entry2: roundPrice(entry2),
    entry3: roundPrice(entry3),
    stopLoss: roundPrice(stopLoss),
    tp1: roundPrice(Math.max(tp1, safePrice * 0.1)),
    tp2: roundPrice(Math.max(tp2, safePrice * 0.08)),
    tp3: roundPrice(Math.max(tp3, safePrice * 0.05)),
    recommendedLeverage,
    atrValue: atr,
    slBasisLabel,
  };
}

/**
 * Evaluates live multi-timeframe setup readiness on closed Binance candles for the selected
 * symbol, direction, and timeframe — providing institutional auto-confluence and risk alerts.
 */
export function analyzeFuturesSetupReadiness(params: {
  symbol: string;
  livePrice: number;
  direction: TradeDirection;
  timeframe: Timeframe;
  primaryCandles: Candle[];
  htfCandles: Candle[];
  btcHtfCandles: Candle[];
  isLiquidationBeforeSl: boolean;
  blendedNetRR: number;
}): FuturesSetupReadiness {
  const {
    symbol,
    livePrice,
    direction,
    timeframe,
    primaryCandles,
    htfCandles,
    btcHtfCandles,
    isLiquidationBeforeSl,
    blendedNetRR,
  } = params;

  const htfTf = getHigherTimeframeForSetup(timeframe);
  const closed = primaryCandles.length > 60 ? primaryCandles.slice(0, -1) : primaryCandles;
  const htfClosed = htfCandles.length > 35 ? htfCandles.slice(0, -1) : htfCandles;
  const btcClosed = btcHtfCandles.length > 35 ? btcHtfCandles.slice(0, -1) : btcHtfCandles;

  const htfTrend = evaluateSingleTimeframeTrend(htfClosed, htfTf).trend;
  const btcHtfTrend = evaluateSingleTimeframeTrend(btcClosed, htfTf).trend;

  if (closed.length < 35) {
    return {
      readinessScore: 50,
      readinessGrade: 'C',
      recommendedDirection: direction,
      htfTrend,
      btcHtfTrend,
      rsi14: 50,
      adx14: 18,
      volumeRatio: 1,
      atr14: livePrice * 0.015,
      ema20: livePrice,
      ema50: livePrice,
      vwap: livePrice,
      divergence: 'NONE',
      structureLabel: 'Memuat data candle...',
      autoChecklist: [],
      strengths: [],
      warnings: ['Data candle historis belum cukup untuk audit penuh.'],
      smartLevels: buildSmartFuturesLevels(closed, livePrice, direction),
    };
  }

  const lastClose = closed[closed.length - 1].close;
  const ema20Arr = calculateEMA(closed, 20);
  const ema50Arr = calculateEMA(closed, 50);
  const rsiArr = calculateRSI(closed, 14);
  const atrArr = calculateATR(closed, 14);
  const macdArr = calculateMACD(closed, 12, 26, 9);
  const adxRes = calculateADX(closed, 14);
  const vwap = calculateRollingVWAP(closed, 24);
  const bb = calculateBollingerBands(closed, 20, 2);
  const volumeRatio = calculateCandleVolumeRatio(closed, 20);
  const structure = detectMarketStructure(closed);
  const divergence = detectRsiDivergence(closed, rsiArr);
  const { supports, resistances } = detectSupportResistance(closed);

  const ema20 = ema20Arr[ema20Arr.length - 1]?.value ?? lastClose;
  const ema50 = ema50Arr[ema50Arr.length - 1]?.value ?? lastClose;
  const rsi14 = rsiArr[rsiArr.length - 1]?.value ?? 50;
  const atr14 = atrArr[atrArr.length - 1]?.value ?? lastClose * 0.015;
  const macdCur = macdArr[macdArr.length - 1];
  const macdPrev = macdArr[macdArr.length - 2];

  // Objective direction recommendation using HTF + EMA + MACD + DI + RSI Divergence
  let bullPts = 0;
  let bearPts = 0;
  if (htfTrend === 'Bullish') bullPts += 3;
  else if (htfTrend === 'Bearish') bearPts += 3;
  if (lastClose > ema20 && ema20 > ema50) bullPts += 2;
  else if (lastClose < ema20 && ema20 < ema50) bearPts += 2;
  if (adxRes.plusDI > adxRes.minusDI) bullPts += 1.5;
  else bearPts += 1.5;
  if (macdCur && macdCur.histogram > 0) bullPts += 1.5;
  else if (macdCur && macdCur.histogram < 0) bearPts += 1.5;
  if (lastClose >= vwap) bullPts += 1;
  else bearPts += 1;
  if (divergence === 'BULLISH') bullPts += 2;
  else if (divergence === 'BEARISH') bearPts += 2;

  const recommendedDirection: TradeDirection = bullPts >= bearPts ? 'LONG' : 'SHORT';

  // Evaluate the USER'S chosen direction strictly
  const isLong = direction === 'LONG';
  let score = 0;
  const autoChecklist: string[] = [];
  const strengths: string[] = [];
  const warnings: string[] = [];

  // 1. HTF Alignment (20 pts)
  const htfAligned = (isLong && htfTrend === 'Bullish') || (!isLong && htfTrend === 'Bearish');
  if (htfAligned) {
    score += 20;
    autoChecklist.push('Struktur HTF Searah');
    strengths.push(`HTF ${htfTf.toUpperCase()} ${htfTrend} searah ${direction}`);
  } else if (htfTrend === 'Sideways') {
    score += 10;
  } else {
    warnings.push(`Arah ${direction} melawan HTF ${htfTf.toUpperCase()} (${htfTrend}) — risiko stop-hunt lebih tinggi.`);
  }

  // 2. EMA 20/50 + Structure (18 pts)
  const emaAligned = isLong ? lastClose > ema20 && ema20 > ema50 : lastClose < ema20 && ema20 < ema50;
  if (emaAligned) {
    score += 14;
    autoChecklist.push('Konfirmasi EMA 20/50');
    strengths.push(isLong ? 'Harga > EMA20 > EMA50' : 'Harga < EMA20 < EMA50');
  } else if ((isLong && lastClose > ema20) || (!isLong && lastClose < ema20)) {
    score += 7;
  } else {
    warnings.push(`Harga belum terkonfirmasi di sisi yang tepat terhadap EMA 20/50.`);
  }
  if (
    (isLong && (structure.structure === 'UPTREND_HH_HL' || structure.bosBullish)) ||
    (!isLong && (structure.structure === 'DOWNTREND_LH_LL' || structure.bosBearish))
  ) {
    score += 4;
  }

  // 3. Key S/R Proximity & Room (14 pts)
  const nearSup = supports[0] ? Math.abs(livePrice - supports[0]) / livePrice <= 0.025 : false;
  const nearRes = resistances[0] ? Math.abs(resistances[0] - livePrice) / livePrice <= 0.025 : false;
  if ((isLong && nearSup) || (!isLong && nearRes)) {
    score += 14;
    autoChecklist.push('Harga di Key Support / Resistance');
    strengths.push(isLong ? 'Dekat zona Key Support' : 'Dekat zona Key Resistance');
  } else if ((isLong && !nearRes) || (!isLong && !nearSup)) {
    score += 9;
  } else {
    score += 3;
    warnings.push(
      isLong
        ? 'Hati-hati: harga sangat dekat Key Resistance (rawan rejection).'
        : 'Hati-hati: harga sangat dekat Key Support (rawan bounce).',
    );
  }

  // 4. Volume, VWAP & MACD Momentum (16 pts)
  const vwapOk = isLong ? lastClose >= vwap * 0.998 : lastClose <= vwap * 1.002;
  const macdOk =
    macdCur && macdPrev
      ? isLong
        ? macdCur.histogram > macdPrev.histogram || macdCur.histogram > 0
        : macdCur.histogram < macdPrev.histogram || macdCur.histogram < 0
      : false;
  if (volumeRatio >= 1.15 && vwapOk) {
    score += 10;
    autoChecklist.push('Volume Spike / Orderflow Kuat');
    strengths.push(`Vol candle ${volumeRatio.toFixed(1)}x & searah VWAP`);
  } else if (vwapOk || volumeRatio >= 1.1) {
    score += 6;
  }
  if (macdOk) score += 6;

  // 5. RSI Health & Anti-Chasing (16 pts)
  const distAtr = atr14 > 0 ? Math.abs(livePrice - ema20) / atr14 : 0;
  const overextended =
    (isLong && (rsi14 > 73 || distAtr > 2.6 || bb.percentB > 1.02)) ||
    (!isLong && (rsi14 < 27 || distAtr > 2.6 || bb.percentB < -0.02));
  if (!overextended) {
    score += 12;
    autoChecklist.push('RSI Tidak Overextended');
  } else {
    warnings.push(
      `Area Overextended (RSI ${rsi14.toFixed(1)}, jarak EMA20 ${distAtr.toFixed(1)} ATR) — hindari kejar harga, tunggu pullback/layering!`,
    );
  }
  if ((isLong && divergence === 'BULLISH') || (!isLong && divergence === 'BEARISH')) {
    score += 4;
    strengths.push(isLong ? 'Bullish RSI Divergence terdeteksi' : 'Bearish RSI Divergence terdeteksi');
  }

  // 6. BTC Beta + ADX + Risk Discipline (16 pts)
  const btcAligned =
    symbol === 'BTCUSDT' ||
    btcHtfTrend === 'Sideways' ||
    (isLong && btcHtfTrend === 'Bullish') ||
    (!isLong && btcHtfTrend === 'Bearish');

  if (btcAligned) score += 6;
  else warnings.push(`Melawan trend HTF BTC (${btcHtfTrend}) — kurangi risk atau tunggu BTC stabil.`);

  if (adxRes.adx >= 20 && (isLong ? adxRes.plusDI > adxRes.minusDI : adxRes.minusDI > adxRes.plusDI)) {
    score += 5;
    strengths.push(`ADX ${adxRes.adx} tren solid`);
  } else if (adxRes.adx < 15) {
    warnings.push(`ADX ${adxRes.adx} sangat rendah (market choppy / rawan whipsaw).`);
  }

  if (!isLiquidationBeforeSl && blendedNetRR >= 1.5) {
    score += 5;
    autoChecklist.push('Funding & Risk Management Sehat');
  } else if (isLiquidationBeforeSl) {
    score = Math.max(0, score - 25);
    warnings.push('BAHAYA: Estimasi likuidasi lebih dekat dari Stop Loss!');
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  const readinessGrade: FuturesSetupReadiness['readinessGrade'] =
    finalScore >= 85
      ? 'A+'
      : finalScore >= 72
        ? 'A'
        : finalScore >= 58
          ? 'B'
          : finalScore >= 42
            ? 'C'
            : 'D';

  const structureLabelMap: Record<typeof structure.structure, string> = {
    UPTREND_HH_HL: 'Uptrend (HH/HL)',
    DOWNTREND_LH_LL: 'Downtrend (LH/LL)',
    SQUEEZE: 'Volatility Squeeze',
    RANGE: 'Konsolidasi Range',
  };

  return {
    readinessScore: finalScore,
    readinessGrade,
    recommendedDirection,
    htfTrend,
    btcHtfTrend,
    rsi14: Number(rsi14.toFixed(1)),
    adx14: adxRes.adx,
    volumeRatio,
    atr14,
    ema20,
    ema50,
    vwap,
    divergence,
    structureLabel: structureLabelMap[structure.structure],
    autoChecklist,
    strengths: strengths.slice(0, 4),
    warnings: warnings.slice(0, 4),
    smartLevels: buildSmartFuturesLevels(closed, livePrice, recommendedDirection),
  };
}

export interface StrategyComparisonItem {
  strategy: BacktestStrategyId;
  label: string;
  result: BacktestResult;
}

export function compareBacktestStrategies(
  candles: Candle[],
  symbol: string,
  timeframe: Timeframe,
  targetRR: number,
  atrMultiplier: number,
): StrategyComparisonItem[] {
  const defs: Array<{ id: BacktestStrategyId; label: string }> = [
    { id: 'ema_pullback', label: 'EMA 20/50 Pullback' },
    { id: 'breakout_volume', label: 'Breakout + Vol' },
    { id: 'rsi_reversal', label: 'RSI Reversal' },
  ];

  return defs
    .map((d) => ({
      strategy: d.id,
      label: d.label,
      result: runBacktest(candles, {
        symbol,
        strategy: d.id,
        timeframe,
        targetRR,
        atrMultiplier,
        feeRate: 0.001,
      }),
    }))
    .sort((a, b) => {
      // Rank by Expectancy R * Profit Factor with trade-count confidence
      const score = (r: BacktestResult) =>
        (r.totalTrades >= 3 ? 1 : 0.3) * (r.profitFactor * 10 + r.expectancyR * 15 + r.netPnlPercent * 0.4);
      return score(b.result) - score(a.result);
    });
}
