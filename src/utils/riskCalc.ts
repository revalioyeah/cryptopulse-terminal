import type { EntryLeg, TakeProfitTarget, TradeDirection } from '../types';

export interface FuturesRiskInput {
  direction: TradeDirection;
  entries: EntryLeg[];
  stopLoss: number;
  takeProfits: TakeProfitTarget[];
  accountEquity: number;
  riskPercent: number;
  leverage: number;
  feeRateRoundTrip?: number; // Default 0.001 (0.05% entry + 0.05% exit Binance Futures taker)
  activePortfolioRiskUsdt?: number; // Optional existing open risk across Waiting/Running setups
}

export interface FuturesRiskMetrics {
  avgEntry: number;
  riskAmountUsdt: number;
  estimatedFeeUsdt: number;
  netRiskWithFeeUsdt: number;
  stopDistancePercent: number;
  positionSizeUsdt: number;
  positionQty: number;
  marginRequiredUsdt: number;
  estimatedLiquidation: number;
  liquidationDistancePercent: number;
  isLiquidationBeforeSl: boolean;
  isLiquidationTight: boolean;
  maxSafeLeverage: number;
  rrTp1: number;
  rrTp2: number;
  rrTp3: number;
  blendedRR: number;
  netRrTp1: number;
  netRrTp2: number;
  netRrTp3: number;
  blendedNetRR: number;
  netRewardTp1Usdt: number;
  netRewardTp2Usdt: number;
  netRewardTp3Usdt: number;
  blendedNetRewardUsdt: number;
  breakevenWinRatePercent: number;
  tpAllocationSum: number;
  isTpAllocValid: boolean;
  totalExposureRiskPercent: number;
  isValidSl: boolean;
  validationMessage?: string;
  riskWarnings: string[];
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
  const feeRate = input.feeRateRoundTrip ?? 0.001; // 0.10% round-trip taker
  const riskAmountUsdt = Number(((safeEquity * safeRiskPct) / 100).toFixed(2));

  const isValidSl =
    avgEntry > 0 &&
    input.stopLoss > 0 &&
    (input.direction === 'LONG' ? input.stopLoss < avgEntry : input.stopLoss > avgEntry);

  const stopDiff = Math.abs(avgEntry - input.stopLoss);
  const stopDistancePercent = avgEntry > 0 ? (stopDiff / avgEntry) * 100 : 0;

  // Position size so stop hit = riskAmountUsdt (pre-fee), then explicitly show fee impact
  const positionQty = isValidSl && stopDiff > 0 ? riskAmountUsdt / stopDiff : 0;
  const positionSizeUsdt = Number((positionQty * avgEntry).toFixed(2));
  const marginRequiredUsdt = Number((positionSizeUsdt / safeLev).toFixed(2));
  const estimatedFeeUsdt = Number((positionSizeUsdt * feeRate).toFixed(2));
  const netRiskWithFeeUsdt = Number((riskAmountUsdt + estimatedFeeUsdt).toFixed(2));

  // Standard isolated margin liquidation approximation with 0.5% maintenance margin factor
  const mmr = 0.005;
  const estimatedLiquidation =
    avgEntry > 0
      ? input.direction === 'LONG'
        ? Math.max(0, avgEntry * (1 - 1 / safeLev + mmr))
        : avgEntry * (1 + 1 / safeLev - mmr)
      : 0;

  const liquidationDistancePercent =
    avgEntry > 0 ? (Math.abs(avgEntry - estimatedLiquidation) / avgEntry) * 100 : 0;

  // Liquidation danger checks
  const isLiquidationBeforeSl =
    isValidSl &&
    (input.direction === 'LONG'
      ? estimatedLiquidation >= input.stopLoss
      : estimatedLiquidation <= input.stopLoss);

  const isLiquidationTight =
    isValidSl && !isLiquidationBeforeSl && liquidationDistancePercent < stopDistancePercent * 1.25;

  // Maximum safe leverage that keeps liquidation at least 1.35x further away than SL (including MMR)
  const requiredLiqDistFraction = Math.max((stopDistancePercent / 100) * 1.35 + mmr, 0.015);
  const maxSafeLeverage = Math.max(1, Math.min(50, Math.floor(1 / requiredLiqDistFraction)));

