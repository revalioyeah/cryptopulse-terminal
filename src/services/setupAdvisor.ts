import type {
  BacktestResult,
  BacktestStrategyId,
  Candle,
  EntryMode,
  Timeframe,
  TradeDirection,
} from '../types';
import { runBacktest } from './backtestEngine';
import {
  type PoiAnalysisResult,
  type PoiZone,
  calculateADX,
  calculateATR,
  calculateBollingerBands,
  calculateCandleVolumeRatio,
  calculateEMA,
  calculateMACD,
  calculateRSI,
  calculateRollingVWAP,
  detectMarketStructure,
  detectPoiZones,
  detectRsiDivergence,
  detectSupportResistance,
  evaluateSingleTimeframeTrend,
} from './indicators';

export type EntryExecutionStyle = 'POI_LIMIT' | 'MARKET';

export function getHigherTimeframeForSetup(tf: Timeframe): '15m' | '1h' | '4h' | '1d' {
  if (tf === '5m') return '15m';
  if (tf === '15m') return '1h';
  if (tf === '1h') return '4h';
  return '1d';
}

export interface SmartFuturesLevels {
  direction: TradeDirection;
  entryStyle: EntryExecutionStyle;
  recommendedEntryMode: EntryMode;
  poiLabel: string;
  poiDistancePercent: number;
  poiZoneLow: number;
  poiZoneHigh: number;
  entry1: number;
  entry2: number;
  entry3: number;
  avgEntry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  recommendedLeverage: number;
  atrValue: number;
  slBasisLabel: string;
}

export interface DirectionReadinessSnapshot {
  direction: TradeDirection;
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D';
  autoChecklist: string[];
  strengths: string[];
  warnings: string[];
}

export interface FuturesSetupReadiness {
  readinessScore: number; // Score for currently selected direction
  readinessGrade: 'A+' | 'A' | 'B' | 'C' | 'D';
  recommendedDirection: TradeDirection;
  longReadiness: DirectionReadinessSnapshot;
  shortReadiness: DirectionReadinessSnapshot;
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
  poiAnalysis: PoiAnalysisResult;
  autoChecklist: string[];
  strengths: string[];
  warnings: string[];
  smartLevels: SmartFuturesLevels;
  smartLongLevels: SmartFuturesLevels;
  smartShortLevels: SmartFuturesLevels;
}

function roundPrice(p: number): number {
  if (!Number.isFinite(p) || p <= 0) return 0;
  return Number(p.toPrecision(6));
}

function scoreToGrade(score: number): 'A+' | 'A' | 'B' | 'C' | 'D' {
  if (score >= 82) return 'A+';
  if (score >= 70) return 'A';
  if (score >= 56) return 'B';
  if (score >= 42) return 'C';
  return 'D';
}

/**
 * Builds institutional Limit Pullback (OB / FVG / OTE / S-R Flip / EMA-VWAP) or Market Futures levels.
 * Default `POI_LIMIT` places limit orders inside the nearest unmitigated POI zone instead of chasing live price.
 */
