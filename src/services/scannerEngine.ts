import type {
  AutoSignalConfig,
  AutoSignalLog,
  BacktestGrade,
  BacktestStrategyId,
  Candle,
  Coin,
  FuturesScanCandidateAudit,
  FuturesScanReport,
  SpotFunnelCandidate,
  SpotFunnelReport,
  SpotSetup,
  TradeDirection,
  TradeSetup,
} from '../types';
import { fetchBinanceKlines } from './adapters/binanceAdapter';
import { getMacroAndUnlockEvents } from './adapters/calendarAdapter';
import { fetchTop100Tokenomics } from './adapters/coinGeckoAdapter';
import {
  fetchBulkPerpMetricsMap,
  fetchDerivativesSnapshot,
} from './adapters/derivativesAdapter';
import { runBacktest } from './backtestEngine';
import {
  buildTechnicalSummary,
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
import { buildSmartFuturesLevels } from './setupAdvisor';
import { evaluateSpotQuality, generateSpotDcaPlan } from './spotScoring';
import { generateId } from '../utils/format';
import { calculateFuturesRisk } from '../utils/riskCalc';

const GRADE_RANK: Record<BacktestGrade, number> = {
  C: 1,
  B: 2,
  'B+': 3,
  A: 4,
  'A+': 5,
};

function getHigherTimeframe(tf: '15m' | '1h' | '4h'): '1h' | '4h' | '1d' {
  if (tf === '15m') return '1h';
  if (tf === '1h') return '4h';
  return '1d';
}

function mapRuleToStrategy(rule: AutoSignalConfig['rule']): BacktestStrategyId {
  if (rule === 'MOMENTUM_BREAKOUT') return 'breakout_volume';
  if (rule === 'RSI_OVERSOLD_BOUNCE') return 'rsi_reversal';
  if (rule === 'EMA_PULLBACK') return 'ema_pullback';
  return 'high_conviction';
}

async function runInBatches<T, R>(
  items: T[],
  batchSize: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const chunkResults = await Promise.all(chunk.map((item, idx) => worker(item, i + idx)));
    results.push(...chunkResults);
  }
  return results;
}

export interface FuturesProScanOutput {
  report: FuturesScanReport;
  signals: Array<{
    log: AutoSignalLog;
    setup: TradeSetup;
  }>;
}

