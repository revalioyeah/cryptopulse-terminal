import type { Candle, Coin, MiniTickerPayload, Timeframe } from '../../types';
import {
  COIN_META_MAP,
  buildFallbackCoins,
  deriveTechnicalHints,
  generateFallbackCandles,
  isExcludedBinanceBase,
  resolveSectorForBase,
} from './mockData';

const BINANCE_REST_BASE =
  (import.meta.env.VITE_BINANCE_REST_URL as string | undefined)?.trim() ||
  'https://data-api.binance.vision';

const BINANCE_WS_BASE =
  (import.meta.env.VITE_BINANCE_WS_URL as string | undefined)?.trim() ||
  'wss://data-stream.binance.vision/ws';

interface BinanceTicker24hRaw {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  lastPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
}

interface BinanceExchangeInfoRaw {
  symbols?: Array<{
    symbol: string;
    status: string;
    baseAsset: string;
    quoteAsset: string;
  }>;
}

interface BinanceMiniTickerWsRaw {
  s: string; // Symbol
  c: string; // Close price
  o: string; // Open price
  h: string; // High price
  l: string; // Low price
  v: string; // Total traded base asset volume
  q: string; // Total traded quote asset volume
  E: number; // Event time
}

type BinanceKlineRaw = [
  number, // Open time (ms)
  string, // Open
  string, // High
  string, // Low
  string, // Close
  string, // Volume
  number, // Close time
  string,
  number,
  string,
  string,
  string,
];

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export interface TickerFetchResult {
  coins: Coin[];
  isFallback: boolean;
}

export async function fetchBinanceTickers24h(): Promise<TickerFetchResult> {
  try {
    const [tickerRes, exchangeInfoRes] = await Promise.all([
      fetchWithTimeout(`${BINANCE_REST_BASE}/api/v3/ticker/24hr`, 8500),
      fetchWithTimeout(`${BINANCE_REST_BASE}/api/v3/exchangeInfo?permissions=SPOT`, 8500).catch(
        () => null,
      ),
    ]);

    if (!tickerRes.ok) throw new Error(`Binance REST HTTP ${tickerRes.status}`);
    const data = (await tickerRes.json()) as BinanceTicker24hRaw[];
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Empty ticker response');
    }

    // Build authoritative set of active SPOT TRADING USDT pairs from Binance exchangeInfo
    let tradingUsdtMap: Map<string, string> | null = null;
    if (exchangeInfoRes && exchangeInfoRes.ok) {
      try {
        const info = (await exchangeInfoRes.json()) as BinanceExchangeInfoRaw;
        if (Array.isArray(info.symbols) && info.symbols.length > 0) {
          tradingUsdtMap = new Map();
          for (const s of info.symbols) {
            if (s.quoteAsset === 'USDT' && s.status === 'TRADING') {
              tradingUsdtMap.set(s.symbol, s.baseAsset);
            }
          }
        }
      } catch {
        tradingUsdtMap = null;
      }
    }

    const now = Date.now();
    const mapped: Coin[] = [];

    for (const row of data) {
      if (!row.symbol.endsWith('USDT')) continue;

      let baseAsset: string;
      if (tradingUsdtMap) {
        const verifiedBase = tradingUsdtMap.get(row.symbol);
        if (!verifiedBase) continue; // Skip delisted / BREAK / non-SPOT pairs
        baseAsset = verifiedBase;
      } else {
        baseAsset = row.symbol.slice(0, -4);
      }

      if (!baseAsset || isExcludedBinanceBase(baseAsset)) continue;

      const price = Number.parseFloat(row.lastPrice);
      const priceChange24h = Number.parseFloat(row.priceChange);
      const priceChangePercent24h = Number.parseFloat(row.priceChangePercent);
      const high24h = Number.parseFloat(row.highPrice);
      const low24h = Number.parseFloat(row.lowPrice);
      const volume24h = Number.parseFloat(row.volume);
      const quoteVolume24h = Number.parseFloat(row.quoteVolume);

      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(quoteVolume24h) || quoteVolume24h <= 0) {
        continue;
      }

      const meta = COIN_META_MAP[row.symbol];
      const hints = deriveTechnicalHints(
        row.symbol,
        price,
        high24h,
        low24h,
        priceChangePercent24h,
        quoteVolume24h,
      );

      mapped.push({
        symbol: row.symbol,
        baseAsset,
        name: meta?.name ?? baseAsset,
        sector: meta?.sector ?? resolveSectorForBase(baseAsset),
        price,
        priceChange24h,
        priceChangePercent24h,
        high24h,
        low24h,
        volume24h,
        quoteVolume24h,
        marketCapRank: meta?.marketCapRank ?? 999,
        lastUpdated: now,
        ...hints,
      });
    }

    if (mapped.length === 0) {
      throw new Error('No active USDT pairs parsed');
    }

    // Sort by 24h USDT volume descending and assign dynamic rank for non-curated pairs
    mapped.sort((a, b) => b.quoteVolume24h - a.quoteVolume24h);
    for (let i = 0; i < mapped.length; i++) {
      if (mapped[i].marketCapRank === 999) {
        mapped[i].marketCapRank = Math.max(40, i + 1);
      }
    }

    return { coins: mapped, isFallback: false };
  } catch {
    return { coins: buildFallbackCoins(), isFallback: true };
  }
}

