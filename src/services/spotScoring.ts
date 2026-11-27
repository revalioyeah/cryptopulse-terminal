import type { Candle, Coin, CoinTokenomicsRecord, DcaLayer, SpotQualityScore } from '../types';
import { getMacroAndUnlockEvents } from './adapters/calendarAdapter';
import { buildTechnicalSummary, detectMarketStructure, evaluateSingleTimeframeTrend } from './indicators';

export type SpotDcaProfileId = 'CONSERVATIVE' | 'BALANCED' | 'BREAKOUT';

export const SPOT_DCA_PROFILES: Record<
  SpotDcaProfileId,
  { label: string; desc: string; weights: [number, number, number] }
> = {
  CONSERVATIVE: {
    label: 'Konservatif (20/30/50)',
    desc: 'Porsi terbesar di support dalam untuk average terbaik saat koreksi.',
    weights: [20, 30, 50],
  },
  BALANCED: {
    label: 'Seimbang (30/35/35)',
    desc: 'Distribusi merata antara support awal dan zona akumulasi utama.',
    weights: [30, 35, 35],
  },
  BREAKOUT: {
    label: 'Trend Leader (50/30/20)',
    desc: 'Masuk lebih awal untuk koin outperformer agar tidak tertinggal reli.',
    weights: [50, 30, 20],
  },
};

export interface SpotQualityExtraContext {
  tokenomics?: CoinTokenomicsRecord;
  btcBench7d?: number;
  btcBench30d?: number;
  h4Candles?: Candle[];
}