function evaluateFuturesDirectionScore(
  direction: TradeDirection,
  closed: Candle[],
  htfTrend: 'Bullish' | 'Bearish' | 'Sideways',
  btcHtfTrend: 'Bullish' | 'Bearish' | 'Sideways',
  rule: AutoSignalConfig['rule'],
  symbol: string,
  rsVsBtc24h: number,
  fundingRate8h?: number,
): {
  score: number;
  rsi14: number;
  adx14: number;
  volumeRatio: number;
  atr14: number;
  atrPercent: number;
  ema20: number;
  ema50: number;
  supports: number[];
  resistances: number[];
  btcAligned: boolean;
  reasons: string[];
  hardReject?: string;
} {
  const lastBar = closed[closed.length - 1];
  const prevBar = closed[closed.length - 2] ?? lastBar;
  const close = lastBar.close;

  const ema20Arr = calculateEMA(closed, 20);
  const ema50Arr = calculateEMA(closed, 50);
  const ema200Arr = calculateEMA(closed, Math.min(200, closed.length - 1));
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

  const ema20 = ema20Arr[ema20Arr.length - 1]?.value ?? close;
  const ema50 = ema50Arr[ema50Arr.length - 1]?.value ?? close;
  const ema200 = ema200Arr[ema200Arr.length - 1]?.value ?? ema50;
  const rsi14 = rsiArr[rsiArr.length - 1]?.value ?? 50;
  const prevRsi = rsiArr[rsiArr.length - 2]?.value ?? rsi14;
  const atr14 = atrArr[atrArr.length - 1]?.value ?? close * 0.012;
  const atrPercent = Number(((atr14 / Math.max(close, 1e-9)) * 100).toFixed(2));
  const macdCur = macdArr[macdArr.length - 1];
  const macdPrev = macdArr[macdArr.length - 2];

  const isLong = direction === 'LONG';
  const reasons: string[] = [];
  let score = 0;

  // BTC Macro alignment check (BTC itself is always aligned)
  const btcAligned =
    symbol === 'BTCUSDT' ||
    btcHtfTrend === 'Sideways' ||
    (isLong && btcHtfTrend === 'Bullish') ||
    (!isLong && btcHtfTrend === 'Bearish');

  // 1. HTF Trend Alignment (max 18 pts)
  if ((isLong && htfTrend === 'Bullish') || (!isLong && htfTrend === 'Bearish')) {
    score += 18;
    reasons.push(`HTF ${htfTrend} searah`);
  } else if (htfTrend === 'Sideways') {
    score += 8;
  } else if (rule === 'RSI_OVERSOLD_BOUNCE') {
    score += divergence === (isLong ? 'BULLISH' : 'BEARISH') ? 10 : 0;
  }

  // 2. Primary EMA Ribbon + Market Structure (max 15 pts)
  const emaBull = close > ema20 && ema20 > ema50;
  const emaBear = close < ema20 && ema20 < ema50;
  if ((isLong && emaBull) || (!isLong && emaBear)) {
    score += 9;
    if ((isLong && close > ema200) || (!isLong && close < ema200)) {
      score += 3;
      reasons.push(isLong ? 'EMA 20>50>200 Bullish' : 'EMA 20<50<200 Bearish');
    } else {
      reasons.push(isLong ? 'EMA 20>50 Bullish' : 'EMA 20<50 Bearish');
    }
  } else if (rule === 'RSI_OVERSOLD_BOUNCE') {
    score += 5;
  }

  if (
    (isLong && (structure.structure === 'UPTREND_HH_HL' || structure.bosBullish)) ||
    (!isLong && (structure.structure === 'DOWNTREND_LH_LL' || structure.bosBearish))
  ) {
    score += 3;
    if (structure.bosBullish || structure.bosBearish) {
      reasons.push(isLong ? 'Bullish BOS' : 'Bearish BOS');
    }
  }

  // 3. ADX Trend Strength & Directional Dominance (max 10 pts)
  const diAligned = isLong ? adxRes.plusDI > adxRes.minusDI : adxRes.minusDI > adxRes.plusDI;
  if (adxRes.adx >= 22 && diAligned) {
    score += 10;
    reasons.push(`ADX ${adxRes.adx} kuat`);
  } else if (adxRes.adx >= 17 && diAligned) {
    score += 6;
  } else if (rule === 'RSI_OVERSOLD_BOUNCE' && adxRes.adx < 25) {
    score += 6;
  }

  // 4. Real Wilder RSI(14) + Divergence (max 14 pts)
  const matchingDiv = (isLong && divergence === 'BULLISH') || (!isLong && divergence === 'BEARISH');
  if (rule === 'RSI_OVERSOLD_BOUNCE') {
    if (isLong && (rsi14 <= 36 || (prevRsi < 33 && rsi14 > prevRsi))) {
      score += 9;
      reasons.push(`RSI Oversold ${rsi14.toFixed(1)}`);
    } else if (!isLong && (rsi14 >= 64 || (prevRsi > 67 && rsi14 < prevRsi))) {
      score += 9;
      reasons.push(`RSI Overbought ${rsi14.toFixed(1)}`);
    }
    if (matchingDiv) {
      score += 5;
      reasons.push(isLong ? 'Bullish RSI Divergence' : 'Bearish RSI Divergence');
    }
  } else {
    if (isLong && rsi14 >= 48 && rsi14 <= 69) {
      score += 10;
      reasons.push(`RSI Sehat ${rsi14.toFixed(1)}`);
    } else if (!isLong && rsi14 >= 31 && rsi14 <= 52) {
      score += 10;
      reasons.push(`RSI Bearish ${rsi14.toFixed(1)}`);
    } else if (isLong && rsi14 >= 40 && rsi14 < 48 && rsi14 > prevRsi) {
      score += 7;
    } else if (!isLong && rsi14 > 52 && rsi14 <= 60 && rsi14 < prevRsi) {
      score += 7;
    }
    if (matchingDiv) {
      score += 4;
      reasons.push(isLong ? 'Bullish RSI Div' : 'Bearish RSI Div');
    }
  }

  // 5. MACD Momentum & Histogram Expansion (max 9 pts)
  if (macdCur && macdPrev) {
    const macdBull = macdCur.histogram > 0 && macdCur.histogram >= macdPrev.histogram;
    const macdBear = macdCur.histogram < 0 && macdCur.histogram <= macdPrev.histogram;
    const macdRecoverBull = macdCur.histogram > macdPrev.histogram;
    const macdRecoverBear = macdCur.histogram < macdPrev.histogram;
    if ((isLong && macdBull) || (!isLong && macdBear)) {
      score += 9;
      reasons.push('MACD Ekspansi');
    } else if ((isLong && macdRecoverBull) || (!isLong && macdRecoverBear)) {
      score += 5;
    }
  }

  // 6. Real Candle Volume Spike & Rolling VWAP Position (max 9 pts)
  const vwapAligned = isLong ? close >= vwap * 0.998 : close <= vwap * 1.002;
  if (vwapAligned) {
    score += 4;
    reasons.push(isLong ? 'Di atas VWAP' : 'Di bawah VWAP');
  }
  if (volumeRatio >= 1.35) {
    score += 5;
    reasons.push(`Vol Candle ${volumeRatio.toFixed(1)}x`);
  } else if (volumeRatio >= 1.05) {
    score += 3;
  }

  // 7. Bollinger Anti-Chasing & Pullback Quality (max 8 pts)
  const distFromEma20Atr = atr14 > 0 ? Math.abs(close - ema20) / atr14 : 0;
  const healthyZone =
    isLong ? bb.percentB >= 0.25 && bb.percentB <= 0.92 : bb.percentB >= 0.08 && bb.percentB <= 0.75;
  if (healthyZone && distFromEma20Atr <= 1.8) {
    score += 8;
  } else if (distFromEma20Atr <= 2.3) {
    score += 4;
  }

  // 8. BTC Macro Alignment + Relative Strength vs BTC (max 12 pts)
  if (btcAligned) {
    score += 6;
  }
  if (symbol === 'BTCUSDT') {
    score += 4;
  } else if (isLong) {
    if (rsVsBtc24h >= 1.2) {
      score += 6;
      reasons.push(`RS +${rsVsBtc24h.toFixed(1)}% vs BTC`);
    } else if (rsVsBtc24h >= 0) {
      score += 3;
    } else if (rsVsBtc24h <= -3.5) {
      score -= 4; // Weak laggard is poor for LONG
    }
  } else {
    if (rsVsBtc24h <= -1.2) {
      score += 6;
      reasons.push(`RS ${rsVsBtc24h.toFixed(1)}% vs BTC`);
    } else if (rsVsBtc24h <= 0) {
      score += 3;
    } else if (rsVsBtc24h >= 3.5) {
      score -= 4; // Strong leader is dangerous to SHORT
    }
  }

  // 9. Derivatives Funding Rate Health (max 5 pts)
  if (fundingRate8h !== undefined && Number.isFinite(fundingRate8h)) {
    if (isLong) {
      if (fundingRate8h <= 0.012 && fundingRate8h >= -0.04) {
        score += 5;
        if (fundingRate8h < 0) reasons.push(`Funding ${fundingRate8h.toFixed(3)}% (Sehat)`);
      } else if (fundingRate8h <= 0.03) {
        score += 2;
      }
    } else {
      if (fundingRate8h >= -0.012 && fundingRate8h <= 0.04) {
        score += 5;
        if (fundingRate8h > 0.005) reasons.push(`Funding +${fundingRate8h.toFixed(3)}% (Sehat)`);
      } else if (fundingRate8h >= -0.03) {
        score += 2;
      }
    }
  }

  // === STRICT ANTI-LOSS HARD REJECTS ===
  let hardReject: string | undefined;

  // A. Volatility Regime Guard (ATR% too dead -> eaten by fees; too extreme -> SL wick-out)
  if (atrPercent < 0.35) {
    hardReject = `Volatilitas terlalu rendah (ATR ${atrPercent}% < 0.35%, rawan tergerus fee)`;
  } else if (atrPercent > 4.8) {
    hardReject = `Volatilitas ekstrem (ATR ${atrPercent}% > 4.8%, rawan wick-out SL)`;
  }

  // B. Crowded Funding Rate Guard (Anti Long-Squeeze / Short-Squeeze)
  if (!hardReject && fundingRate8h !== undefined && Number.isFinite(fundingRate8h)) {
    if (isLong && fundingRate8h >= 0.05) {
      hardReject = `Funding terlalu panas (+${fundingRate8h.toFixed(3)}%/8h — rawan Long Squeeze)`;
    } else if (!isLong && fundingRate8h <= -0.05) {
      hardReject = `Funding terlalu negatif (${fundingRate8h.toFixed(3)}%/8h — rawan Short Squeeze)`;
    }
  }

  // C. Last Closed Bar Rejection Wick Guard (don't Long into Shooting Star or Short into Hammer)
  if (!hardReject && rule !== 'RSI_OVERSOLD_BOUNCE') {
    const barRange = Math.max(lastBar.high - lastBar.low, 1e-9);
    const upperWickRatio = (lastBar.high - Math.max(lastBar.open, lastBar.close)) / barRange;
    const lowerWickRatio = (Math.min(lastBar.open, lastBar.close) - lastBar.low) / barRange;
    const significantBar = barRange >= atr14 * 1.05;
    if (isLong && significantBar && upperWickRatio >= 0.6 && lastBar.close < lastBar.open) {
      hardReject = `Candle terakhir bearish rejection (upper wick ${Math.round(upperWickRatio * 100)}%)`;
    } else if (!isLong && significantBar && lowerWickRatio >= 0.6 && lastBar.close > lastBar.open) {
      hardReject = `Candle terakhir bullish rejection / hammer (lower wick ${Math.round(lowerWickRatio * 100)}%)`;
    }
  }

  // D. Anti-FOMO / Anti-Chasing Guard
  if (!hardReject) {
    if (isLong && ((close - ema20) / Math.max(atr14, 1e-9) > 2.6 || rsi14 > 74)) {
      hardReject = `Overextended / FOMO (RSI ${rsi14.toFixed(0)}, jarak EMA20 ${(
        (close - ema20) /
        Math.max(atr14, 1e-9)
      ).toFixed(1)} ATR)`;
    } else if (!isLong && ((ema20 - close) / Math.max(atr14, 1e-9) > 2.6 || rsi14 < 26)) {
      hardReject = `Oversold / telat Short (RSI ${rsi14.toFixed(0)})`;
    }
  }

  // E. Choppy market guard
  if (!hardReject && rule !== 'RSI_OVERSOLD_BOUNCE' && adxRes.adx < 16) {
    hardReject = `Market choppy / sideways (ADX ${adxRes.adx} < 16)`;
  }

  // F. Rule-specific real candle verification
  if (!hardReject) {
    if (rule === 'MOMENTUM_BREAKOUT') {
      const nearBreakLong =
        structure.bosBullish || (resistances[0] ? (resistances[0] - close) / close <= 0.018 : false);
      const nearBreakShort =
        structure.bosBearish || (supports[0] ? (close - supports[0]) / close <= 0.018 : false);
      const breakOk = isLong
        ? (nearBreakLong || (emaBull && lastBar.close > prevBar.high)) && volumeRatio >= 1.1
        : (nearBreakShort || (emaBear && lastBar.close < prevBar.low)) && volumeRatio >= 1.1;
      if (!breakOk) {
        hardReject = `Belum ada konfirmasi breakout + volume candle (${volumeRatio.toFixed(2)}x)`;
      }
    } else if (rule === 'EMA_PULLBACK') {
      const pullbackLong =
        ema20 > ema50 &&
        lastBar.low <= ema20 * 1.012 &&
        lastBar.close > ema20 &&
        lastBar.close >= lastBar.open;
      const pullbackShort =
        ema20 < ema50 &&
        lastBar.high >= ema20 * 0.988 &&
        lastBar.close < ema20 &&
        lastBar.close <= lastBar.open;
      if (!(isLong ? pullbackLong : pullbackShort)) {
        hardReject = 'Belum ada konfirmasi pullback & pantulan EMA 20/50 pada bar tertutup';
      }
    } else if (rule === 'RSI_OVERSOLD_BOUNCE') {
      const revLong = rsi14 <= 36 || (prevRsi < 34 && rsi14 > prevRsi) || divergence === 'BULLISH';
      const revShort = rsi14 >= 64 || (prevRsi > 66 && rsi14 < prevRsi) || divergence === 'BEARISH';
      if (!(isLong ? revLong : revShort)) {
        hardReject = `RSI real (${rsi14.toFixed(1)}) belum di zona reversal & tidak ada divergensi`;
      }
    } else if (rule === 'HIGH_CONVICTION') {
      const htfOk = (isLong && htfTrend === 'Bullish') || (!isLong && htfTrend === 'Bearish');
      if (!htfOk || adxRes.adx < 19 || !diAligned || !(isLong ? emaBull : emaBear)) {
        hardReject = `Konfluensi belum penuh (HTF ${htfTrend}, ADX ${adxRes.adx})`;
      }
    }
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    rsi14: Number(rsi14.toFixed(1)),
    adx14: adxRes.adx,
    volumeRatio,
    atr14,
    atrPercent,
    ema20,
    ema50,
    supports,
    resistances,
    btcAligned,
    reasons: reasons.slice(0, 5),
    hardReject,
  };
}