export interface KlinesFetchResult {
  candles: Candle[];
  isFallback: boolean;
}

export async function fetchBinanceKlines(
  symbol: string,
  timeframe: Timeframe,
  limit = 500,
  anchorPrice?: number,
): Promise<KlinesFetchResult> {
  const clampedLimit = Math.min(1000, Math.max(50, limit));
  try {
    const url = `${BINANCE_REST_BASE}/api/v3/klines?symbol=${encodeURIComponent(
      symbol,
    )}&interval=${timeframe}&limit=${clampedLimit}`;
    const res = await fetchWithTimeout(url, 6500);
    if (!res.ok) throw new Error(`Binance Klines HTTP ${res.status}`);
    const rows = (await res.json()) as BinanceKlineRaw[];
    if (!Array.isArray(rows) || rows.length < 20) {
      throw new Error('Insufficient klines');
    }

    const candles: Candle[] = rows.map((r) => ({
      time: Math.floor(r[0] / 1000),
      open: Number.parseFloat(r[1]),
      high: Number.parseFloat(r[2]),
      low: Number.parseFloat(r[3]),
      close: Number.parseFloat(r[4]),
      volume: Number.parseFloat(r[5]),
    }));

    return { candles, isFallback: false };
  } catch {
    return {
      candles: generateFallbackCandles(symbol, timeframe, clampedLimit, anchorPrice),
      isFallback: true,
    };
  }
}

export interface MiniTickerStreamCallbacks {
  onTick: (updates: MiniTickerPayload[]) => void;
  onStatus: (status: 'connected' | 'connecting' | 'reconnecting' | 'fallback') => void;
}

/**
 * Adapter WebSocket Binance (`!miniTicker@arr`) dengan auto-reconnect dan fallback polling
 * REST Binance real-time (TIDAK pernah menyuntikkan harga simulasi palsu ke atas data live).
 */