export function evaluateSpotQuality(
  coin: Coin,
  candles: Candle[],
  extra?: SpotQualityExtraContext,
): SpotQualityScore {
  const closed1d = candles.length > 35 ? candles.slice(0, -1) : candles;
  const summary = buildTechnicalSummary(closed1d);
  const mtf1d = evaluateSingleTimeframeTrend(closed1d, '1d');
  const struct1d = detectMarketStructure(closed1d);
  const mtf4h =
    extra?.h4Candles && extra.h4Candles.length > 30
      ? evaluateSingleTimeframeTrend(extra.h4Candles.slice(0, -1), '4h')
      : null;

  const tok = extra?.tokenomics;
  const now = Date.now();
  const upcomingUnlocks = getMacroAndUnlockEvents(now);
  const heavyUnlock = upcomingUnlocks.find(
    (ev) =>
      ev.category === 'Token Unlock' &&
      ev.symbol === coin.symbol &&
      (ev.unlockSupplyPercent ?? 0) >= 1.0 &&
      ev.timestamp - now <= 14 * 24 * 3600 * 1000,
  );

  // Pillar 1: Tokenomics & FDV (uses REAL CoinGecko MCap/FDV + Max Supply + Unlock calendar when available)
  let p1 = 12;
  let p1Note = '';
  if (tok && !tok.isFallback) {
    const floatPct = Math.round(tok.mcapToFdvRatio * 100);
    p1 =
      tok.mcapToFdvRatio >= 0.85
        ? 21
        : tok.mcapToFdvRatio >= 0.7
          ? 18
          : tok.mcapToFdvRatio >= 0.55
            ? 15
            : tok.mcapToFdvRatio >= 0.4
              ? 11
              : 7;
    if (tok.maxSupply && tok.maxSupply > 0) p1 += 2;
    if (tok.marketCapRank <= 20) p1 += 2;
    else if (tok.marketCapRank <= 60) p1 += 1;
    if (heavyUnlock) p1 -= 4;
    p1 = Math.max(5, Math.min(25, p1));
    p1Note = `MCap/FDV ${floatPct}%${tok.maxSupply ? ' · Max Supply Cap' : ''}${
      heavyUnlock ? ` · Waspada unlock ${heavyUnlock.unlockSupplyPercent}%` : ' · Dilusi terkendali'
    }.`;
  } else {
    const rankScore =
      coin.marketCapRank <= 10
        ? 22
        : coin.marketCapRank <= 25
          ? 19
          : coin.marketCapRank <= 50
            ? 15
            : 12;
    const sectorBonus =
      coin.sector === 'Layer 1' || coin.sector === 'DeFi' ? 2 : coin.sector === 'Meme' ? -3 : 0;
    p1 = Math.max(6, Math.min(25, rankScore + sectorBonus - (heavyUnlock ? 3 : 0)));
    p1Note =
      coin.marketCapRank <= 15
        ? 'Kapitalisasi besar & sirkulasi matang.'
        : 'Cek rasio FDV & jadwal cliff unlock sebelum akumulasi besar.';
  }

  // Pillar 2: Struktur 1D / 4H Real (EMA 20/50/200 + Market Structure + RSI)
  let p2 = 9;
  const lastClose = closed1d[closed1d.length - 1]?.close ?? coin.price;
  if (lastClose > summary.ema20) p2 += 4;
  if (lastClose > summary.ema50) p2 += 4;
  if (summary.ema20 > summary.ema50) p2 += 3;
  if (lastClose > summary.ema200) p2 += 2;
  if (mtf4h?.trend === 'Bullish') p2 += 3;
  else if (mtf4h?.trend === 'Bearish') p2 -= 2;
  if (struct1d.structure === 'UPTREND_HH_HL' || struct1d.bosBullish) p2 += 2;
  if (summary.rsi14 >= 40 && summary.rsi14 <= 66) p2 += 2;
  else if (summary.rsi14 > 75) p2 -= 4; // Overextended FOMO warning
  p2 = Math.max(4, Math.min(25, p2));

  const p2Note = `1D ${mtf1d.trend}${mtf4h ? ` · 4H ${mtf4h.trend}` : ''} · RSI(14) ${summary.rsi14.toFixed(1)} (${
    summary.rsi14 > 74 ? 'Overextended' : mtf1d.emaAlignment
  }).`;

  // Pillar 3: Outperformance vs BTC & Likuiditas
  const volScore =
    coin.quoteVolume24h >= 500_000_000
      ? 14
      : coin.quoteVolume24h >= 100_000_000
        ? 12
        : coin.quoteVolume24h >= 20_000_000
          ? 10
          : coin.quoteVolume24h >= 5_000_000
            ? 7
            : 4;
  let rsBonus = 5;
  let rsText = `Sektor ${coin.sector} · Likuiditas orderbook ${coin.quoteVolume24h >= 20_000_000 ? 'kuat' : 'menengah'}.`;
  if (tok && extra?.btcBench7d !== undefined && extra?.btcBench30d !== undefined) {
    const rs7 = tok.change7dPercent - extra.btcBench7d;
    const rs30 = tok.change30dPercent - extra.btcBench30d;
    rsBonus = rs7 > 3 && rs30 > 0 ? 11 : rs7 > 0 || rs30 > 0 ? 8 : 3;
    rsText = `RS vs BTC: 7D ${rs7 >= 0 ? '+' : ''}${rs7.toFixed(1)}% · 30D ${rs30 >= 0 ? '+' : ''}${rs30.toFixed(1)}% (${coin.sector}).`;
  } else {
    const hotSector = coin.sector === 'AI' || coin.sector === 'Layer 1' || coin.sector === 'RWA' ? 8 : 5;
    rsBonus = hotSector;
  }
  const p3 = Math.max(5, Math.min(25, volScore + rsBonus));

  // Pillar 4: Momentum & Akumulasi (Volume & Demand)
  let p4 = 13;
  if (coin.oiChange24h > 3) p4 += 5;
  else if (coin.oiChange24h < -3) p4 -= 3;
  if (coin.volumeSpikeRatio >= 1.35) p4 += 4;
  if (coin.fundingRate > 0 && coin.fundingRate < 0.03) p4 += 3;
  p4 = Math.max(5, Math.min(25, p4));

  const totalScore = Math.min(100, Math.max(0, p1 + p2 + p3 + p4));

  const tier: SpotQualityScore['tier'] =
    totalScore >= 76 && (!tok || tok.mcapToFdvRatio >= 0.65)
      ? 'Core'
      : totalScore >= 60
        ? 'Growth'
        : 'High-Risk';

  const verdict =
    tier === 'Core'
      ? 'Layak sebagai aset inti (Core Holding) untuk akumulasi bertahap jangka menengah-panjang.'
      : tier === 'Growth'
        ? 'Potensi pertumbuhan kuat; ideal dengan strategi 3-Layer DCA & disiplin ambil modal di TP2.'
        : 'Risiko dilusi atau struktur trend masih lemah; batasi alokasi ≤ 3–5% portofolio & tunggu konfirmasi support.';

  return {
    totalScore,
    tier,
    verdict,
    pillars: [
      {
        name: 'Tokenomics & FDV',
        score: p1,
        maxScore: 25,
        note: p1Note,
      },
      {
        name: 'Struktur 1D / 4H',
        score: p2,
        maxScore: 25,
        note: p2Note,
      },
      {
        name: 'Outperf & Likuiditas',
        score: p3,
        maxScore: 25,
        note: rsText,
      },
      {
        name: 'Flow & Demand',
        score: p4,
        maxScore: 25,
        note:
          coin.oiChange24h >= 0
            ? 'Aliran modal & minat beli mendukung fase akumulasi.'
            : 'Arus beli melambat; sabar antre di Layer 2–3 Support.',
      },
    ],
  };
}