  const calcRR = (tpPrice: number): number => {
    if (!isValidSl || stopDiff <= 0 || tpPrice <= 0) return 0;
    const reward = input.direction === 'LONG' ? tpPrice - avgEntry : avgEntry - tpPrice;
    return Number(Math.max(0, reward / stopDiff).toFixed(2));
  };

  const calcNetRewardUsdt = (tpPrice: number): number => {
    if (!isValidSl || positionQty <= 0 || tpPrice <= 0) return 0;
    const gross =
      input.direction === 'LONG'
        ? (tpPrice - avgEntry) * positionQty
        : (avgEntry - tpPrice) * positionQty;
    return Number((gross - estimatedFeeUsdt).toFixed(2));
  };

  const tp1 = input.takeProfits[0];
  const tp2 = input.takeProfits[1];
  const tp3 = input.takeProfits[2];

  const rrTp1 = calcRR(tp1?.price ?? 0);
  const rrTp2 = calcRR(tp2?.price ?? 0);
  const rrTp3 = calcRR(tp3?.price ?? 0);

  const netRewardTp1Usdt = calcNetRewardUsdt(tp1?.price ?? 0);
  const netRewardTp2Usdt = calcNetRewardUsdt(tp2?.price ?? 0);
  const netRewardTp3Usdt = calcNetRewardUsdt(tp3?.price ?? 0);

  const netRrTp1 =
    netRiskWithFeeUsdt > 0 ? Number(Math.max(0, netRewardTp1Usdt / netRiskWithFeeUsdt).toFixed(2)) : 0;
  const netRrTp2 =
    netRiskWithFeeUsdt > 0 ? Number(Math.max(0, netRewardTp2Usdt / netRiskWithFeeUsdt).toFixed(2)) : 0;
  const netRrTp3 =
    netRiskWithFeeUsdt > 0 ? Number(Math.max(0, netRewardTp3Usdt / netRiskWithFeeUsdt).toFixed(2)) : 0;

  const tpAllocationSum =
    (tp1?.allocationPercent ?? 0) + (tp2?.allocationPercent ?? 0) + (tp3?.allocationPercent ?? 0);
  const isTpAllocValid = tpAllocationSum === 100;

  const blendedRR =
    tpAllocationSum > 0
      ? Number(
          (
            (rrTp1 * (tp1?.allocationPercent ?? 0) +
              rrTp2 * (tp2?.allocationPercent ?? 0) +
              rrTp3 * (tp3?.allocationPercent ?? 0)) /
            tpAllocationSum
          ).toFixed(2),
        )
      : rrTp2;

  const blendedNetRewardUsdt =
    tpAllocationSum > 0
      ? Number(
          (
            (netRewardTp1Usdt * (tp1?.allocationPercent ?? 0) +
              netRewardTp2Usdt * (tp2?.allocationPercent ?? 0) +
              netRewardTp3Usdt * (tp3?.allocationPercent ?? 0)) /
            tpAllocationSum
          ).toFixed(2),
        )
      : netRewardTp2Usdt;

  const blendedNetRR =
    netRiskWithFeeUsdt > 0
      ? Number(Math.max(0, blendedNetRewardUsdt / netRiskWithFeeUsdt).toFixed(2))
      : 0;

  const breakevenWinRatePercent =
    blendedNetRR > 0 ? Number(((1 / (1 + blendedNetRR)) * 100).toFixed(1)) : 100;

  const totalOpenRiskUsdt = (input.activePortfolioRiskUsdt ?? 0) + netRiskWithFeeUsdt;
  const totalExposureRiskPercent =
    safeEquity > 0 ? Number(((totalOpenRiskUsdt / safeEquity) * 100).toFixed(2)) : 0;