export function createBinanceMiniTickerStream(
  callbacks: MiniTickerStreamCallbacks,
): () => void {
  let ws: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let restPollInterval: number | null = null;
  let connectTimeout: number | null = null;
  let disposed = false;
  let retryCount = 0;

  const stopRestPoll = (): void => {
    if (restPollInterval !== null) {
      window.clearInterval(restPollInterval);
      restPollInterval = null;
    }
  };

  const pollBinanceRestOnce = async (): Promise<void> => {
    if (disposed) return;
    try {
      const res = await fetchWithTimeout(`${BINANCE_REST_BASE}/api/v3/ticker/24hr`, 7500);
      if (!res.ok || disposed) return;
      const rows = (await res.json()) as BinanceTicker24hRaw[];
      if (!Array.isArray(rows) || disposed) return;
      const now = Date.now();
      const updates: MiniTickerPayload[] = [];
      for (const item of rows) {
        if (!item.symbol.endsWith('USDT')) continue;
        const close = Number.parseFloat(item.lastPrice);
        const change = Number.parseFloat(item.priceChange);
        const open = close - change;
        const high = Number.parseFloat(item.highPrice);
        const low = Number.parseFloat(item.lowPrice);
        const volume = Number.parseFloat(item.volume);
        const quoteVolume = Number.parseFloat(item.quoteVolume);
        if (!Number.isFinite(close) || close <= 0) continue;
        updates.push({
          symbol: item.symbol,
          close,
          open: Number.isFinite(open) && open > 0 ? open : close,
          high,
          low,
          volume,
          quoteVolume,
          eventTime: now,
        });
      }
      if (updates.length > 0 && !disposed) {
        callbacks.onTick(updates);
      }
    } catch {
      // Tetap tunggu reconnect WS / interval berikutnya tanpa menulis data simulasi palsu
    }
  };

  const startRestFallbackPolling = (): void => {
    if (disposed || restPollInterval !== null) return;
    callbacks.onStatus('fallback');
    void pollBinanceRestOnce();
    restPollInterval = window.setInterval(() => {
      void pollBinanceRestOnce();
    }, 10_000);
  };

  const connect = (): void => {
    if (disposed) return;
    callbacks.onStatus(retryCount === 0 ? 'connecting' : 'reconnecting');

    try {
      ws = new WebSocket(`${BINANCE_WS_BASE}/!miniTicker@arr`);
    } catch {
      startRestFallbackPolling();
      return;
    }

    connectTimeout = window.setTimeout(() => {
      if (ws && ws.readyState !== WebSocket.OPEN) {
        try {
          ws.close();
        } catch {
          // ignore close errors
        }
        startRestFallbackPolling();
      }
    }, 5500);

    ws.onopen = () => {
      if (disposed) return;
      if (connectTimeout !== null) {
        window.clearTimeout(connectTimeout);
        connectTimeout = null;
      }
      retryCount = 0;
      stopRestPoll();
      callbacks.onStatus('connected');
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      if (disposed) return;
      try {
        const parsed = JSON.parse(event.data) as BinanceMiniTickerWsRaw[];
        if (!Array.isArray(parsed)) return;
        const updates: MiniTickerPayload[] = [];
        for (const item of parsed) {
          if (!item.s.endsWith('USDT')) continue;
          const close = Number.parseFloat(item.c);
          const open = Number.parseFloat(item.o);
          const high = Number.parseFloat(item.h);
          const low = Number.parseFloat(item.l);
          const volume = Number.parseFloat(item.v);
          const quoteVolume = Number.parseFloat(item.q);
          if (!Number.isFinite(close) || close <= 0) continue;
          updates.push({
            symbol: item.s,
            close,
            open,
            high,
            low,
            volume,
            quoteVolume,
            eventTime: item.E || Date.now(),
          });
        }
        if (updates.length > 0) {
          callbacks.onTick(updates);
        }
      } catch {
        // Ignore malformed frame
      }
    };

    ws.onerror = () => {
      if (disposed) return;
      startRestFallbackPolling();
    };

    ws.onclose = () => {
      if (disposed) return;
      if (connectTimeout !== null) {
        window.clearTimeout(connectTimeout);
        connectTimeout = null;
      }
      retryCount += 1;
      if (retryCount >= 2) {
        startRestFallbackPolling();
      } else {
        callbacks.onStatus('reconnecting');
      }
      const delayMs = Math.min(30_000, 3000 * retryCount);
      reconnectTimer = window.setTimeout(connect, delayMs);
    };
  };

  connect();

  return () => {
    disposed = true;
    stopRestPoll();
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (connectTimeout !== null) {
      window.clearTimeout(connectTimeout);
      connectTimeout = null;
    }
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        // ignore
      }
      ws = null;
    }
  };
}
