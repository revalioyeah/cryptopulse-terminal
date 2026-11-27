import type { Candle, Coin, DcaLayer, SpotQualityScore } from '../types';
import { buildTechnicalSummary } from './indicators';

export function evaluateSpotQuality(coin: Coin, candles: Candle[]): SpotQualityScore {
  const summary = buildTechnicalSummary(candles);

  // Pillar 1: Tokenomics & FDV (heuristic based on rank, sector maturity & volatility stability)
  const rankScore =
    coin.marketCapRank <= 10
      ? 23
      : coin.marketCapRank <= 25
        ? 20
        : coin.marketCapRank <= 50
          ? 16
          : 12;
  const sectorBonus = coin.sector === 'Layer 1' || coin.sector === 'DeFi' ? 2 : coin.sector === 'Meme' ? -3 : 0;
  const p1 = Math.max(8, Math.min(25, rankScore + sectorBonus));

  // Pillar 2: Struktur 1D/1W (EMA structure + RSI health)
  let p2 = 13;
  if (coin.price > summary.ema50) p2 += 5;
  if (summary.ema20 > summary.ema50) p2 += 4;
  if (summary.rsi14 >= 38 && summary.rsi14 <= 66) p2 += 3;
  else if (summary.rsi14 < 32) p2 += 2; // Accumulation discount
  p2 = Math.max(6, Math.min(25, p2));

  // Pillar 3: Narasi & Likuiditas (quote volume & sector momentum)
  const volScore =
    coin.quoteVolume24h >= 500_000_000
      ? 21
      : coin.quoteVolume24h >= 150_000_000
        ? 18
        : coin.quoteVolume24h >= 50_000_000
          ? 14
          : 10;
  const hotSector = coin.sector === 'AI' || coin.sector === 'Layer 1' || coin.sector === 'RWA' ? 3 : 1;
  const p3 = Math.max(8, Math.min(25, volScore + hotSector));

  // Pillar 4: Whale Flow & Derivatives Demand
  let p4 = 14;
  if (coin.oiChange24h > 3) p4 += 5;
  else if (coin.oiChange24h < -3) p4 -= 3;
  if (coin.volumeSpikeRatio >= 1.4) p4 += 4;
  if (coin.fundingRate > 0 && coin.fundingRate < 0.03) p4 += 2;
  p4 = Math.max(6, Math.min(25, p4));

  const totalScore = Math.min(100, Math.max(0, p1 + p2 + p3 + p4));

  const tier: SpotQualityScore['tier'] =
    totalScore >= 78 ? 'Core' : totalScore >= 60 ? 'Growth' : 'High-Risk';

  const verdict =
    tier === 'Core'
      ? 'Layak sebagai aset inti (Core Holding) untuk akumulasi bertahap jangka menengah-panjang.'
      : tier === 'Growth'
        ? 'Potensi pertumbuhan kuat; ideal dengan strategi 3-Layer DCA & disiplin ambil modal di TP2.'
        : 'Volatilitas dan risiko dilusi tinggi; batasi alokasi maksimal 3–5% dari total portofolio.';

  return {
    totalScore,
    tier,
    verdict,
    pillars: [
      {
        name: 'Tokenomics & FDV',
        score: p1,
        maxScore: 25,
        note:
          coin.marketCapRank <= 15
            ? 'Sirkulasi matang & risiko dilusi rendah.'
            : 'Perhatikan jadwal unlock & rasio FDV.',
      },
      {
        name: 'Struktur 1D/1W',
        score: p2,
        maxScore: 25,
        note: `Bias teknikal ${summary.bias} (RSI ${summary.rsi14.toFixed(1)}).`,
      },
      {
        name: 'Narasi & Likuiditas',
        score: p3,
        maxScore: 25,
        note: `Sektor ${coin.sector} dengan likuiditas orderbook kuat.`,
      },
      {
        name: 'Whale Flow',
        score: p4,
        maxScore: 25,
        note:
          coin.oiChange24h >= 0
            ? 'Aliran modal & OI menunjukkan minat akumulasi positif.'
            : 'Arus akumulasi melambat; tunggu konfirmasi support.',
      },
    ],
  };
}

export interface SpotDcaPlan {
  layers: DcaLayer[];
  projectedAvgEntry: number;
  totalEstimatedQty: number;
  tp1: number;
  tp2: number;
  tp3: number;
  roiTp1Percent: number;
  roiTp2Percent: number;
  roiTp3Percent: number;
  sellPercentAtTp2ForBreakEven: number;
  qtySoldAtTp2: number;
  moonbagQty: number;
  moonbagValueAtTp3Usdt: number;
}

