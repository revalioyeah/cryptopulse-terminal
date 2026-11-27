import type { Coin, DerivativesSnapshot, LiquidationCluster } from '../../types';

const COINGLASS_KEY = (import.meta.env.VITE_COINGLASS_API_KEY as string | undefined)?.trim();

function seededNoise(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function getNextFundingTimestamp(): number {
  const now = new Date();
  const utcHours = now.getUTCHours();
  const nextSlot = Math.ceil((utcHours + 0.001) / 8) * 8;
  const target = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), nextSlot, 0, 0, 0),
  );
  return target.getTime();
}

/**
 * Modular Derivatives Adapter — siap disambungkan ke Coinglass / Binance Futures API
 * menggunakan VITE_COINGLASS_API_KEY, dengan fallback kalkulasi deterministik realistis.
 */
export async function fetchDerivativesSnapshot(coin: Coin): Promise<DerivativesSnapshot> {
  // Hook point for live Coinglass API when user configures VITE_COINGLASS_API_KEY
  if (COINGLASS_KEY) {
    try {
      const res = await fetch(
        `https://open-api-v3.coinglass.com/api/futures/openInterest/ohlc-history?symbol=${encodeURIComponent(
          coin.baseAsset,
        )}`,
        {
          headers: { 'CG-API-KEY': COINGLASS_KEY },
        },
      );
      if (res.ok) {
        // Live response parser placeholder when external key is supplied
        await res.json();
      }
    } catch {
      // Fallback below
    }
  }

  const n = seededNoise(coin.symbol);
  const oiRatio = coin.marketCapRank <= 5 ? 2.4 + n * 1.4 : 0.65 + n * 1.1;
  const openInterestUsd = Math.max(18_000_000, coin.quoteVolume24h * oiRatio);
  const longRatioPercent = Number(
    Math.min(68, Math.max(34, 50 + coin.priceChangePercent24h * 0.95 + (n - 0.5) * 6)).toFixed(1),
  );
  const shortRatioPercent = Number((100 - longRatioPercent).toFixed(1));

  return {
    symbol: coin.symbol,
    fundingRate8h: Number(coin.fundingRate.toFixed(4)),
    nextFundingTime: getNextFundingTimestamp(),
    openInterestUsd,
    openInterestChange24h: coin.oiChange24h,
    longRatioPercent,
    shortRatioPercent,
    isMock: true,
  };
}

export function computeLiquidationClusters(coin: Coin): LiquidationCluster[] {
  const n = seededNoise(`${coin.symbol}-liq`);
  const baseVol = Math.max(4_500_000, coin.quoteVolume24h * 0.08);
  const p = coin.price;

  // Approximate liquidation distance for 50x (~1.85%) and 25x (~3.75%)
  const short50Price = p * 1.0185;
  const short25Price = p * 1.0375;
  const long50Price = p * 0.9815;
  const long25Price = p * 0.9625;

  const bullBias = coin.priceChangePercent24h >= 0 ? 1.15 : 0.85;

  return [
    {
      leverage: '25x',
      side: 'SHORT_LIQ',
      price: short25Price,
      distancePercent: 3.75,
      estimatedVolumeUsd: baseVol * (1.25 + n * 0.6) * bullBias,
      intensity: Math.min(96, Math.round(62 + n * 30)),
    },
    {
      leverage: '50x',
      side: 'SHORT_LIQ',
      price: short50Price,
      distancePercent: 1.85,
      estimatedVolumeUsd: baseVol * (0.85 + n * 0.5) * bullBias,
      intensity: Math.min(92, Math.round(48 + n * 34)),
    },
    {
      leverage: '50x',
      side: 'LONG_LIQ',
      price: long50Price,
      distancePercent: -1.85,
      estimatedVolumeUsd: baseVol * (0.9 + (1 - n) * 0.55) / bullBias,
      intensity: Math.min(94, Math.round(52 + (1 - n) * 32)),
    },
    {
      leverage: '25x',
      side: 'LONG_LIQ',
      price: long25Price,
      distancePercent: -3.75,
      estimatedVolumeUsd: baseVol * (1.35 + (1 - n) * 0.65) / bullBias,
      intensity: Math.min(98, Math.round(68 + (1 - n) * 26)),
    },
  ];
}