  let validationMessage: string | undefined;
  if (!isValidSl) {
    validationMessage =
      input.direction === 'LONG'
        ? 'Stop Loss untuk LONG harus berada di bawah harga Entry.'
        : 'Stop Loss untuk SHORT harus berada di atas harga Entry.';
  } else if (isLiquidationBeforeSl) {
    validationMessage = `BAHAYA LIKUIDASI: Harga likuidasi (${liquidationDistancePercent.toFixed(2)}%) lebih dekat daripada Stop Loss (${stopDistancePercent.toFixed(2)}%)! Turunkan leverage ke ≤ ${maxSafeLeverage}x.`;
  } else if (marginRequiredUsdt > safeEquity) {
    validationMessage =
      'Margin melebihi ekuitas akun — turunkan Risk %, perlebar SL, atau sesuaikan ekuitas.';
  }

  const riskWarnings: string[] = [];
  if (isLiquidationTight) {
    riskWarnings.push(
      `Buffer likuidasi terlalu tipis terhadap SL — leverage aman yang disarankan ≤ ${maxSafeLeverage}x.`,
    );
  }
  if (isValidSl && blendedNetRR < 1.3) {
    riskWarnings.push(
      `Net R:R setelah fee hanya 1:${blendedNetRR.toFixed(2)} (disarankan ≥ 1:1.50 agar profit jangka panjang).`,
    );
  }
  if (isValidSl && riskAmountUsdt > 0 && estimatedFeeUsdt / riskAmountUsdt > 0.15) {
    riskWarnings.push(
      `Fee trading (${((estimatedFeeUsdt / riskAmountUsdt) * 100).toFixed(0)}% dari risk) terlalu besar karena SL terlalu sempit (${stopDistancePercent.toFixed(2)}%).`,
    );
  }
  if (!isTpAllocValid) {
    riskWarnings.push(`Total alokasi split TP saat ini ${tpAllocationSum}% (wajib 100%).`);
  }
  if (totalExposureRiskPercent > 5) {
    riskWarnings.push(
      `Total eksposur risiko aktif mencapai ${totalExposureRiskPercent.toFixed(1)}% ekuitas (disarankan ≤ 5%).`,
    );
  }

  return {
    avgEntry,
    riskAmountUsdt,
    estimatedFeeUsdt,
    netRiskWithFeeUsdt,
    stopDistancePercent: Number(stopDistancePercent.toFixed(2)),
    positionSizeUsdt,
    positionQty,
    marginRequiredUsdt,
    estimatedLiquidation,
    liquidationDistancePercent: Number(liquidationDistancePercent.toFixed(2)),
    isLiquidationBeforeSl,
    isLiquidationTight,
    maxSafeLeverage,
    rrTp1,
    rrTp2,
    rrTp3,
    blendedRR,
    netRrTp1,
    netRrTp2,
    netRrTp3,
    blendedNetRR,
    netRewardTp1Usdt,
    netRewardTp2Usdt,
    netRewardTp3Usdt,
    blendedNetRewardUsdt,
    breakevenWinRatePercent,
    tpAllocationSum,
    isTpAllocValid,
    totalExposureRiskPercent,
    isValidSl,
    validationMessage,
    riskWarnings,
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
      detail: `Struktur HTF BTC saat ini ${effectiveTrend} (${btcChange24h >= 0 ? '+' : ''}${btcChange24h.toFixed(2)}% 24h).`,
    };
  }

  if (effectiveTrend === 'Sideways') {
    return {
      aligned: true,
      label: 'BTC Netral / Sideways',
      detail: 'BTC bergerak mendatar pada HTF — altcoin memiliki ruang bergerak sesuai struktur teknikalnya.',
    };
  }

  const aligned =
    (effectiveTrend === 'Bullish' && direction === 'LONG') ||
    (effectiveTrend === 'Bearish' && direction === 'SHORT');

  return {
    aligned,
    label: aligned ? 'Searah Trend HTF BTC' : 'Melawan Trend HTF BTC (Counter-Trend)',
    detail: aligned
      ? `Setup ${direction} searah dengan trend HTF BTC (${effectiveTrend}). Probabilitas follow-through lebih tinggi.`
      : `Peringatan: Setup ${direction} melawan trend HTF BTC (${effectiveTrend}). Turunkan Risk % ke 0.5% atau perketat konfirmasi.`,
  };
}