export function generateSpotDcaPlan(
  currentPrice: number,
  budgetUsdt: number,
  supports: number[],
): SpotDcaPlan {
  const safePrice = Math.max(currentPrice, 1e-8);
  const safeBudget = Math.max(10, budgetUsdt);

  // Derive 3 layered support entry prices (Layer 1 near spot/S1, Layer 2 deeper support, Layer 3 deep value)
  const s1 = supports[0] && supports[0] < safePrice * 0.995 ? supports[0] : safePrice * 0.975;
  const s2 =
    supports[1] && supports[1] < s1 * 0.97 ? supports[1] : Math.min(s1 * 0.935, safePrice * 0.91);
  const s3 =
    supports[2] && supports[2] < s2 * 0.96 ? supports[2] : Math.min(s2 * 0.915, safePrice * 0.83);

  const weights: Array<{ layer: 1 | 2 | 3; label: string; pct: number; price: number }> = [
    { layer: 1, label: 'Layer 1 (Entry Awal)', pct: 20, price: s1 },
    { layer: 2, label: 'Layer 2 (Support Utama)', pct: 30, price: s2 },
    { layer: 3, label: 'Layer 3 (Deep Value)', pct: 50, price: s3 },
  ];

  const layers: DcaLayer[] = weights.map((w) => {
    const budget = (safeBudget * w.pct) / 100;
    const qty = budget / Math.max(w.price, 1e-10);
    return {
      layer: w.layer,
      label: w.label,
      price: Number(w.price.toPrecision(6)),
      allocationPercent: w.pct,
      budgetUsdt: Number(budget.toFixed(2)),
      estimatedQty: qty,
    };
  });

  const totalEstimatedQty = layers.reduce((acc, l) => acc + l.estimatedQty, 0);
  const projectedAvgEntry = safeBudget / Math.max(totalEstimatedQty, 1e-10);

  const tp1 = Number((projectedAvgEntry * 1.25).toPrecision(6));
  const tp2 = Number((projectedAvgEntry * 1.65).toPrecision(6));
  const tp3 = Number((projectedAvgEntry * 2.45).toPrecision(6));

  return computeSpotTargetsAndMoonbag(layers, safeBudget, tp1, tp2, tp3);
}

export function computeSpotTargetsAndMoonbag(
  layers: DcaLayer[],
  budgetUsdt: number,
  tp1: number,
  tp2: number,
  tp3: number,
): SpotDcaPlan {
  const totalEstimatedQty = layers.reduce((acc, l) => acc + l.estimatedQty, 0);
  const projectedAvgEntry =
    totalEstimatedQty > 0 ? budgetUsdt / totalEstimatedQty : layers[0]?.price ?? 1;

  const roiTp1Percent = ((tp1 - projectedAvgEntry) / projectedAvgEntry) * 100;
  const roiTp2Percent = ((tp2 - projectedAvgEntry) / projectedAvgEntry) * 100;
  const roiTp3Percent = ((tp3 - projectedAvgEntry) / projectedAvgEntry) * 100;

  // Sell % at TP2 needed so 100% of initial capital (budgetUsdt) returns to USDT:
  // qtySoldAtTp2 * tp2 = budgetUsdt => sellPercent = (budgetUsdt / (totalQty * tp2)) * 100
  const totalValAtTp2 = totalEstimatedQty * Math.max(tp2, 1e-10);
  const rawSellPct = totalValAtTp2 > 0 ? (budgetUsdt / totalValAtTp2) * 100 : 100;
  const sellPercentAtTp2ForBreakEven = Math.min(100, Math.max(1, Number(rawSellPct.toFixed(1))));
  const qtySoldAtTp2 = totalEstimatedQty * (sellPercentAtTp2ForBreakEven / 100);
  const moonbagQty = Math.max(0, totalEstimatedQty - qtySoldAtTp2);
  const moonbagValueAtTp3Usdt = Number((moonbagQty * tp3).toFixed(2));

  return {
    layers,
    projectedAvgEntry,
    totalEstimatedQty,
    tp1,
    tp2,
    tp3,
    roiTp1Percent,
    roiTp2Percent,
    roiTp3Percent,
    sellPercentAtTp2ForBreakEven,
    qtySoldAtTp2,
    moonbagQty,
    moonbagValueAtTp3Usdt,
  };
}