/**
 * Institutional 8-Layer Futures Pro Scanner (LONG & SHORT):
 * 1) Verified Liquid Futures Universe (excluding ETFs & Gold/Wrapped tokens) + Institutional 24-Coin Pre-Filter (Majors + Watchlist + Sweet-Spot Momentum)
 * 2) Bulk Live Perpetual Funding Rate & OI Fetch (Gate.io / Hyperliquid) + Macro/Unlock Event Guard
 * 3) Closed Real Klines (500 bars TF + 120 bars HTF + BTC HTF)
 * 4) Multi-Factor Confluence (HTF + EMA + ADX/DI + RSI/Div + MACD + VWAP/Vol + RS vs BTC + Funding Health)
 * 5) ATR% Volatility Regime + Last-Bar Rejection Wick + Anti-Chasing Guards
 * 6) Structural POI Quality & Realistic Limit Distance Gate (OB/FVG/OTE/S-R Flip <= 3.8% from live)
 * 7) Directional Anti-Look-Ahead Backtest (500 bars, same direction, fee + slippage aware)
 * 8) Per-Candidate Live OI 24h Change & Long/Short Crowding Check + Structural ATR Risk Plan
 */
export async function runFuturesProScan(
  coins: Coin[],
  coinsMap: Record<string, Coin>,
  watchlist: string[],
  cooldowns: Record<string, number>,
  config: AutoSignalConfig,
  onProgress?: (label: string, pct: number) => void,
): Promise<FuturesProScanOutput> {
  const now = Date.now();
  const cooldownMs = config.cooldownSeconds * 1000;
  const htfTimeframe = getHigherTimeframe(config.timeframe);
  const watchSet = new Set(watchlist);

  onProgress?.('Menyaring likuiditas Futures, Funding Rate & Event Makro...', 8);

  // Exclude tokenized equity/ETF, commodity gold, and wrapped staking derivatives
  const EXCLUDED_FUTURES_BASES = new Set([
    'NVDAB', 'TSLAB', 'AAPLB', 'AMZNB', 'MSFTB', 'METAB', 'GOOGLB', 'MSTRB', 'COINB',
    'SOXLB', 'SOXSB', 'SKHYB', 'KORUB', 'QQQB', 'SPYB', 'SLVB', 'GLDB', 'INTCB', 'AMDB', 'PLTRB',
    'PAXG', 'XAUT', 'WBTC', 'WBETH', 'BETH', 'STETH',
  ]);

  // Stage 1: Universe & Liquidity Filter (STRICTLY verified Futures Perpetual pairs only!)
  let universe = coins.filter((c) => {
    if (!c.hasFutures) return false;
    if (EXCLUDED_FUTURES_BASES.has(c.baseAsset)) return false;
    if (config.universeScope === 'WATCHLIST') {
      return watchSet.has(c.symbol);
    }
    return c.quoteVolume24h >= config.minVolume24hUsd;
  });

  if (config.universeScope === 'TOP_100') {
    universe = [...universe].sort((a, b) => b.quoteVolume24h - a.quoteVolume24h).slice(0, 100);
  }

  const offCooldown = universe.filter((c) => now - (cooldowns[c.symbol] ?? 0) >= cooldownMs);
  const btcCoin = coinsMap.BTCUSDT;
  const btcChange24h = btcCoin?.priceChangePercent24h ?? 0;

  // Bell-curve institutional pre-filter: rewards clean liquid structure & moderate momentum (+1%..+7.5%),
  // penalizes FOMO overextended pumps (>12%) and guarantees Top Majors + Watchlist are ALWAYS scanned!
  const longPreScore = (c: Coin): number => {
    const volLog = Math.log10(Math.max(c.quoteVolume24h, 100_000));
    const range = Math.max(c.high24h - c.low24h, c.price * 0.005);
    const pos = (c.price - c.low24h) / range;
    const rs = c.priceChangePercent24h - btcChange24h;
    if (config.rule === 'RSI_OVERSOLD_BOUNCE') {
      const dipSweetSpot =
        c.priceChangePercent24h <= -1.5 && c.priceChangePercent24h >= -9 ? 10 : 2;
      return dipSweetSpot + (pos <= 0.35 ? 6 : 0) + volLog * 4;
    }
    const chg = c.priceChangePercent24h;
    // Sweet spot: healthy +1.0% to +7.5% trend (penalize >12% parabolic chasing)
    const momScore =
      chg >= 1.0 && chg <= 7.5
        ? 12 - Math.abs(chg - 4.0) * 0.8
        : chg > 7.5 && chg <= 12
          ? 6
          : chg > 12
            ? -5
            : chg >= -1.0
              ? 4
              : -3;
    const healthyPullbackPos = pos >= 0.45 && pos <= 0.88 ? 6 : pos > 0.94 ? -3 : 1;
    const rsBonus = Math.max(-4, Math.min(6, rs * 0.9));
    return momScore + healthyPullbackPos + rsBonus + volLog * 4.2;
  };

  const shortPreScore = (c: Coin): number => {
    const volLog = Math.log10(Math.max(c.quoteVolume24h, 100_000));
    const range = Math.max(c.high24h - c.low24h, c.price * 0.005);
    const pos = (c.price - c.low24h) / range;
    const rs = c.priceChangePercent24h - btcChange24h;
    if (config.rule === 'RSI_OVERSOLD_BOUNCE') {
      const pumpSweetSpot =
        c.priceChangePercent24h >= 1.5 && c.priceChangePercent24h <= 9 ? 10 : 2;
      return pumpSweetSpot + (pos >= 0.65 ? 6 : 0) + volLog * 4;
    }
    const chg = c.priceChangePercent24h;
    // Sweet spot: healthy -1.0% to -7.5% breakdown (penalize <-12% late chasing)
    const momScore =
      chg <= -1.0 && chg >= -7.5
        ? 12 - Math.abs(chg + 4.0) * 0.8
        : chg < -7.5 && chg >= -12
          ? 6
          : chg < -12
            ? -5
            : chg <= 1.0
              ? 4
              : -3;
    const healthyPullbackPos = pos >= 0.12 && pos <= 0.55 ? 6 : pos < 0.06 ? -3 : 1;
    const rsBonus = Math.max(-4, Math.min(6, -rs * 0.9));
    return momScore + healthyPullbackPos + rsBonus + volLog * 4.2;
  };

  // Assemble up to 24 high-quality candidates:
  // Always anchor Top 6 liquid majors + Watchlist (max 8) so clean blue-chip setups are never missed!
  const candidateMap = new Map<string, Coin>();
  const addCandidates = (list: Coin[], maxAdd: number) => {
    let added = 0;
    for (const c of list) {
      if (added >= maxAdd) break;
      if (!candidateMap.has(c.symbol)) {
        candidateMap.set(c.symbol, c);
        added += 1;
      }
    }
  };

  if (config.universeScope === 'WATCHLIST') {
    addCandidates(
      [...offCooldown].sort((a, b) => b.quoteVolume24h - a.quoteVolume24h),
      24,
    );
  } else {
    const topLiquidMajors = [...offCooldown]
      .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h)
      .slice(0, 6);
    const watchLiquid = offCooldown
      .filter((c) => watchSet.has(c.symbol))
      .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h)
      .slice(0, 4);

    addCandidates(topLiquidMajors, 6);
    addCandidates(watchLiquid, 2);

    if (config.directionFilter === 'LONG_ONLY') {
      addCandidates([...offCooldown].sort((a, b) => longPreScore(b) - longPreScore(a)), 16);
    } else if (config.directionFilter === 'SHORT_ONLY') {
      addCandidates([...offCooldown].sort((a, b) => shortPreScore(b) - shortPreScore(a)), 16);
    } else {
      addCandidates([...offCooldown].sort((a, b) => longPreScore(b) - longPreScore(a)), 8);
      addCandidates([...offCooldown].sort((a, b) => shortPreScore(b) - shortPreScore(a)), 8);
    }
  }

  const rankedCandidates = Array.from(candidateMap.values()).slice(0, 24);

  // Stage 2: Parallel fetch BTC HTF Trend + Bulk Perpetual Funding/OI Map + Calendar/Unlock Events
  onProgress?.(`Cek HTF BTC (${htfTimeframe.toUpperCase()}) & Funding Rate Perpetual...`, 16);
  const [{ candles: btcHtfRaw }, bulkPerpMap] = await Promise.all([
    fetchBinanceKlines('BTCUSDT', htfTimeframe, 120, btcCoin?.price),
    fetchBulkPerpMetricsMap(),
  ]);
  const btcHtfClosed = btcHtfRaw.length > 2 ? btcHtfRaw.slice(0, -1) : btcHtfRaw;
  const btcHtfTrend = evaluateSingleTimeframeTrend(btcHtfClosed, htfTimeframe).trend;

  // Macro & Cliff Unlock calendar cross-reference
  const calEvents = getMacroAndUnlockEvents(now);
  const imminentUnlockSymbols = new Set(
    calEvents
      .filter(
        (ev) =>
          ev.category === 'Token Unlock' &&
          ev.symbol &&
          (ev.unlockSupplyPercent ?? 0) >= 1.0 &&
          ev.timestamp >= now &&
          ev.timestamp - now <= 72 * 3600 * 1000,
      )
      .map((ev) => ev.symbol!),
  );
  const imminentHighMacro = calEvents.find(
    (ev) =>
      ev.category !== 'Token Unlock' &&
      ev.impact === 'High' &&
      ev.timestamp >= now &&
      ev.timestamp - now <= 4 * 3600 * 1000,
  );

  if (rankedCandidates.length === 0) {
    return {
      report: {
        scannedAt: now,
        timeframe: config.timeframe,
        htfTimeframe,
        rule: config.rule,
        universeCount: universe.length,
        evaluatedCount: 0,
        passedCount: 0,
        btcHtfTrend,
        audits: [],
      },
      signals: [],
    };
  }

  // Stage 3-8: Evaluate all 24 candidates on REAL 500 closed Klines + Directional Backtest + Live Derivatives
  const strategy = mapRuleToStrategy(config.rule);
  let doneCount = 0;

  interface CandidateResult {
    audit: FuturesScanCandidateAudit;
    signal?: { log: AutoSignalLog; setup: TradeSetup };
    rankWeight: number;
  }

  const evaluated = await runInBatches<Coin, CandidateResult>(
    rankedCandidates,
    4,
    async (coin) => {
      const [{ candles: primaryRaw }, { candles: htfRaw }] = await Promise.all([
        fetchBinanceKlines(coin.symbol, config.timeframe, 500, coin.price),
        fetchBinanceKlines(coin.symbol, htfTimeframe, 120, coin.price),
      ]);

      doneCount += 1;
      onProgress?.(
        `Validasi Kline 500b, Funding & POI (${doneCount}/${rankedCandidates.length}: ${coin.baseAsset})...`,
        20 + Math.round((doneCount / rankedCandidates.length) * 72),
      );

      const closed = primaryRaw.length > 60 ? primaryRaw.slice(0, -1) : primaryRaw;
      const htfClosed = htfRaw.length > 35 ? htfRaw.slice(0, -1) : htfRaw;
      const htfTrend = evaluateSingleTimeframeTrend(htfClosed, htfTimeframe).trend;
      const rsVsBtc24h = Number((coin.priceChangePercent24h - btcChange24h).toFixed(2));
      const bulkMetric = bulkPerpMap.get(coin.symbol);
      let fundingRate8h = bulkMetric?.fundingRate8h;

      // Evaluate LONG & SHORT objectively and pick best valid direction per directionFilter
      const longEval = evaluateFuturesDirectionScore(
        'LONG',
        closed,
        htfTrend,
        btcHtfTrend,
        config.rule,
        coin.symbol,
        rsVsBtc24h,
        fundingRate8h,
      );
      const shortEval = evaluateFuturesDirectionScore(
        'SHORT',
        closed,
        htfTrend,
        btcHtfTrend,
        config.rule,
        coin.symbol,
        rsVsBtc24h,
        fundingRate8h,
      );

      let chosenDir: TradeDirection = 'LONG';
      let chosenEval = longEval;

      if (config.directionFilter === 'SHORT_ONLY') {
        chosenDir = 'SHORT';
        chosenEval = shortEval;
      } else if (config.directionFilter === 'BOTH') {
        const longValid = !longEval.hardReject;
        const shortValid = !shortEval.hardReject;
        if (shortValid && !longValid) {
          chosenDir = 'SHORT';
          chosenEval = shortEval;
        } else if (longValid && !shortValid) {
          chosenDir = 'LONG';
          chosenEval = longEval;
        } else if (shortEval.score > longEval.score) {
          chosenDir = 'SHORT';
          chosenEval = shortEval;
        }
      }

      // Compute institutional Limit Pullback POI Levels (OB / FVG / OTE / S-R Flip) instead of market chasing
      const smartPoi = buildSmartFuturesLevels(closed, coin.price, chosenDir, 1.5, 'POI_LIMIT');

      // Structural POI bonus/penalty (genuine OB/FVG/OTE > SR_FLIP > EMA_VWAP fallback)
      let adjustedScore = chosenEval.score;
      if (smartPoi.poiKind === 'OB' || smartPoi.poiKind === 'FVG' || smartPoi.poiKind === 'OTE') {
        adjustedScore = Math.min(100, adjustedScore + 4);
      } else if (smartPoi.poiKind === 'SR_FLIP') {
        adjustedScore = Math.min(100, adjustedScore + 2);
      } else if (config.rule === 'HIGH_CONVICTION') {
        adjustedScore = Math.max(0, adjustedScore - 4);
      }

      // Run DIRECTIONAL Anti-Look-Ahead Backtest on 500 real closed candles with slippage
      const bt = runBacktest(closed, {
        symbol: coin.symbol,
        strategy,
        timeframe: config.timeframe,
        targetRR: 2.2,
        atrMultiplier: 1.5,
        feeRate: 0.001,
        slippageRate: 0.0004,
        directionFilter: chosenDir,
      });

      const slDist = Math.abs(smartPoi.avgEntry - smartPoi.stopLoss);
      const nearestSup = chosenEval.supports[0];
      const nearestRes = chosenEval.resistances[0];
      const opposingDist =
        chosenDir === 'LONG'
          ? nearestRes && nearestRes > smartPoi.avgEntry
            ? nearestRes - smartPoi.avgEntry
            : slDist * 2.5
          : nearestSup && nearestSup < smartPoi.avgEntry
            ? smartPoi.avgEntry - nearestSup
            : slDist * 2.5;
      const rrToResistance = Number((opposingDist / Math.max(slDist, 1e-9)).toFixed(2));

      // Apply ALL Institutional Anti-Loss Quality Gates in strict order
      let rejectReason = chosenEval.hardReject;

      if (!rejectReason && chosenDir === 'LONG' && imminentUnlockSymbols.has(coin.symbol)) {
        rejectReason = `Waspada Cliff Token Unlock besar < 72 jam — hindari LONG`;
      }
      if (!rejectReason && config.requireBtcAlignment && !chosenEval.btcAligned) {
        rejectReason = `Melawan trend HTF BTC (${btcHtfTrend})`;
      }
      if (!rejectReason && Math.abs(smartPoi.poiDistancePercent) > 3.8) {
        rejectReason = `Zona Limit POI terlalu jauh (${smartPoi.poiDistancePercent}% > 3.8% dari live)`;
      }
      if (!rejectReason && rrToResistance < 1.2) {
        rejectReason = `Ruang dari Limit POI ke ${chosenDir === 'LONG' ? 'Resistance' : 'Support'} terlalu sempit (R:R ${rrToResistance} < 1.20)`;
      }
      if (!rejectReason && bt.totalTrades < 4) {
        rejectReason = `Sampel backtest ${chosenDir} terlalu sedikit (${bt.totalTrades} trade / 500 bar)`;
      }
      if (!rejectReason && GRADE_RANK[bt.grade] < GRADE_RANK[config.minBacktestGrade]) {
        rejectReason = `Backtest ${chosenDir} Grade ${bt.grade} < min ${config.minBacktestGrade} (PF ${bt.profitFactor})`;
      }
      if (!rejectReason && bt.profitFactor < config.minProfitFactor) {
        rejectReason = `Backtest ${chosenDir} PF ${bt.profitFactor} < min ${config.minProfitFactor}`;
      }

      // Deep per-coin Live Derivatives check (OI 24h Change & Long/Short Crowding) ONLY for finalists!
      let openInterestChange24h: number | undefined;
      const extraReasons: string[] = [];

      if (!rejectReason) {
        try {
          const deriv = await fetchDerivativesSnapshot(coin);
          if (!deriv.isMock) {
            fundingRate8h = deriv.fundingRate8h;
            if (chosenDir === 'LONG' && deriv.fundingRate8h >= 0.05) {
              rejectReason = `Funding live panas (+${deriv.fundingRate8h.toFixed(3)}%/8h — rawan Long Squeeze)`;
            } else if (chosenDir === 'SHORT' && deriv.fundingRate8h <= -0.05) {
              rejectReason = `Funding live negatif ekstrem (${deriv.fundingRate8h.toFixed(3)}%/8h — rawan Short Squeeze)`;
            }

            if (!rejectReason && deriv.oiChangeAvailable) {
              openInterestChange24h = deriv.openInterestChange24h;
              if (deriv.openInterestChange24h >= 2.0) {
                adjustedScore = Math.min(100, adjustedScore + 4);
                extraReasons.push(`OI 24h +${deriv.openInterestChange24h.toFixed(1)}% (Uang Baru)`);
              } else if (deriv.openInterestChange24h <= -6.0) {
                adjustedScore = Math.max(0, adjustedScore - 3);
              }
            }

            if (!rejectReason && deriv.longShortAvailable) {
              if (chosenDir === 'LONG' && deriv.longRatioPercent >= 74) {
                adjustedScore = Math.max(0, adjustedScore - 5);
              } else if (chosenDir === 'SHORT' && deriv.shortRatioPercent >= 74) {
                adjustedScore = Math.max(0, adjustedScore - 5);
              }
            }
          }
        } catch {
          // Non-fatal: bulk funding metric already checked
        }
      }

      if (!rejectReason && adjustedScore < config.minConfluenceScore) {
        rejectReason = `Skor Konfluensi ${adjustedScore}/100 < batas ${config.minConfluenceScore}`;
      }

      if (imminentHighMacro) {
        extraReasons.push(`⚠️ Event ${imminentHighMacro.title} <4j`);
      }

      const passed = !rejectReason;
      const mergedReasons = [
        `Limit ${smartPoi.poiLabel} (${smartPoi.poiDistancePercent >= 0 ? '+' : ''}${smartPoi.poiDistancePercent}%)`,
        ...extraReasons,
        ...chosenEval.reasons,
      ].slice(0, 5);

      const audit: FuturesScanCandidateAudit = {
        symbol: coin.symbol,
        baseAsset: coin.baseAsset,
        direction: chosenDir,
        passed,
        confluenceScore: adjustedScore,
        backtestGrade: bt.grade,
        profitFactor: bt.profitFactor,
        winRate: bt.winRate,
        rsi14: chosenEval.rsi14,
        adx14: chosenEval.adx14,
        volumeRatio: chosenEval.volumeRatio,
        htfTrend,
        btcAligned: chosenEval.btcAligned,
        rrToResistance,
        poiLabel: smartPoi.poiLabel,
        poiKind: smartPoi.poiKind,
        poiEntryPrice: smartPoi.entry1,
        poiDistancePercent: smartPoi.poiDistancePercent,
        fundingRate8h,
        openInterestChange24h,
        rsVsBtc24h,
        atrPercent: chosenEval.atrPercent,
        reasons: mergedReasons,
        rejectReason,
      };

      if (!passed) {
        return { audit, rankWeight: adjustedScore };
      }

      // Build Production Futures Limit POI Layering Setup & Signal Log
      const risk = calculateFuturesRisk({
        direction: chosenDir,
        entries: [
          { price: smartPoi.entry1, weightPercent: 40 },
          { price: smartPoi.entry2, weightPercent: 35 },
          { price: smartPoi.entry3, weightPercent: 25 },
        ],
        stopLoss: smartPoi.stopLoss,
        takeProfits: [
          { label: 'TP1', price: smartPoi.tp1, allocationPercent: 40 },
          { label: 'TP2', price: smartPoi.tp2, allocationPercent: 35 },
          { label: 'TP3', price: smartPoi.tp3, allocationPercent: 25 },
        ],
        accountEquity: config.defaultFuturesEquity,
        riskPercent: config.defaultRiskPercent,
        leverage: Math.min(config.defaultLeverage, smartPoi.recommendedLeverage),
      });

      const fundingTag =
        fundingRate8h !== undefined
          ? ` | Fund ${fundingRate8h >= 0 ? '+' : ''}${fundingRate8h.toFixed(3)}%`
          : '';
      const oiTag =
        openInterestChange24h !== undefined
          ? ` | OI ${openInterestChange24h >= 0 ? '+' : ''}${openInterestChange24h.toFixed(1)}%`
          : '';
      const summary = `Limit ${smartPoi.poiLabel} (${smartPoi.poiDistancePercent >= 0 ? '+' : ''}${smartPoi.poiDistancePercent}%) | Skor ${adjustedScore} · BT ${chosenDir} ${bt.grade} (PF ${bt.profitFactor}, ${bt.totalTrades}t)${fundingTag}${oiTag} | RS ${rsVsBtc24h >= 0 ? '+' : ''}${rsVsBtc24h}% vs BTC`;

      const log: AutoSignalLog = {
        id: generateId('sig'),
        symbol: coin.symbol,
        baseAsset: coin.baseAsset,
        mode: 'FUTURES',
        rule: config.rule,
        direction: chosenDir,
        timeframe: config.timeframe,
        entryPrice: smartPoi.entry1,
        entry2: smartPoi.entry2,
        entry3: smartPoi.entry3,
        poiLabel: smartPoi.poiLabel,
        stopLoss: smartPoi.stopLoss,
        takeProfit: smartPoi.tp2,
        rrRatio: risk.netRrTp2,
        confluenceScore: adjustedScore,
        rsiReal: chosenEval.rsi14,
        adxReal: chosenEval.adx14,
        fundingRate8h,
        openInterestChange24h,
        rsVsBtc24h,
        atrPercent: chosenEval.atrPercent,
        reasons: mergedReasons,
        scoreOrGrade: `Skor ${adjustedScore} · BT ${bt.grade}`,
        summary,
        telegramSent: false,
        savedToJournal: false,
        createdAt: now,
      };

      const setup: TradeSetup = {
        id: generateId('fut'),
        symbol: coin.symbol,
        baseAsset: coin.baseAsset,
        direction: chosenDir,
        timeframe: config.timeframe,
        entryMode: 'LAYERING',
        entries: [
          { price: smartPoi.entry1, weightPercent: 40 },
          { price: smartPoi.entry2, weightPercent: 35 },
          { price: smartPoi.entry3, weightPercent: 25 },
        ],
        avgEntry: risk.avgEntry,
        stopLoss: smartPoi.stopLoss,
        takeProfits: [
          { label: 'TP1', price: smartPoi.tp1, allocationPercent: 40 },
          { label: 'TP2', price: smartPoi.tp2, allocationPercent: 35 },
          { label: 'TP3', price: smartPoi.tp3, allocationPercent: 25 },
        ],
        accountEquity: config.defaultFuturesEquity,
        riskPercent: config.defaultRiskPercent,
        leverage: Math.min(config.defaultLeverage, smartPoi.recommendedLeverage),
        riskAmountUsdt: risk.riskAmountUsdt,
        positionSizeUsdt: risk.positionSizeUsdt,
        positionQty: risk.positionQty,
        marginRequiredUsdt: risk.marginRequiredUsdt,
        estimatedLiquidation: risk.estimatedLiquidation,
        rrTp1: risk.netRrTp1,
        rrTp2: risk.netRrTp2,
        rrTp3: risk.netRrTp3,
        btcBetaAligned: chosenEval.btcAligned,
        confluenceChecks: [
          `Limit POI: ${smartPoi.poiLabel}`,
          `Directional BT ${chosenDir}: Grade ${bt.grade} · PF ${bt.profitFactor} (${bt.totalTrades} trade)`,
          ...(fundingRate8h !== undefined
            ? [`Funding 8h: ${fundingRate8h >= 0 ? '+' : ''}${fundingRate8h.toFixed(4)}%`]
            : []),
          ...chosenEval.reasons,
        ],
        notes: summary,
        status: 'Waiting',
        source: 'AutoBot',
        createdAt: now,
        updatedAt: now,
      };

      return {
        audit,
        signal: { log, setup },
        rankWeight: adjustedScore * Math.min(bt.profitFactor, 3),
      };
    },
  );

  const sorted = [...evaluated].sort((a, b) => {
    if (a.audit.passed !== b.audit.passed) return a.audit.passed ? -1 : 1;
    return b.rankWeight - a.rankWeight;
  });

  // Cap emitted alerts per scan cycle to Top 3 highest-conviction signals to keep focus sharp
  const topSignals = sorted
    .filter((item): item is CandidateResult & { signal: { log: AutoSignalLog; setup: TradeSetup } } =>
      Boolean(item.signal),
    )
    .slice(0, 3)
    .map((item) => item.signal);

  onProgress?.('Selesai memvalidasi 8-Layer Futures Pro (Kline + Funding/OI + POI).', 100);

  return {
    report: {
      scannedAt: now,
      timeframe: config.timeframe,
      htfTimeframe,
      rule: config.rule,
      universeCount: universe.length,
      evaluatedCount: sorted.length,
      passedCount: sorted.filter((x) => x.audit.passed).length,
      btcHtfTrend,
      audits: sorted.map((x) => x.audit),
    },
    signals: topSignals,
  };
}

