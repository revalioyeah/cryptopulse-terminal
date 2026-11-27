import type { EntryLeg, TakeProfitTarget, TradeDirection } from '../types';

export interface FuturesRiskInput {
  direction: TradeDirection;
  entries: EntryLeg[];
  stopLoss: number;
  takeProfits: TakeProfitTarget[];
  accountEquity: number;
  riskPercent: number;
  leverage: number;
}

export interface FuturesRiskMetrics {
  avgEntry: number;
  riskAmountUsdt: number;
  stopDistancePercent: number;
  positionSizeUsdt: number;
  positionQty: number;
  marginRequiredUsdt: number;
  estimatedLiquidation: number;
  rrTp1: number;
  rrTp2: number;
  rrTp3: number;
  blendedRR: number;
  isValidSl: boolean;
  validationMessage?: string;
}

export function calculateFuturesRisk(input: FuturesRiskInput): FuturesRiskMetrics {
  const validEntries = input.entries.filter((e) => e.price > 0 && e.weightPercent > 0);
  const totalWeight = validEntries.reduce((acc, e) => acc + e.weightPercent, 0);

  const avgEntry =
    totalWeight > 0
      ? validEntries.reduce((acc, e) => acc + e.price * e.weightPercent, 0) / totalWeight
      : input.entries[0]?.price ?? 0;

  const safeEquity = Math.max(0, input.accountEquity);
  const safeRiskPct = Math.max(0.05, Math.min(25, input.riskPercent));
  const safeLev = Math.max(1, Math.min(125, input.leverage));
  const riskAmountUsdt = Number(((safeEquity * safeRiskPct) / 100).toFixed(2));

  const isValidSl =
    avgEntry > 0 &&
    input.stopLoss > 0 &&
    (input.direction === 'LONG' ? input.stopLoss < avgEntry : input.stopLoss > avgEntry);

  const stopDiff = Math.abs(avgEntry - input.stopLoss);
  const stopDistancePercent = avgEntry > 0 ? (stopDiff / avgEntry) * 100 : 0;

  const positionQty = isValidSl && stopDiff > 0 ? riskAmountUsdt / stopDiff : 0;
  const positionSizeUsdt = Number((positionQty * avgEntry).toFixed(2));
  const marginRequiredUsdt = Number((positionSizeUsdt / safeLev).toFixed(2));

  // Standard isolated margin liquidation approximation with 0.5% maintenance margin factor
  const mmr = 0.005;
  const estimatedLiquidation =
    avgEntry > 0
      ? input.direction === 'LONG'
        ? Math.max(0, avgEntry * (1 - 1 / safeLev + mmr))
        : avgEntry * (1 + 1 / safeLev - mmr)
      : 0;

  const calcRR = (tpPrice: number): number => {
    if (!isValidSl || stopDiff <= 0 || tpPrice <= 0) return 0;
    const reward =
      input.direction === 'LONG' ? tpPrice - avgEntry : avgEntry - tpPrice;
    return Number(Math.max(0, reward / stopDiff).toFixed(2));
  };

  const tp1 = input.takeProfits[0];
  const tp2 = input.takeProfits[1];
  const tp3 = input.takeProfits[2];

  const rrTp1 = calcRR(tp1?.price ?? 0);
  const rrTp2 = calcRR(tp2?.price ?? 0);
  const rrTp3 = calcRR(tp3?.price ?? 0);

  const allocSum =
    (tp1?.allocationPercent ?? 0) + (tp2?.allocationPercent ?? 0) + (tp3?.allocationPercent ?? 0);
  const blendedRR =
    allocSum > 0
      ? Number(
          (
            (rrTp1 * (tp1?.allocationPercent ?? 0) +
              rrTp2 * (tp2?.allocationPercent ?? 0) +
              rrTp3 * (tp3?.allocationPercent ?? 0)) /
            allocSum
          ).toFixed(2),
        )
      : rrTp2;

  let validationMessage: string | undefined;
  if (!isValidSl) {
    validationMessage =
      input.direction === 'LONG'
        ? 'Stop Loss untuk LONG harus berada di bawah harga Entry.'
        : 'Stop Loss untuk SHORT harus berada di atas harga Entry.';
  } else if (marginRequiredUsdt > safeEquity) {
    validationMessage = 'Margin melebihi ekuitas akun — naikkan leverage atau perlebar SL / turunkan Risk %.';
  }

  return {
    avgEntry,
    riskAmountUsdt,
    stopDistancePercent: Number(stopDistancePercent.toFixed(2)),
    positionSizeUsdt,
    positionQty,
    marginRequiredUsdt,
    estimatedLiquidation,
    rrTp1,
    rrTp2,
    rrTp3,
    blendedRR,
    isValidSl,
    validationMessage,
  };
}

export function evaluateBtcBetaAlignment(
  symbol: string,
  direction: TradeDirection,
  btcChange24h: number,
  btcTrend?: 'Bullish' | 'Bearish' | 'Sideways',
): { aligned: boolean; label: string; detail: string } {
  const effectiveTrend =
    btcTrend ?? (btcChange24h > 0.6 ? 'Bullish' : btcChange24h < -0.6 ? 'Bearish' : 'Sideways');

  if (symbol === 'BTCUSDT') {
    return {
      aligned: true,
      label: 'Benchmark Utama (BTC)',
      detail: `Trend BTC saat ini ${effectiveTrend} (${btcChange24h >= 0 ? '+' : ''}${btcChange24h.toFixed(2)}% 24h).`,
    };
  }

  if (effectiveTrend === 'Sideways') {
    return {
      aligned: true,
      label: 'BTC Netral / Sideways',
      detail: 'BTC bergerak mendatar — altcoin memiliki ruang bergerak sesuai struktur teknikalnya.',
    };
  }

  const aligned =
    (effectiveTrend === 'Bullish' && direction === 'LONG') ||
    (effectiveTrend === 'Bearish' && direction === 'SHORT');

  return {
    aligned,
    label: aligned ? 'Searah Trend BTC' : 'Melawan Trend BTC (Counter-Trend)',
    detail: aligned
      ? `Setup ${direction} searah dengan momentum BTC (${effectiveTrend}). Probabilitas follow-through lebih tinggi.`
      : `Peringatan: Setup ${direction} melawan trend BTC (${effectiveTrend}). Pertimbangkan turunkan Risk % atau perketat konfirmasi.`,
  };
}