export function buildSmartFuturesLevels(
  closedCandles: Candle[],
  livePrice: number,
  direction: TradeDirection,
  atrMultiplier = 1.5,
  entryStyle: EntryExecutionStyle = 'POI_LIMIT',
  customPoi?: PoiZone,
): SmartFuturesLevels {
  const safePrice = Math.max(livePrice, 1e-8);
  const atrArr = calculateATR(closedCandles, 14);
  const { supports, resistances } = detectSupportResistance(closedCandles);
  const poiAnalysis = detectPoiZones(closedCandles, safePrice);

  const atr = atrArr[atrArr.length - 1]?.value ?? safePrice * 0.015;
  const isLong = direction === 'LONG';
  const targetPoi = customPoi ?? (isLong ? poiAnalysis.bestLongPoi : poiAnalysis.bestShortPoi);

  let entry1 = safePrice;
  let entry2 = isLong ? safePrice - atr * 0.55 : safePrice + atr * 0.55;
  let entry3 = isLong ? safePrice - atr * 1.1 : safePrice + atr * 1.1;
  let slBasisLabel = `${atrMultiplier.toFixed(1)}× ATR`;
  let poiLabel = 'Market Execution';

  if (entryStyle === 'POI_LIMIT') {
    poiLabel = targetPoi.label;
    const zLow = targetPoi.zoneLow;
    const zHigh = targetPoi.zoneHigh;
    const zMid = (zLow + zHigh) / 2;

    if (isLong) {
      // Layer inside Bullish POI: top edge (40%), mid/equilibrium (35%), bottom edge (25%)
      entry1 = Math.min(targetPoi.entryPrice, safePrice);
      entry2 = Math.min(zMid, entry1 * 0.997);
      entry3 = Math.min(zLow, entry2 * 0.996);
    } else {
      // Layer inside Bearish POI: bottom edge (40%), mid/equilibrium (35%), top edge (25%)
      entry1 = Math.max(targetPoi.entryPrice, safePrice);
      entry2 = Math.max(zMid, entry1 * 1.003);
      entry3 = Math.max(zHigh, entry2 * 1.004);
    }
  }

  const avgEntry =
    entryStyle === 'POI_LIMIT'
      ? entry1 * 0.4 + entry2 * 0.35 + entry3 * 0.25
      : entry1;

  // Stop Loss: anchored cleanly beyond POI invalidation (OB/FVG/OTE edge + ATR buffer)
  const rawAtrDist = Math.max(atr * atrMultiplier, avgEntry * 0.008);
  let slDist = rawAtrDist;

  if (entryStyle === 'POI_LIMIT' && targetPoi.invalidationPrice > 0) {
    const poiSlDist = isLong
      ? avgEntry - targetPoi.invalidationPrice
      : targetPoi.invalidationPrice - avgEntry;
    if (poiSlDist >= avgEntry * 0.006 && poiSlDist <= avgEntry * 0.055) {
      slDist = poiSlDist;
      slBasisLabel = `Invalidasi ${targetPoi.kind} + Buffer ATR`;
    }
  } else if (isLong && supports[0] && supports[0] < avgEntry) {
    const structDist = avgEntry - supports[0] + atr * 0.35;
    if (structDist >= avgEntry * 0.007 && structDist <= rawAtrDist * 1.5) {
      slDist = structDist;
      slBasisLabel = 'Swing Support + Buffer ATR';
    }
  } else if (!isLong && resistances[0] && resistances[0] > avgEntry) {
    const structDist = resistances[0] - avgEntry + atr * 0.35;
    if (structDist >= avgEntry * 0.007 && structDist <= rawAtrDist * 1.5) {
      slDist = structDist;
      slBasisLabel = 'Swing Resistance + Buffer ATR';
    }
  }

  // Ensure SL strictly clears entry3 for layering and stays capped at 5.5%
  const minClearanceFromLeg3 = isLong
    ? Math.max(0, avgEntry - entry3) + atr * 0.25
    : Math.max(0, entry3 - avgEntry) + atr * 0.25;
  slDist = Math.min(Math.max(slDist, minClearanceFromLeg3, avgEntry * 0.007), avgEntry * 0.055);

  const stopLoss = isLong ? Math.max(avgEntry - slDist, avgEntry * 0.5) : avgEntry + slDist;

  // Smart TP1/TP2/TP3 targeting opposing POI / S-R liquidity clusters & strong R-multiples
  let tp1 = isLong ? avgEntry + slDist * 1.6 : avgEntry - slDist * 1.6;
  let tp2 = isLong ? avgEntry + slDist * 2.6 : avgEntry - slDist * 2.6;
  let tp3 = isLong ? avgEntry + slDist * 3.9 : avgEntry - slDist * 3.9;

  const opposingPoi = isLong ? poiAnalysis.bestShortPoi : poiAnalysis.bestLongPoi;

  if (isLong) {
    if (
      opposingPoi.entryPrice >= avgEntry + slDist * 1.35 &&
      opposingPoi.entryPrice <= avgEntry + slDist * 2.2
    ) {
      tp1 = opposingPoi.entryPrice * 0.998;
    } else if (
      resistances[0] &&
      resistances[0] >= avgEntry + slDist * 1.3 &&
      resistances[0] <= avgEntry + slDist * 2.2
    ) {
      tp1 = resistances[0] * 0.998;
    }
    if (
      resistances[1] &&
      resistances[1] >= Math.max(tp1 + slDist * 0.7, avgEntry + slDist * 2.2) &&
      resistances[1] <= avgEntry + slDist * 3.5
    ) {
      tp2 = resistances[1] * 0.998;
    }
    if (tp2 <= tp1) tp2 = tp1 + slDist * 1.0;
    if (tp3 <= tp2) tp3 = tp2 + slDist * 1.25;
  } else {
    if (
      opposingPoi.entryPrice <= avgEntry - slDist * 1.35 &&
      opposingPoi.entryPrice >= avgEntry - slDist * 2.2
    ) {
      tp1 = opposingPoi.entryPrice * 1.002;
    } else if (
      supports[0] &&
      supports[0] <= avgEntry - slDist * 1.3 &&
      supports[0] >= avgEntry - slDist * 2.2
    ) {
      tp1 = supports[0] * 1.002;
    }
    if (
      supports[1] &&
      supports[1] <= Math.min(tp1 - slDist * 0.7, avgEntry - slDist * 2.2) &&
      supports[1] >= avgEntry - slDist * 3.5
    ) {
      tp2 = supports[1] * 1.002;
    }
    if (tp2 >= tp1) tp2 = tp1 - slDist * 1.0;
    if (tp3 >= tp2) tp3 = tp2 - slDist * 1.25;
  }

  const slPct = slDist / avgEntry;
  const recommendedLeverage = Math.max(
    2,
    Math.min(15, Math.floor(1 / Math.max(slPct * 1.65 + 0.006, 0.04))),
  );

  return {
    direction,
    entryStyle,
    recommendedEntryMode: entryStyle === 'POI_LIMIT' ? 'LAYERING' : 'SINGLE',
    poiLabel,
    poiDistancePercent: entryStyle === 'POI_LIMIT' ? targetPoi.distancePercent : 0,
    poiZoneLow: targetPoi.zoneLow,
    poiZoneHigh: targetPoi.zoneHigh,
    entry1: roundPrice(entry1),
    entry2: roundPrice(entry2),
    entry3: roundPrice(entry3),
    avgEntry: roundPrice(avgEntry),
    stopLoss: roundPrice(stopLoss),
    tp1: roundPrice(Math.max(tp1, safePrice * 0.1)),
    tp2: roundPrice(Math.max(tp2, safePrice * 0.08)),
    tp3: roundPrice(Math.max(tp3, safePrice * 0.05)),
    recommendedLeverage,
    atrValue: atr,
    slBasisLabel,
  };
}