export interface SpotDcaPlan {
  layers: DcaLayer[];
  projectedAvgEntry: number;
  totalEstimatedQty: number;
  invalidationPrice: number;
  tp1: number;
  tp2: number;
  tp3: number;
  roiTp1Percent: number;
  roiTp2Percent: number;
  roiTp3Percent: number;
  profitTp1Usdt: number;
  profitTp2Usdt: number;
  profitTp3Usdt: number;
  sellPercentAtTp2ForBreakEven: number;
  qtySoldAtTp2: number;
  moonbagQty: number;
  moonbagValueAtTp3Usdt: number;
}

export function generateSpotDcaPlan(
  currentPrice: number,
  budgetUsdt: number,
  supports: number[],
  resistances: number[] = [],
  weights: [number, number, number] = [20, 30, 50],
): SpotDcaPlan {
  const safePrice = Math.max(currentPrice, 1e-8);
  const safeBudget = Math.max(10, budgetUsdt);

  // Derive 3 layered support entry prices (Layer 1 near spot/S1, Layer 2 deeper support, Layer 3 deep value)
  const s1 =
    supports[0] && supports[0] < safePrice * 0.995 && supports[0] > safePrice * 0.9
      ? supports[0]
      : safePrice * 0.975;
  const s2 =
    supports[1] && supports[1] < s1 * 0.97 && supports[1] > safePrice * 0.8
      ? supports[1]
      : Math.min(s1 * 0.935, safePrice * 0.91);
  const s3 =
    supports[2] && supports[2] < s2 * 0.96 && supports[2] > safePrice * 0.65
      ? supports[2]
      : Math.min(s2 * 0.915, safePrice * 0.83);

  const specs: Array<{ layer: 1 | 2 | 3; label: string; pct: number; price: number }> = [
    { layer: 1, label: 'Layer 1 (Entry Awal)', pct: weights[0], price: s1 },
    { layer: 2, label: 'Layer 2 (Support Utama)', pct: weights[1], price: s2 },
    { layer: 3, label: 'Layer 3 (Deep Value)', pct: weights[2], price: s3 },
  ];

  const layers: DcaLayer[] = specs.map((w) => {
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

  // Anchor TP1 & TP2 to real Daily Resistance clusters if they offer solid Spot ROI, else clean structural targets
  const r1 = resistances[0];
  const r2 = resistances[1];
  const tp1Raw =
    r1 && r1 >= projectedAvgEntry * 1.18 && r1 <= projectedAvgEntry * 1.45
      ? r1 * 0.995
      : projectedAvgEntry * 1.25;
  const tp2Raw =
    r2 && r2 >= Math.max(tp1Raw * 1.2, projectedAvgEntry * 1.5) && r2 <= projectedAvgEntry * 2.1
      ? r2 * 0.995
      : Math.max(tp1Raw * 1.32, projectedAvgEntry * 1.65);
  const tp3Raw = Math.max(tp2Raw * 1.45, projectedAvgEntry * 2.45);

  const tp1 = Number(tp1Raw.toPrecision(6));
  const tp2 = Number(tp2Raw.toPrecision(6));
  const tp3 = Number(tp3Raw.toPrecision(6));

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

  const lowestLayerPrice = Math.min(...layers.map((l) => l.price).filter((p) => p > 0));
  const invalidationPrice = Number(
    (Number.isFinite(lowestLayerPrice) ? lowestLayerPrice * 0.92 : projectedAvgEntry * 0.78).toPrecision(6),
  );

  const roiTp1Percent = ((tp1 - projectedAvgEntry) / projectedAvgEntry) * 100;
  const roiTp2Percent = ((tp2 - projectedAvgEntry) / projectedAvgEntry) * 100;
  const roiTp3Percent = ((tp3 - projectedAvgEntry) / projectedAvgEntry) * 100;

  const profitTp1Usdt = Number((totalEstimatedQty * tp1 - budgetUsdt).toFixed(2));
  const profitTp2Usdt = Number((totalEstimatedQty * tp2 - budgetUsdt).toFixed(2));
  const profitTp3Usdt = Number((totalEstimatedQty * tp3 - budgetUsdt).toFixed(2));

  // Sell % at TP2 needed so 100% of initial capital (budgetUsdt) returns to USDT:
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
    invalidationPrice,
    tp1,
    tp2,
    tp3,
    roiTp1Percent,
    roiTp2Percent,
    roiTp3Percent,
    profitTp1Usdt,
    profitTp2Usdt,
    profitTp3Usdt,
    sellPercentAtTp2ForBreakEven,
    qtySoldAtTp2,
    moonbagQty,
    moonbagValueAtTp3Usdt,
  };
}