export interface SpotFunnelScanOutput {
  report: SpotFunnelReport;
  signals: Array<{
    log: AutoSignalLog;
    spotSetup: SpotSetup;
  }>;
}

/**
 * 100-Coin Institutional Spot Accumulation Funnel:
 * Top 100 Coins -> Stage 1: Outperformance vs BTC -> Stage 2: Tokenomics (MCap/FDV & Unlock) ->
 * Stage 3: Real Binance 1D + 4H Trend Structure -> Stage 4: Layak Watchlist + 3-Layer DCA Plan.
 */
export async function runSpot100FunnelScan(
  coins: Coin[],
  coinsMap: Record<string, Coin>,
  cooldowns: Record<string, number>,
  config: AutoSignalConfig,
  forceRefreshTokenomics = false,
  onProgress?: (label: string, pct: number) => void,
): Promise<SpotFunnelScanOutput> {
  const now = Date.now();
  const cooldownMs = config.cooldownSeconds * 1000;

  onProgress?.('Mengambil data Top 100 Market Cap & Tokenomics...', 12);
  const { records: top100, isFallback: isTokenomicsFallback } = await fetchTop100Tokenomics(
    coins,
    forceRefreshTokenomics,
  );

  // BTC benchmark performance across 24h, 7d, 30d
  const btcRec = top100.find((r) => r.symbol === 'BTCUSDT');
  const btcCoin = coinsMap.BTCUSDT;
  const btcBench24h = btcRec?.change24hPercent ?? btcCoin?.priceChangePercent24h ?? 0;
  const btcBench7d = btcRec?.change7dPercent ?? 0;
  const btcBench30d = btcRec?.change30dPercent ?? 0;

  // Cross-reference upcoming high-impact cliff token unlocks within 14 days
  const upcomingUnlocks = getMacroAndUnlockEvents(now);
  const heavyUnlockSymbols = new Set(
    upcomingUnlocks
      .filter(
        (ev) =>
          ev.category === 'Token Unlock' &&
          ev.symbol &&
          (ev.unlockSupplyPercent ?? 0) >= 1.0 &&
          ev.timestamp - now <= 14 * 24 * 3600 * 1000,
      )
      .map((ev) => ev.symbol!),
  );

  onProgress?.('Tahap 1/4: Menyaring Outperformance vs BTC dari 100 coin...', 28);

  // === STAGE 1 & STAGE 2 (fast, synchronous over all 100 coins) ===
  const candidates: SpotFunnelCandidate[] = top100.map((rec) => {
    const liveCoin = coinsMap[rec.symbol];
    const price = liveCoin?.price ?? 0;
    const quoteVolume24h = liveCoin?.quoteVolume24h ?? 0;
    const change24h = liveCoin?.priceChangePercent24h ?? rec.change24hPercent;

    // Stage 1: Relative Strength vs BTC
    const rsVsBtc24h = Number((change24h - btcBench24h).toFixed(2));
    const rsVsBtc7d = Number((rec.change7dPercent - btcBench7d).toFixed(2));
    const rsVsBtc30d = Number((rec.change30dPercent - btcBench30d).toFixed(2));
    const compositeAlpha = 0.25 * rsVsBtc24h + 0.4 * rsVsBtc7d + 0.35 * rsVsBtc30d;

    const beatWindows =
      (rsVsBtc24h > 0 ? 1 : 0) + (rsVsBtc7d > 0 ? 1 : 0) + (rsVsBtc30d > 0 ? 1 : 0);

    const rawOutperf = 50 + compositeAlpha * 2.2 + (beatWindows - 1.5) * 8;
    const outperformanceScore = Math.max(0, Math.min(100, Math.round(rawOutperf)));

    const isBtcAnchor = rec.symbol === 'BTCUSDT';
    const passedOutperformance =
      quoteVolume24h >= 2_000_000 &&
      (isBtcAnchor
        ? rec.change7dPercent >= -3 || change24h >= 0
        : compositeAlpha > 0.3 || beatWindows >= 2);

    // Stage 2: Tokenomics Health (MCap/FDV Float, Supply Cap, Unlock Overhang, Liquidity)
    const floatPct = Math.round(rec.mcapToFdvRatio * 100);
    const hasMaxSupply = rec.maxSupply !== null && rec.maxSupply > 0;
    const hasUpcomingHeavyUnlock = heavyUnlockSymbols.has(rec.symbol);

    let tokScore = 30;
    if (rec.mcapToFdvRatio >= 0.85) tokScore += 42;
    else if (rec.mcapToFdvRatio >= 0.7) tokScore += 34;
    else if (rec.mcapToFdvRatio >= config.minMcapFdvRatio) tokScore += 24;
    else tokScore += Math.round(rec.mcapToFdvRatio * 22);

    if (hasMaxSupply) tokScore += 10;
    else if (rec.mcapToFdvRatio >= 0.9) tokScore += 6;

    if (rec.marketCapRank <= 25) tokScore += 10;
    else if (rec.marketCapRank <= 60) tokScore += 6;
    else tokScore += 3;

    if (quoteVolume24h >= 50_000_000) tokScore += 8;
    else if (quoteVolume24h >= 10_000_000) tokScore += 5;

    if (hasUpcomingHeavyUnlock) tokScore -= 14;
    const tokenomicsScore = Math.max(0, Math.min(100, Math.round(tokScore)));

    const tokParts = [`Float ${floatPct}%`];
    if (hasMaxSupply) tokParts.push('Max Supply Cap');
    if (hasUpcomingHeavyUnlock) tokParts.push('Waspada Cliff Unlock <14h');
    const tokenomicsNote = tokParts.join(' · ');

    const minSpotVol = Math.max(config.minVolume24hUsd * 0.5, 3_000_000);
    const passedTokenomics =
      passedOutperformance &&
      rec.mcapToFdvRatio >= config.minMcapFdvRatio &&
      quoteVolume24h >= minSpotVol &&
      tokenomicsScore >= 55;

    let rejectReason: string | undefined;
    if (!passedOutperformance) {
      rejectReason =
        quoteVolume24h < 2_000_000
          ? 'Likuiditas Binance < $2M'
          : `Underperform BTC (7D ${rsVsBtc7d >= 0 ? '+' : ''}${rsVsBtc7d}%, 30D ${rsVsBtc30d >= 0 ? '+' : ''}${rsVsBtc30d}%)`;
    } else if (!passedTokenomics) {
      if (rec.mcapToFdvRatio < config.minMcapFdvRatio) {
        rejectReason = `Float MCap/FDV ${floatPct}% < batas ${Math.round(config.minMcapFdvRatio * 100)}% (risiko dilusi)`;
      } else if (quoteVolume24h < minSpotVol) {
        rejectReason = `Volume 24h terlalu tipis untuk akumulasi Spot`;
      } else {
        rejectReason = `Skor Tokenomic ${tokenomicsScore}/100 belum lolos`;
      }
    }

    return {
      symbol: rec.symbol,
      baseAsset: rec.baseAsset,
      name: rec.name,
      sector: liveCoin?.sector ?? 'Altcoin',
      price,
      marketCapRank: rec.marketCapRank,
      marketCapUsd: rec.marketCapUsd,
      fdvUsd: rec.fdvUsd,
      quoteVolume24h,
      change24h,
      change7d: rec.change7dPercent,
      change30d: rec.change30dPercent,
      rsVsBtc24h,
      rsVsBtc7d,
      rsVsBtc30d,
      outperformanceScore,
      passedOutperformance,
      mcapFdvRatio: rec.mcapToFdvRatio,
      hasMaxSupply,
      hasUpcomingHeavyUnlock,
      tokenomicsScore,
      tokenomicsNote,
      passedTokenomics,
      passedTrend: false,
      finalScore: Math.round(outperformanceScore * 0.45 + tokenomicsScore * 0.55),
      stageReached: !passedOutperformance
        ? 'FAILED_OUTPERFORMANCE'
        : !passedTokenomics
          ? 'FAILED_TOKENOMICS'
          : 'FAILED_TREND',
      rejectReason,
      highlights: [],
    };
  });

  const stage1Count = candidates.filter((c) => c.passedOutperformance).length;
  const stage2Survivors = candidates
    .filter((c) => c.passedTokenomics)
    .sort(
      (a, b) =>
        b.outperformanceScore * 0.5 +
        b.tokenomicsScore * 0.5 -
        (a.outperformanceScore * 0.5 + a.tokenomicsScore * 0.5),
    );
  const stage2Count = stage2Survivors.length;

  // Evaluate up to Top 25 Stage 2 survivors with REAL Binance 1D & 4H Klines for Stage 3 (Trend) & Stage 4 (Layak Watchlist)
  const trendEvalPool = stage2Survivors.slice(0, 25);
  const skippedFromPool = stage2Survivors.slice(25);
  for (const s of skippedFromPool) {
    s.rejectReason = 'Peringkat Outperformance+Tokenomic di luar Top 25 kandidat Trend';
  }

  onProgress?.(
    `Tahap 3/4: Analisa Trend 1D + 4H real (${trendEvalPool.length} kandidat lolos Tokenomic)...`,
    45,
  );

  let trendDone = 0;
  const signals: Array<{ log: AutoSignalLog; spotSetup: SpotSetup }> = [];

  await runInBatches(trendEvalPool, 5, async (cand) => {
    const liveCoin = coinsMap[cand.symbol];
    const [{ candles: d1Raw }, { candles: h4Raw }] = await Promise.all([
      fetchBinanceKlines(cand.symbol, '1d', 200, cand.price),
      fetchBinanceKlines(cand.symbol, '4h', 120, cand.price),
    ]);

    trendDone += 1;
    onProgress?.(
      `Tahap 3/4: Validasi Trend 1D/4H (${trendDone}/${trendEvalPool.length}: ${cand.baseAsset})...`,
      45 + Math.round((trendDone / Math.max(trendEvalPool.length, 1)) * 48),
    );

    const d1Closed = d1Raw.length > 35 ? d1Raw.slice(0, -1) : d1Raw;
    const h4Closed = h4Raw.length > 35 ? h4Raw.slice(0, -1) : h4Raw;

    const sum1d = buildTechnicalSummary(d1Closed);
    const mtf1d = evaluateSingleTimeframeTrend(d1Closed, '1d');
    const mtf4h = evaluateSingleTimeframeTrend(h4Closed, '4h');
    const struct1d = detectMarketStructure(d1Closed);
    const struct4h = detectMarketStructure(h4Closed);
    const adx1d = calculateADX(d1Closed, 14);
    const lastClose1d = d1Closed[d1Closed.length - 1]?.close ?? cand.price;
    const distAboveEma20Pct =
      sum1d.ema20 > 0 ? ((lastClose1d - sum1d.ema20) / sum1d.ema20) * 100 : 0;

    // Score Daily + 4H Accumulation Trend (0-100)
    let trendScore = 30;
    if (lastClose1d > sum1d.ema20) trendScore += 14;
    else if (lastClose1d >= sum1d.ema20 * 0.96) trendScore += 7;
    if (lastClose1d > sum1d.ema50) trendScore += 16;
    if (sum1d.ema20 > sum1d.ema50) trendScore += 12;
    if (lastClose1d > sum1d.ema200) trendScore += 10;

    if (mtf4h.trend === 'Bullish') trendScore += 14;
    else if (mtf4h.trend === 'Sideways') trendScore += 5;
    else trendScore -= 10;

    if (struct1d.structure === 'UPTREND_HH_HL' || struct1d.bosBullish) trendScore += 8;
    else if (struct4h.structure === 'UPTREND_HH_HL' || struct4h.bosBullish) trendScore += 6;
    else if (struct1d.structure === 'DOWNTREND_LH_LL') trendScore -= 8;

    if (sum1d.rsi14 >= 42 && sum1d.rsi14 <= 68) trendScore += 8;
    else if (sum1d.rsi14 >= 36 && sum1d.rsi14 < 42 && mtf4h.trend === 'Bullish') trendScore += 6;
    else if (sum1d.rsi14 > 75) trendScore -= 14; // Overextended FOMO

    if (adx1d.adx >= 18 && adx1d.plusDI > adx1d.minusDI) trendScore += 6;
    trendScore = Math.max(0, Math.min(100, Math.round(trendScore)));

    cand.trend1d = mtf1d.trend;
    cand.trend4h = mtf4h.trend;
    cand.rsi1d = Number(sum1d.rsi14.toFixed(1));
    cand.rsi4h = mtf4h.rsi;
    cand.emaStructure1d = mtf1d.emaAlignment;
    cand.trendScore = trendScore;

    // Stage 3 Gate:
    // Path A (Uptrend Continuation): 1D Bullish/Sideways + 4H not Bearish + not overextended
    // Path B (Early Accumulation Base during macro correction): 4H Bullish + 4H HH/HL or BOS + 1D RSI >= 38 + strong RS vs BTC
    const isOverextended = sum1d.rsi14 > 75 || distAboveEma20Pct > 22;
    const isUptrendPass =
      mtf1d.trend !== 'Bearish' &&
      mtf4h.trend !== 'Bearish' &&
      !(lastClose1d < sum1d.ema50 && struct1d.structure === 'DOWNTREND_LH_LL') &&
      trendScore >= 56;
    const isEarlyAccumulationBase =
      btcBench30d < -8 &&
      mtf4h.trend === 'Bullish' &&
      (struct4h.structure === 'UPTREND_HH_HL' || struct4h.bosBullish || lastClose1d >= sum1d.ema20 * 0.96) &&
      sum1d.rsi14 >= 38 &&
      sum1d.rsi14 <= 68 &&
      cand.rsVsBtc7d >= 4 &&
      cand.rsVsBtc30d >= 0 &&
      trendScore >= 46;

    cand.passedTrend = !isOverextended && (isUptrendPass || isEarlyAccumulationBase);

    if (!cand.passedTrend) {
      cand.stageReached = 'FAILED_TREND';
      cand.rejectReason = isOverextended
        ? `Terlalu tinggi / FOMO (RSI 1D ${cand.rsi1d}, +${distAboveEma20Pct.toFixed(1)}% dari EMA20)`
        : mtf1d.trend === 'Bearish'
          ? `Struktur 1D Bearish & belum ada konfirmasi reversal 4H cukup kuat (${mtf1d.emaAlignment})`
          : `Skor Trend 1D/4H ${trendScore}/100 belum cukup kuat`;
      cand.finalScore = Math.round(
        cand.outperformanceScore * 0.25 + cand.tokenomicsScore * 0.25 + trendScore * 0.5,
      );
      return;
    }

    // Stage 4: Layak Watchlist + Real 1D Support 3-Layer DCA & Moonbag Plan
    const spotQuality = liveCoin
      ? evaluateSpotQuality(liveCoin, d1Closed)
      : { totalScore: 68, tier: 'Growth' as const, verdict: '', pillars: [] };

    const finalScore = Math.min(
      100,
      Math.round(
        cand.outperformanceScore * 0.25 +
          cand.tokenomicsScore * 0.25 +
          trendScore * 0.3 +
          spotQuality.totalScore * 0.2,
      ),
    );
    cand.finalScore = finalScore;

    const tier: 'Core' | 'Growth' | 'High-Risk' =
      finalScore >= 78 && cand.mcapFdvRatio >= 0.72 && mtf1d.trend !== 'Bearish'
        ? 'Core'
        : finalScore >= 65
          ? 'Growth'
          : 'High-Risk';
    cand.tier = tier;

    const { supports } = detectSupportResistance(d1Closed);
    const plan = generateSpotDcaPlan(cand.price, config.defaultSpotBudget, supports);
    cand.projectedAvgEntry = plan.projectedAvgEntry;
    cand.tp1 = plan.tp1;
    cand.tp2 = plan.tp2;
    cand.tp3 = plan.tp3;
    cand.sellPercentAtTp2 = plan.sellPercentAtTp2ForBreakEven;

    const trendTag = isEarlyAccumulationBase && !isUptrendPass
      ? `Early Accumulation (4H Reversal · 1D RSI ${cand.rsi1d})`
      : `1D ${mtf1d.trend} · 4H ${mtf4h.trend} · RSI ${cand.rsi1d}`;

    const highlights = [
      `Outperform BTC 7D ${cand.rsVsBtc7d >= 0 ? '+' : ''}${cand.rsVsBtc7d}%`,
      `Float ${Math.round(cand.mcapFdvRatio * 100)}% MCap/FDV`,
      trendTag,
    ];
    cand.highlights = highlights;

    if (finalScore >= config.minSpotScore) {
      cand.stageReached = 'WATCHLIST_READY';
      cand.rejectReason = undefined;

      // Emit log/Telegram/Journal for qualified winners not in cooldown
      const offCooldown = now - (cooldowns[cand.symbol] ?? 0) >= cooldownMs;
      if (offCooldown) {
        const summary = `Funnel 100→Watchlist | RS 7D ${cand.rsVsBtc7d >= 0 ? '+' : ''}${cand.rsVsBtc7d}% vs BTC | Float ${Math.round(cand.mcapFdvRatio * 100)}% | 1D ${mtf1d.trend} (RSI ${cand.rsi1d}) | DCA Avg ${plan.projectedAvgEntry.toPrecision(5)}`;

        const log: AutoSignalLog = {
          id: generateId('sig'),
          symbol: cand.symbol,
          baseAsset: cand.baseAsset,
          mode: 'SPOT_DCA',
          rule: config.rule,
          direction: 'ACCUMULATE',
          timeframe: '1d',
          entryPrice: Number(plan.projectedAvgEntry.toPrecision(6)),
          takeProfit: plan.tp2,
          confluenceScore: finalScore,
          rsiReal: cand.rsi1d,
          mcapFdvPercent: Math.round(cand.mcapFdvRatio * 100),
          rsVsBtc7d: cand.rsVsBtc7d,
          reasons: highlights,
          scoreOrGrade: `${finalScore}/100 (${tier})`,
          summary,
          telegramSent: false,
          savedToJournal: false,
          createdAt: now,
        };

        const spotSetup: SpotSetup = {
          id: generateId('spot'),
          symbol: cand.symbol,
          baseAsset: cand.baseAsset,
          budgetUsdt: config.defaultSpotBudget,
          qualityScore: finalScore,
          tier,
          layers: plan.layers,
          projectedAvgEntry: plan.projectedAvgEntry,
          tp1: plan.tp1,
          tp2: plan.tp2,
          tp3: plan.tp3,
          roiTp1Percent: plan.roiTp1Percent,
          roiTp2Percent: plan.roiTp2Percent,
          roiTp3Percent: plan.roiTp3Percent,
          sellPercentAtTp2ForBreakEven: plan.sellPercentAtTp2ForBreakEven,
          moonbagQty: plan.moonbagQty,
          moonbagValueAtTp3Usdt: plan.moonbagValueAtTp3Usdt,
          notes: `Spot Funnel 100→Watchlist: ${highlights.join(' | ')}`,
          status: 'Waiting',
          source: 'AutoBot',
          createdAt: now,
          updatedAt: now,
        };

        signals.push({ log, spotSetup });
      }
    } else {
      cand.stageReached = 'FAILED_TREND';
      cand.rejectReason = `Skor akhir ${finalScore}/100 < batas Layak Watchlist (${config.minSpotScore})`;
    }
  });

  const stage3Count = candidates.filter((c) => c.passedTrend).length;
  const watchlistReadyCount = candidates.filter((c) => c.stageReached === 'WATCHLIST_READY').length;

  // Order candidates: Watchlist Ready first (by finalScore), then Stage 3, Stage 2, Stage 1
  const stagePriority: Record<SpotFunnelCandidate['stageReached'], number> = {
    WATCHLIST_READY: 4,
    FAILED_TREND: 3,
    FAILED_TOKENOMICS: 2,
    FAILED_OUTPERFORMANCE: 1,
  };
  candidates.sort((a, b) => {
    const pDiff = stagePriority[b.stageReached] - stagePriority[a.stageReached];
    if (pDiff !== 0) return pDiff;
    return b.finalScore - a.finalScore;
  });

  // Sort emitted signals by final score and cap at top 5 per cycle to avoid Telegram spam
  signals.sort((a, b) => (b.log.confluenceScore ?? 0) - (a.log.confluenceScore ?? 0));

  onProgress?.('Funnel Spot 100 Coin selesai!', 100);

  return {
    report: {
      scannedAt: now,
      initialCount: top100.length,
      afterOutperformance: stage1Count,
      afterTokenomics: stage2Count,
      afterTrend: stage3Count,
      watchlistReady: watchlistReadyCount,
      btcBench24h: Number(btcBench24h.toFixed(2)),
      btcBench7d: Number(btcBench7d.toFixed(2)),
      btcBench30d: Number(btcBench30d.toFixed(2)),
      isTokenomicsFallback,
      candidates,
    },
    signals: signals.slice(0, 5),
  };
}