function evaluateSingleDirectionReadiness(params: {
  direction: TradeDirection;
  symbol: string;
  livePrice: number;
  htfTf: string;
  htfTrend: 'Bullish' | 'Bearish' | 'Sideways';
  btcHtfTrend: 'Bullish' | 'Bearish' | 'Sideways';
  lastClose: number;
  ema20: number;
  ema50: number;
  vwap: number;
  rsi14: number;
  atr14: number;
  adx: number;
  plusDI: number;
  minusDI: number;
  volumeRatio: number;
  percentB: number;
  structure: ReturnType<typeof detectMarketStructure>;
  divergence: 'BULLISH' | 'BEARISH' | 'NONE';
  macdBull: boolean;
  macdBear: boolean;
  poiAnalysis: PoiAnalysisResult;
  isLiquidationBeforeSl: boolean;
  blendedNetRR: number;
}): DirectionReadinessSnapshot {
  const {
    direction,
    symbol,
    livePrice,
    htfTf,
    htfTrend,
    btcHtfTrend,
    lastClose,
    ema20,
    ema50,
    vwap,
    rsi14,
    atr14,
    adx,
    plusDI,
    minusDI,
    volumeRatio,
    percentB,
    structure,
    divergence,
    macdBull,
    macdBear,
    poiAnalysis,
    isLiquidationBeforeSl,
    blendedNetRR,
  } = params;

  const isLong = direction === 'LONG';
  const bestPoi = isLong ? poiAnalysis.bestLongPoi : poiAnalysis.bestShortPoi;
  let score = 0;
  const autoChecklist: string[] = [];
  const strengths: string[] = [];
  const warnings: string[] = [];

  // 1. HTF Trend Alignment (20 pts)
  const htfAligned = (isLong && htfTrend === 'Bullish') || (!isLong && htfTrend === 'Bearish');
  if (htfAligned) {
    score += 20;
    autoChecklist.push('Struktur HTF Searah');
    strengths.push(`HTF ${htfTf.toUpperCase()} ${htfTrend} searah ${direction}`);
  } else if (htfTrend === 'Sideways') {
    score += 11;
  } else {
    warnings.push(
      `Arah ${direction} melawan HTF ${htfTf.toUpperCase()} (${htfTrend}) — gunakan Limit POI di zona ekstrem saja.`,
    );
  }

  // 2. Institutional POI Quality: OB / FVG / OTE / Liquidity Sweep (20 pts)
  if (bestPoi.kind === 'OB' || bestPoi.kind === 'FVG' || bestPoi.kind === 'OTE') {
    score += bestPoi.hasFvgConfluence ? 18 : 15;
    autoChecklist.push('Harga di Key Support / Resistance');
    strengths.push(
      `${bestPoi.label} (${bestPoi.distancePercent >= 0 ? '+' : ''}${bestPoi.distancePercent}% dari live)`,
    );
  } else if (bestPoi.kind === 'SR_FLIP') {
    score += 12;
    autoChecklist.push('Harga di Key Support / Resistance');
    strengths.push(`${bestPoi.label} terdeteksi`);
  } else {
    score += 7;
  }

  if (
    (isLong && poiAnalysis.liquiditySweep === 'BULLISH_SWEEP') ||
    (!isLong && poiAnalysis.liquiditySweep === 'BEARISH_SWEEP')
  ) {
    score += 4;
    strengths.push(isLong ? 'Bullish Liquidity Sweep Reclaim' : 'Bearish Liquidity Sweep Reclaim');
  }

  // 3. EMA 20/50 + Market Structure (16 pts)
  const emaAligned = isLong
    ? lastClose > ema20 && ema20 > ema50
    : lastClose < ema20 && ema20 < ema50;
  if (emaAligned) {
    score += 12;
    autoChecklist.push('Konfirmasi EMA 20/50');
    strengths.push(isLong ? 'EMA 20 > EMA 50 Bullish' : 'EMA 20 < EMA 50 Bearish');
  } else if ((isLong && lastClose > ema20) || (!isLong && lastClose < ema20)) {
    score += 6;
  } else {
    warnings.push('Harga belum searah EMA 20/50 — tunggu limit pullback / retest.');
  }
  if (
    (isLong && (structure.structure === 'UPTREND_HH_HL' || structure.bosBullish)) ||
    (!isLong && (structure.structure === 'DOWNTREND_LH_LL' || structure.bosBearish))
  ) {
    score += 4;
  }

  // 4. Volume, VWAP & MACD Momentum (14 pts)
  const vwapOk = isLong ? lastClose >= vwap * 0.998 : lastClose <= vwap * 1.002;
  const macdOk = isLong ? macdBull : macdBear;
  if (volumeRatio >= 1.15 && vwapOk) {
    score += 9;
    autoChecklist.push('Volume Spike / Orderflow Kuat');
    strengths.push(`Vol candle ${volumeRatio.toFixed(1)}x & searah VWAP`);
  } else if (vwapOk || volumeRatio >= 1.1) {
    score += 5;
  }
  if (macdOk) score += 5;

  // 5. RSI Health, Divergence & Anti-Chasing (15 pts)
  const distAtr = atr14 > 0 ? Math.abs(livePrice - ema20) / atr14 : 0;
  const overextended =
    (isLong && (rsi14 > 73 || distAtr > 2.5 || percentB > 1.02)) ||
    (!isLong && (rsi14 < 27 || distAtr > 2.5 || percentB < -0.02));
  if (!overextended) {
    score += 11;
    autoChecklist.push('RSI Tidak Overextended');
  } else {
    warnings.push(
      `Harga live overextended (RSI ${rsi14.toFixed(1)}, ${distAtr.toFixed(1)} ATR dari EMA20) — WAJIB pakai Limit Pullback POI, jangan entry Market!`,
    );
  }
  if ((isLong && divergence === 'BULLISH') || (!isLong && divergence === 'BEARISH')) {
    score += 4;
    strengths.push(isLong ? 'Bullish RSI Divergence' : 'Bearish RSI Divergence');
  }

  // 6. BTC Macro Alignment + ADX + Risk Health (15 pts)
  const btcAligned =
    symbol === 'BTCUSDT' ||
    btcHtfTrend === 'Sideways' ||
    (isLong && btcHtfTrend === 'Bullish') ||
    (!isLong && btcHtfTrend === 'Bearish');

  if (btcAligned) score += 6;
  else warnings.push(`Melawan HTF BTC (${btcHtfTrend}) — kurangi risk ke 0.5%.`);

  if (adx >= 20 && (isLong ? plusDI > minusDI : minusDI > plusDI)) {
    score += 4;
    strengths.push(`ADX ${adx} tren solid`);
  } else if (adx < 15) {
    warnings.push(`ADX ${adx} rendah (sideways / rawan whipsaw).`);
  }

  if (!isLiquidationBeforeSl && blendedNetRR >= 1.5) {
    score += 5;
    autoChecklist.push('Funding & Risk Management Sehat');
  } else if (isLiquidationBeforeSl) {
    score = Math.max(0, score - 25);
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  return {
    direction,
    score: finalScore,
    grade: scoreToGrade(finalScore),
    autoChecklist,
    strengths: strengths.slice(0, 4),
    warnings: warnings.slice(0, 4),
  };
}

/**
 * Evaluates BOTH LONG and SHORT setup readiness objectively on closed Binance candles,
 * detects institutional POI zones (OB / FVG / OTE / S-R Flip), and generates Limit Pullback levels.
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
  const poiAnalysis = detectPoiZones(closed, livePrice);

  const smartLongLevels = buildSmartFuturesLevels(closed, livePrice, 'LONG', 1.5, 'POI_LIMIT');
  const smartShortLevels = buildSmartFuturesLevels(closed, livePrice, 'SHORT', 1.5, 'POI_LIMIT');

  if (closed.length < 35) {
    const emptySnap = (dir: TradeDirection): DirectionReadinessSnapshot => ({
      direction: dir,
      score: 50,
      grade: 'C',
      autoChecklist: [],
      strengths: [],
      warnings: ['Memuat data candle historis...'],
    });
    return {
      readinessScore: 50,
      readinessGrade: 'C',
      recommendedDirection: direction,
      longReadiness: emptySnap('LONG'),
      shortReadiness: emptySnap('SHORT'),
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
      poiAnalysis,
      autoChecklist: [],
      strengths: [],
      warnings: ['Data candle historis belum cukup untuk audit penuh.'],
      smartLevels: direction === 'LONG' ? smartLongLevels : smartShortLevels,
      smartLongLevels,
      smartShortLevels,
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

  const ema20 = ema20Arr[ema20Arr.length - 1]?.value ?? lastClose;
  const ema50 = ema50Arr[ema50Arr.length - 1]?.value ?? lastClose;
  const rsi14 = rsiArr[rsiArr.length - 1]?.value ?? 50;
  const atr14 = atrArr[atrArr.length - 1]?.value ?? lastClose * 0.015;
  const macdCur = macdArr[macdArr.length - 1];
  const macdPrev = macdArr[macdArr.length - 2];

  const macdBull = Boolean(
    macdCur && macdPrev && (macdCur.histogram > 0 || macdCur.histogram > macdPrev.histogram),
  );
  const macdBear = Boolean(
    macdCur && macdPrev && (macdCur.histogram < 0 || macdCur.histogram < macdPrev.histogram),
  );

  const common = {
    symbol,
    livePrice,
    htfTf,
    htfTrend,
    btcHtfTrend,
    lastClose,
    ema20,
    ema50,
    vwap,
    rsi14,
    atr14,
    adx: adxRes.adx,
    plusDI: adxRes.plusDI,
    minusDI: adxRes.minusDI,
    volumeRatio,
    percentB: bb.percentB,
    structure,
    divergence,
    macdBull,
    macdBear,
    poiAnalysis,
    isLiquidationBeforeSl,
    blendedNetRR,
  };

  const longReadiness = evaluateSingleDirectionReadiness({ ...common, direction: 'LONG' });
  const shortReadiness = evaluateSingleDirectionReadiness({ ...common, direction: 'SHORT' });

  const recommendedDirection: TradeDirection =
    shortReadiness.score > longReadiness.score ? 'SHORT' : 'LONG';

  const activeSnap = direction === 'LONG' ? longReadiness : shortReadiness;

  const structureLabelMap: Record<typeof structure.structure, string> = {
    UPTREND_HH_HL: 'Uptrend (HH/HL)',
    DOWNTREND_LH_LL: 'Downtrend (LH/LL)',
    SQUEEZE: 'Volatility Squeeze',
    RANGE: 'Konsolidasi Range',
  };

  return {
    readinessScore: activeSnap.score,
    readinessGrade: activeSnap.grade,
    recommendedDirection,
    longReadiness,
    shortReadiness,
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
    poiAnalysis,
    autoChecklist: activeSnap.autoChecklist,
    strengths: activeSnap.strengths,
    warnings: activeSnap.warnings,
    smartLevels: recommendedDirection === 'SHORT' ? smartShortLevels : smartLongLevels,
    smartLongLevels,
    smartShortLevels,
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
      const score = (r: BacktestResult) =>
        (r.totalTrades >= 3 ? 1 : 0.3) *
        (r.profitFactor * 10 + r.expectancyR * 15 + r.netPnlPercent * 0.4);
      return score(b.result) - score(a.result);
    });
}
