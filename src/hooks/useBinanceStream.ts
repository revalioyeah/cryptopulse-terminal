import { useEffect, useRef } from 'react';
import type { MiniTickerPayload } from '../types';
import { createBinanceMiniTickerStream } from '../services/adapters/binanceAdapter';
import { useAppStore } from '../store/useAppStore';
import { useBinanceTickersQuery } from './useMarketQueries';

/**
 * Custom hook koneksi WebSocket Binance (`!miniTicker@arr`) dengan throttling buffer
 * serta cleanup penuh terhadap socket, timer, dan listener saat unmount.
 */
export function useBinanceStream(): void {
  const { data: tickerResult } = useBinanceTickersQuery();
  const seedCoins = useAppStore((s) => s.seedCoins);
  const applyMiniTicks = useAppStore((s) => s.applyMiniTicks);
  const setWsStatus = useAppStore((s) => s.setWsStatus);

  const pendingRef = useRef<Map<string, MiniTickerPayload>>(new Map());

  useEffect(() => {
    if (tickerResult?.coins && tickerResult.coins.length > 0) {
      seedCoins(tickerResult.coins, tickerResult.isFallback);
    }
  }, [tickerResult, seedCoins]);

  useEffect(() => {
    const flushInterval = window.setInterval(() => {
      if (pendingRef.current.size === 0) return;
      const batch = Array.from(pendingRef.current.values());
      pendingRef.current.clear();
      applyMiniTicks(batch);
    }, 900);

    const cleanupStream = createBinanceMiniTickerStream({
      onTick: (updates) => {
        for (const u of updates) {
          pendingRef.current.set(u.symbol, u);
        }
      },
      onStatus: (status) => {
        setWsStatus(status);
      },
    });

    return () => {
      window.clearInterval(flushInterval);
      cleanupStream();
      pendingRef.current.clear();
    };
  }, [applyMiniTicks, setWsStatus]);
}
