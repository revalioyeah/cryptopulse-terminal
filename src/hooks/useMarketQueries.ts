import { useQuery } from '@tanstack/react-query';
import type { Timeframe } from '../types';
import { fetchBinanceKlines, fetchBinanceTickers24h } from '../services/adapters/binanceAdapter';
import { fetchGlobalMarketData } from '../services/adapters/coinGeckoAdapter';
import { fetchFearGreedIndex } from '../services/adapters/fearGreedAdapter';

export function useBinanceTickersQuery() {
  return useQuery({
    queryKey: ['binance', 'tickers24h'],
    queryFn: fetchBinanceTickers24h,
    staleTime: 60_000, // 1 min
    refetchInterval: 120_000,
    retry: 1,
  });
}

export function useGlobalMarketQuery() {
  return useQuery({
    queryKey: ['coingecko', 'global'],
    queryFn: fetchGlobalMarketData,
    staleTime: 7 * 60_000, // 7 min cache (within 5–10 min spec)
    gcTime: 15 * 60_000,
    refetchInterval: 8 * 60_000,
    retry: 1,
  });
}

export function useFearGreedQuery() {
  return useQuery({
    queryKey: ['alternative', 'fearGreed'],
    queryFn: fetchFearGreedIndex,
    staleTime: 15 * 60_000, // 15 min cache as required
    gcTime: 30 * 60_000,
    refetchInterval: 15 * 60_000,
    retry: 1,
  });
}

export function useBinanceKlinesQuery(
  symbol: string,
  timeframe: Timeframe,
  limit = 500,
  anchorPrice?: number,
) {
  return useQuery({
    queryKey: ['binance', 'klines', symbol, timeframe, limit],
    queryFn: () => fetchBinanceKlines(symbol, timeframe, limit, anchorPrice),
    staleTime: timeframe === '5m' ? 30_000 : timeframe === '15m' ? 60_000 : 120_000,
    gcTime: 10 * 60_000,
    retry: 1,
    enabled: Boolean(symbol),
  });
}
