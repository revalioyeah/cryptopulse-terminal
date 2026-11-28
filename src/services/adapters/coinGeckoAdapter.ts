import type { Coin, CoinTokenomicsRecord, GlobalMarketData } from '../../types';
import { buildFallbackGlobalMarket, isExcludedBinanceBase } from './mockData';

const cgEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;

const COINGECKO_BASE = cgEnv?.VITE_COINGECKO_API_URL?.trim() || 'https://api.coingecko.com/api/v3';

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

interface CoinGeckoMarketRaw {
  id: string;
  symbol: string;
  name: string;
  market_cap_rank?: number | null;
  market_cap?: number | null;
  fully_diluted_valuation?: number | null;
  circulating_supply?: number | null;
  total_supply?: number | null;
  max_supply?: number | null;
  price_change_percentage_24h?: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  price_change_percentage_30d_in_currency?: number | null;
  ath_change_percentage?: number | null;
}

const WRAPPED_OR_DERIVATIVE_BASES = new Set([
  'WBTC',
  'WETH',
  'STETH',
  'WSTETH',
  'WEETH',
  'CBETH',
  'WBETH',
  'RETH',
  'BNSOL',
  'MSOL',
  'JITOSOL',
  'CBBTC',
  'TBTC',
  'LBTC',
  'SUSDS',
  'SUSDE',
  'USDE',
  'USDS',
  'USD1',
  'RLUSD',
  'PYUSD',
  'BUIDL',
  'PAXG',
  'XAUT',
  // Tokenized equities / ETFs (not native crypto assets)
  'NVDAB',
  'TSLAB',
  'AAPLB',
  'AMZNB',
  'MSFTB',
  'METAB',
  'GOOGLB',
  'MSTRB',
  'COINB',
  'SOXLB',
  'SKHYB',
  'QQQB',
  'SPYB',
  'SLVB',
  'GLDB',
  'INTCB',
  'AMDB',
  'PLTRB',
]);

let tokenomicsCache: {
  fetchedAt: number;
  records: CoinTokenomicsRecord[];
  isFallback: boolean;
} | null = null;

const TOKENOMICS_TTL_MS = 10 * 60 * 1000; // 10 minutes cache to avoid CoinGecko 429

export async function fetchGlobalMarketData(): Promise<GlobalMarketData> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 6000);
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
      updatedAt: d.updated_at ? d.updated_at * 1000 : Date.now(),
      isFallback: false,
    };
  } catch {
    return buildFallbackGlobalMarket();
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function buildFallbackTokenomicsFromBinance(binanceCoins: Coin[]): CoinTokenomicsRecord[] {
  const liquid = [...binanceCoins]
    .filter((c) => !isExcludedBinanceBase(c.baseAsset) && !WRAPPED_OR_DERIVATIVE_BASES.has(c.baseAsset))
    .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h)
    .slice(0, 100);

  return liquid.map((coin, idx) => {
    const estRank = coin.marketCapRank < 900 ? coin.marketCapRank : idx + 1;
    const estMcap = Math.max(coin.quoteVolume24h * 8, 50_000_000);
    const estFloat = estRank <= 15 ? 0.88 : estRank <= 40 ? 0.72 : 0.6;
    const estFdv = estMcap / estFloat;
    return {
      symbol: coin.symbol,
      baseAsset: coin.baseAsset,
      name: coin.name,
      marketCapRank: estRank,
      marketCapUsd: estMcap,
      fdvUsd: estFdv,
      mcapToFdvRatio: estFloat,
      circulatingSupply: coin.price > 0 ? estMcap / coin.price : 0,
      totalSupply: coin.price > 0 ? estFdv / coin.price : null,
      maxSupply: estRank <= 20 ? (coin.price > 0 ? estFdv / coin.price : null) : null,
      change24hPercent: coin.priceChangePercent24h,
      change7dPercent: Number((coin.priceChangePercent24h * 1.8).toFixed(2)),
      change30dPercent: Number((coin.priceChangePercent24h * 3.1).toFixed(2)),
      athChangePercent: -35,
      isFallback: true,
    };
  });
}

/**
 * Fetches Top 100 tradable Binance Spot coins with real CoinGecko Market Cap, FDV,
 * circulating float ratio (MCap/FDV), and 7D/30D relative performance for the Spot 100-Coin Funnel.
 */
