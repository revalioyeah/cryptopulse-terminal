import type { GlobalMarketData } from '../../types';
import { buildFallbackGlobalMarket } from './mockData';

const COINGECKO_BASE =
  (import.meta.env.VITE_COINGECKO_API_URL as string | undefined)?.trim() ||
  'https://api.coingecko.com/api/v3';

interface CoinGeckoGlobalResponse {
  data?: {
    active_cryptocurrencies?: number;
    total_market_cap?: Record<string, number>;
    total_volume?: Record<string, number>;
    market_cap_percentage?: Record<string, number>;
    market_cap_change_percentage_24h_usd?: number;
    updated_at?: number;
  };
}

export async function fetchGlobalMarketData(): Promise<GlobalMarketData> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${COINGECKO_BASE}/global`, { signal: controller.signal });
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const payload = (await res.json()) as CoinGeckoGlobalResponse;
    const d = payload.data;
    if (!d?.total_market_cap?.usd) {
      throw new Error('Invalid CoinGecko payload');
    }

    return {
      totalMarketCapUsd: d.total_market_cap.usd,
      marketCapChangePercent24h: d.market_cap_change_percentage_24h_usd ?? 0,
      totalVolume24hUsd: d.total_volume?.usd ?? 0,
      btcDominance: d.market_cap_percentage?.btc ?? 56.0,
      usdtDominance: d.market_cap_percentage?.usdt ?? 4.2,
      ethDominance: d.market_cap_percentage?.eth ?? 12.5,
      activeCryptocurrencies: d.active_cryptocurrencies ?? 14_000,
      updatedAt: (d.updated_at ? d.updated_at * 1000 : Date.now()),
      isFallback: false,
    };
  } catch {
    return buildFallbackGlobalMarket();
  } finally {
    window.clearTimeout(timer);
  }
}
