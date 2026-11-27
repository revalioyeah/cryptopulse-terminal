import type {
  BacktestGrade,
  BacktestParams,
  BacktestResult,
  BacktestTrade,
  Candle,
  EquityPoint,
  TradeDirection,
} from '../types';
import { calculateATR, calculateEMA, calculateRSI } from './indicators';

function buildMapByTime(points: Array<{ time: number; value: number }>): Map<number, number> {
  return new Map(points.map((p) => [p.time, p.value]));
}

/**
 * Anti Look-Ahead Bias Backtest Engine:
 * - Sinyal dievaluasi ketat hanya pada bar tertutup `i` menggunakan data `<= i`.
 * - Eksekusi entry selalu dilakukan di harga `open` bar berikutnya `i + 1`.
 * - Jika SL dan TP keduanya tersentuh di bar yang sama, SL diprioritaskan (konservatif).
 * - Potongan fee trading (default 0.1% / 0.001 round-trip per transaksi).
 */
export function runBacktest(candles: Candle[], params: BacktestParams): BacktestResult {
  const ema20Map = buildMapByTime(calculateEMA(candles, 20));
  const ema50Map = buildMapByTime(calculateEMA(candles, 50));
  const rsiMap = buildMapByTime(calculateRSI(candles, 14));
  const atrArr = calculateATR(candles, 14);
  const atrMap = buildMapByTime(atrArr);

  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  let equity = 100; // Start normalized at 100%
  let peakEquity = 100;
  let maxDrawdownPercent = 0;

  const riskPerTradePct = 1.0; // 1% account risk per backtest trade
  const feeRate = params.feeRate || 0.001; // 0.1%

  let openPosition: {
    direction: TradeDirection;
    entryTime: number;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    stopDistPct: number;
  } | null = null;

  const startIndex = Math.min(55, Math.max(20, Math.floor(candles.length * 0.15)));

  if (candles.length > startIndex) {
    equityCurve.push({ time: candles[startIndex].time, equity: 100 });
  }

  for (let i = startIndex; i < candles.length - 1; i++) {
    const bar = candles[i];
    const nextBar = candles[i + 1];

    // 1. Manage active position on current bar `i` (conservative SL-first check)
    if (openPosition) {
      let exitPrice: number | null = null;
      let outcome: 'WIN' | 'LOSS' | null = null;

      if (openPosition.direction === 'LONG') {
        if (bar.low <= openPosition.stopLoss) {
          exitPrice = openPosition.stopLoss;
          outcome = 'LOSS';
        } else if (bar.high >= openPosition.takeProfit) {
          exitPrice = openPosition.takeProfit;
          outcome = 'WIN';
        }
      } else {
        if (bar.high >= openPosition.stopLoss) {
          exitPrice = openPosition.stopLoss;
          outcome = 'LOSS';
        } else if (bar.low <= openPosition.takeProfit) {
          exitPrice = openPosition.takeProfit;
          outcome = 'WIN';
        }
      }

      if (exitPrice !== null && outcome !== null) {
        // Calculate fee impact normalized to risk unit
        const feeInR = (feeRate * 2) / Math.max(openPosition.stopDistPct, 0.002);
        const rawR = outcome === 'WIN' ? params.targetRR : -1;
        const netR = rawR - feeInR;
        const netPnlPercent = netR * riskPerTradePct;

        equity = Number((equity * (1 + netPnlPercent / 100)).toFixed(3));
        peakEquity = Math.max(peakEquity, equity);
        const dd = ((peakEquity - equity) / peakEquity) * 100;
        if (dd > maxDrawdownPercent) maxDrawdownPercent = dd;

        trades.push({
          entryTime: openPosition.entryTime,
          exitTime: bar.time,
          direction: openPosition.direction,
          entryPrice: openPosition.entryPrice,
          exitPrice,
          stopLoss: openPosition.stopLoss,
          takeProfit: openPosition.takeProfit,
          outcome,
          netPnlPercent: Number(netPnlPercent.toFixed(2)),
          rMultiple: Number(netR.toFixed(2)),
        });

        equityCurve.push({ time: bar.time, equity: Number(equity.toFixed(2)) });
        openPosition = null;
      }
      continue;
    }

    // 2. Evaluate strategy entry signal strictly on closed bar `i`, enter at `nextBar.open`
    const ema20 = ema20Map.get(bar.time);
    const ema50 = ema50Map.get(bar.time);
    const rsi = rsiMap.get(bar.time);
    const atr = atrMap.get(bar.time);
    const prevBar = candles[i - 1];
    if (ema20 === undefined || ema50 === undefined || rsi === undefined || atr === undefined) {
      continue;
    }

    let signal: TradeDirection | null = null;

    if (params.strategy === 'ema_pullback') {
      // Trend pullback to EMA20 with close confirmation
      if (ema20 > ema50 && bar.low <= ema20 * 1.003 && bar.close > ema20 && rsi > 45 && rsi < 68) {
        signal = 'LONG';
      } else if (
        ema20 < ema50 &&
        bar.high >= ema20 * 0.997 &&
        bar.close < ema20 &&
        rsi < 55 &&
        rsi > 32
      ) {
        signal = 'SHORT';
      }
    } else if (params.strategy === 'breakout_volume') {
      const lookbackBars = candles.slice(Math.max(0, i - 20), i);
      const avgVol =
        lookbackBars.reduce((acc, c) => acc + c.volume, 0) / Math.max(lookbackBars.length, 1);
      const prevHigh = Math.max(...lookbackBars.map((c) => c.high));
      const prevLow = Math.min(...lookbackBars.map((c) => c.low));
      const volSpike = bar.volume >= avgVol * 1.35;

      if (volSpike && bar.close > prevHigh && bar.close > ema50) {
        signal = 'LONG';
      } else if (volSpike && bar.close < prevLow && bar.close < ema50) {
        signal = 'SHORT';
      }
    } else if (params.strategy === 'rsi_reversal') {
      const prevRsi = rsiMap.get(prevBar.time) ?? rsi;
      if (prevRsi < 33 && rsi >= 33 && bar.close > bar.open) {
        signal = 'LONG';
      } else if (prevRsi > 67 && rsi <= 67 && bar.close < bar.open) {
        signal = 'SHORT';
      }
    }

    if (signal) {
      const entryPrice = nextBar.open;
      const stopDistance = Math.max(atr * params.atrMultiplier, entryPrice * 0.004);
      const stopLoss = signal === 'LONG' ? entryPrice - stopDistance : entryPrice + stopDistance;
      const takeProfit =
        signal === 'LONG'
          ? entryPrice + stopDistance * params.targetRR
          : entryPrice - stopDistance * params.targetRR;

      openPosition = {
        direction: signal,
        entryTime: nextBar.time,
        entryPrice,
        stopLoss,
        takeProfit,
        stopDistPct: stopDistance / entryPrice,
      };
    }
  }

  const lastCandle = candles[candles.length - 1];
  if (
    lastCandle &&
    (equityCurve.length === 0 || equityCurve[equityCurve.length - 1].time < lastCandle.time)
  ) {
    equityCurve.push({ time: lastCandle.time, equity: Number(equity.toFixed(2)) });
  }

  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.outcome === 'WIN').length;
  const losses = totalTrades - wins;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  const longTrades = trades.filter((t) => t.direction === 'LONG');
  const shortTrades = trades.filter((t) => t.direction === 'SHORT');
  const longWinRate =
    longTrades.length > 0
      ? (longTrades.filter((t) => t.outcome === 'WIN').length / longTrades.length) * 100
      : 0;
  const shortWinRate =
    shortTrades.length > 0
      ? (shortTrades.filter((t) => t.outcome === 'WIN').length / shortTrades.length) * 100
      : 0;

  const expectancyR =
    totalTrades > 0
      ? trades.reduce((acc, t) => acc + t.rMultiple, 0) / totalTrades
      : 0;

  let maxConsecutiveLosses = 0;
  let currentLossStreak = 0;
  for (const t of trades) {
    if (t.outcome === 'LOSS') {
      currentLossStreak += 1;
      if (currentLossStreak > maxConsecutiveLosses) {
        maxConsecutiveLosses = currentLossStreak;
      }
    } else {
      currentLossStreak = 0;
    }
  }

  const grossProfit = trades
    .filter((t) => t.netPnlPercent > 0)
    .reduce((acc, t) => acc + t.netPnlPercent, 0);
  const grossLoss = Math.abs(
    trades.filter((t) => t.netPnlPercent < 0).reduce((acc, t) => acc + t.netPnlPercent, 0),
  );
  const profitFactor =
    grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 3.5 : 0;
  const netPnlPercent = equity - 100;

  let grade: BacktestGrade = 'C';
  if (totalTrades >= 6 && profitFactor >= 1.8 && winRate >= 48 && netPnlPercent > 8 && maxDrawdownPercent < 10) {
    grade = 'A+';
  } else if (totalTrades >= 5 && profitFactor >= 1.45 && netPnlPercent > 4) {
    grade = 'A';
  } else if (totalTrades >= 4 && profitFactor >= 1.2 && netPnlPercent > 0) {
    grade = 'B+';
  } else if (totalTrades >= 3 && profitFactor >= 0.95) {
    grade = 'B';
  }

  // Derive latest actionable setup parameters for 1-Click Apply
  const latestClose = lastCandle?.close ?? 100;
  const latestAtr = atrArr[atrArr.length - 1]?.value ?? latestClose * 0.015;
  const latestEma20 = ema20Map.get(lastCandle?.time ?? 0) ?? latestClose;
  const latestEma50 = ema50Map.get(lastCandle?.time ?? 0) ?? latestClose;

  const suggestedDirection: TradeDirection = latestEma20 >= latestEma50 ? 'LONG' : 'SHORT';
  const slDist = Math.max(latestAtr * params.atrMultiplier, latestClose * 0.005);
  const suggestedStopLoss =
    suggestedDirection === 'LONG' ? latestClose - slDist : latestClose + slDist;
  const suggestedTp1 =
    suggestedDirection === 'LONG'
      ? latestClose + slDist * Math.max(1.2, params.targetRR * 0.6)
      : latestClose - slDist * Math.max(1.2, params.targetRR * 0.6);
  const suggestedTp2 =
    suggestedDirection === 'LONG'
      ? latestClose + slDist * params.targetRR
      : latestClose - slDist * params.targetRR;
  const suggestedTp3 =
    suggestedDirection === 'LONG'
      ? latestClose + slDist * (params.targetRR * 1.45)
      : latestClose - slDist * (params.targetRR * 1.45);

  return {
    params,
    candleCount: candles.length,
    totalTrades,
    wins,
    losses,
    winRate: Number(winRate.toFixed(1)),
    profitFactor: Number(profitFactor.toFixed(2)),
    netPnlPercent: Number(netPnlPercent.toFixed(2)),
    maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(2)),
    expectancyR: Number(expectancyR.toFixed(2)),
    maxConsecutiveLosses,
    longWinRate: Number(longWinRate.toFixed(1)),
    shortWinRate: Number(shortWinRate.toFixed(1)),
    grade,
    equityCurve,
    trades,
    suggestedDirection,
    suggestedEntry: Number(latestClose.toPrecision(6)),
    suggestedStopLoss: Number(suggestedStopLoss.toPrecision(6)),
    suggestedTp1: Number(suggestedTp1.toPrecision(6)),
    suggestedTp2: Number(suggestedTp2.toPrecision(6)),
    suggestedTp3: Number(suggestedTp3.toPrecision(6)),
    atrValue: latestAtr,
  };
}