export async function fetchTop100Tokenomics(
  binanceCoins: Coin[],
  forceRefresh = false,
): Promise<{ records: CoinTokenomicsRecord[]; isFallback: boolean }> {
  const now = Date.now();
  if (!forceRefresh && tokenomicsCache && now - tokenomicsCache.fetchedAt < TOKENOMICS_TTL_MS) {
    return { records: tokenomicsCache.records, isFallback: tokenomicsCache.isFallback };
  }

  const binanceByBase = new Map<string, Coin>();
  for (const c of binanceCoins) {
    binanceByBase.set(c.baseAsset.toUpperCase(), c);
  }

  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 9000);

  try {
    // Request Top 250 by Market Cap so after excluding stables/wrapped/non-Binance tokens we fill 100 native crypto assets
    const url = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=7d,30d`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`CoinGecko Markets HTTP ${res.status}`);

    const rawList = (await res.json()) as CoinGeckoMarketRaw[];
    if (!Array.isArray(rawList) || rawList.length === 0) {
      throw new Error('Empty CoinGecko markets payload');
    }

    const seenSymbols = new Set<string>();
    const records: CoinTokenomicsRecord[] = [];

    for (const item of rawList) {
      const base = (item.symbol || '').toUpperCase().trim();
      if (!base || isExcludedBinanceBase(base) || WRAPPED_OR_DERIVATIVE_BASES.has(base)) {
        continue;
      }

      const binanceCoin = binanceByBase.get(base);
      if (!binanceCoin || seenSymbols.has(binanceCoin.symbol)) continue;
      seenSymbols.add(binanceCoin.symbol);

      const mcap = Number(item.market_cap ?? 0);
      const rawFdv = Number(item.fully_diluted_valuation ?? 0);
      const fdv = rawFdv > 0 ? Math.max(rawFdv, mcap) : mcap;
      const mcapToFdvRatio = fdv > 0 ? Math.min(1, Math.max(0.05, mcap / fdv)) : 0.65;

      records.push({
        symbol: binanceCoin.symbol,
        baseAsset: binanceCoin.baseAsset,
        name: item.name || binanceCoin.name,
        marketCapRank: item.market_cap_rank ?? records.length + 1,
        marketCapUsd: mcap,
        fdvUsd: fdv,
        mcapToFdvRatio: Number(mcapToFdvRatio.toFixed(4)),
        circulatingSupply: Number(item.circulating_supply ?? 0),
        totalSupply: item.total_supply ?? null,
        maxSupply: item.max_supply ?? null,
        change24hPercent: binanceCoin.priceChangePercent24h,
        change7dPercent: Number(
          (item.price_change_percentage_7d_in_currency ?? binanceCoin.priceChangePercent24h).toFixed(2),
        ),
        change30dPercent: Number(
          (item.price_change_percentage_30d_in_currency ?? binanceCoin.priceChangePercent24h * 2).toFixed(2),
        ),
        athChangePercent: Number((item.ath_change_percentage ?? -40).toFixed(2)),
        isFallback: false,
      });

      if (records.length >= 100) break;
    }

    // If Binance overlap from Top 200 yielded slightly fewer than 100, pad with highest-volume Binance Spot USDT pairs
    if (records.length < 100) {
      const extras = [...binanceCoins]
        .filter(
          (c) =>
            !seenSymbols.has(c.symbol) &&
            !isExcludedBinanceBase(c.baseAsset) &&
            !WRAPPED_OR_DERIVATIVE_BASES.has(c.baseAsset),
        )
        .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h);

      for (const extra of extras) {
        if (records.length >= 100) break;
        seenSymbols.add(extra.symbol);
        const estMcap = Math.max(extra.quoteVolume24h * 6, 30_000_000);
        const estFloat = 0.62;
        records.push({
          symbol: extra.symbol,
          baseAsset: extra.baseAsset,
          name: extra.name,
          marketCapRank: 150 + records.length,
          marketCapUsd: estMcap,
          fdvUsd: estMcap / estFloat,
          mcapToFdvRatio: estFloat,
          circulatingSupply: extra.price > 0 ? estMcap / extra.price : 0,
          totalSupply: null,
          maxSupply: null,
          change24hPercent: extra.priceChangePercent24h,
          change7dPercent: Number((extra.priceChangePercent24h * 1.4).toFixed(2)),
          change30dPercent: Number((extra.priceChangePercent24h * 2.2).toFixed(2)),
          athChangePercent: -50,
          isFallback: true,
        });
      }
    }

    tokenomicsCache = { fetchedAt: now, records, isFallback: false };
    return { records, isFallback: false };
  } catch {
    const fallback = buildFallbackTokenomicsFromBinance(binanceCoins);
    tokenomicsCache = { fetchedAt: now - TOKENOMICS_TTL_MS / 2, records: fallback, isFallback: true };
    return { records: fallback, isFallback: true };
  } finally {
    globalThis.clearTimeout(timer);
  }
}
