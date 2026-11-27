import type { WhaleTx, WhaleTxType } from '../../types';

const BINANCE_REST_BASE =
  (import.meta.env.VITE_BINANCE_REST_URL as string | undefined)?.trim() ||
  'https://data-api.binance.vision';

const BINANCE_STREAM_BASE =
  (import.meta.env.VITE_BINANCE_STREAM_URL as string | undefined)?.trim() ||
  'wss://data-stream.binance.vision/stream';

export const WHALE_MIN_NOTIONAL_USD = 25_000;
export const WHALE_MEGA_BLOCK_USD = 250_000;

export const MONITORED_WHALE_PAIRS: Array<{ symbol: string; baseAsset: string }> = [
  { symbol: 'BTCUSDT', baseAsset: 'BTC' },
  { symbol: 'ETHUSDT', baseAsset: 'ETH' },
  { symbol: 'SOLUSDT', baseAsset: 'SOL' },
  { symbol: 'BNBUSDT', baseAsset: 'BNB' },
  { symbol: 'XRPUSDT', baseAsset: 'XRP' },
  { symbol: 'DOGEUSDT', baseAsset: 'DOGE' },
  { symbol: 'SUIUSDT', baseAsset: 'SUI' },
  { symbol: 'LINKUSDT', baseAsset: 'LINK' },
  { symbol: 'AVAXUSDT', baseAsset: 'AVAX' },
  { symbol: 'ADAUSDT', baseAsset: 'ADA' },
  { symbol: 'PEPEUSDT', baseAsset: 'PEPE' },
  { symbol: 'TAOUSDT', baseAsset: 'TAO' },
];

interface BinanceAggTradeRestRow {
  a: number; // Aggregate tradeId
  p: string; // Price
  q: string; // Quantity
  T: number; // Timestamp (ms)
  m: boolean; // Was the buyer the maker? (true => Taker Sell, false => Taker Buy)
}

interface BinanceAggTradeWsEnvelope {
  stream?: string;
  data?: {
    e: string;
    s: string; // Symbol
    a: number; // Aggregate trade ID
    p: string; // Price
    q: string; // Quantity
    T: number; // Trade time
    m: boolean; // Is the buyer the market maker?
  };
}

function mapAggTradeToWhaleTx(params: {
  symbol: string;
  baseAsset: string;
  aggId: number;
  price: number;
  qty: number;
  timestamp: number;
  isBuyerMaker: boolean;
}): WhaleTx | null {
  const amountUsd = params.price * params.qty;
  if (!Number.isFinite(amountUsd) || amountUsd < WHALE_MIN_NOTIONAL_USD) {
    return null;
  }

  // m === false -> Buyer is taker (aggressive market buy sweeping asks)
  // m === true  -> Seller is taker (aggressive market sell hitting bids)
  const type: WhaleTxType = params.isBuyerMaker ? 'WHALE_SELL' : 'WHALE_BUY';
  const isMegaBlock = amountUsd >= WHALE_MEGA_BLOCK_USD;

  return {
    id: `${params.symbol}-${params.aggId}`,
    symbol: params.symbol,
    baseAsset: params.baseAsset,
    price: params.price,
    amount: params.qty,
    amountUsd: Math.round(amountUsd),
    type,
    fromLabel: type === 'WHALE_BUY' ? 'Orderbook Ask' : 'Market Seller (Taker)',
    toLabel: type === 'WHALE_BUY' ? 'Institutional Buyer (Taker)' : 'Orderbook Bid',
    txHash: `Trade #${params.aggId}`,
    blockchain: 'Binance Spot',
    timestamp: params.timestamp || Date.now(),
    isMegaBlock,
    source: 'Binance Live',
  };
}

async function fetchSymbolAggTrades(
  symbol: string,
  baseAsset: string,
): Promise<WhaleTx[]> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 6500);
  try {
    const res = await fetch(
      `${BINANCE_REST_BASE}/api/v3/aggTrades?symbol=${encodeURIComponent(symbol)}&limit=500`,
      { signal: controller.signal },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as BinanceAggTradeRestRow[];
    if (!Array.isArray(rows)) return [];

    const result: WhaleTx[] = [];
    for (const r of rows) {
      const price = Number.parseFloat(r.p);
      const qty = Number.parseFloat(r.q);
      const tx = mapAggTradeToWhaleTx({
        symbol,
        baseAsset,
        aggId: r.a,
        price,
        qty,
        timestamp: r.T,
        isBuyerMaker: Boolean(r.m),
      });
      if (tx) result.push(tx);
    }
    return result;
  } catch {
    return [];
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Mengambil eksekusi block order besar (>= $25,000) REAL-TIME terbaru dari Binance Spot `aggTrades`
 * pada 12 pair likuiditas utama tanpa data simulasi / acak.
 */
export async function fetchInitialWhaleFeed(): Promise<WhaleTx[]> {
  const settled = await Promise.allSettled(
    MONITORED_WHALE_PAIRS.map((p) => fetchSymbolAggTrades(p.symbol, p.baseAsset)),
  );

  const merged: WhaleTx[] = [];
  const seen = new Set<string>();
  for (const res of settled) {
    if (res.status !== 'fulfilled') continue;
    for (const tx of res.value) {
      if (seen.has(tx.id)) continue;
      seen.add(tx.id);
      merged.push(tx);
    }
  }

  return merged.sort((a, b) => b.timestamp - a.timestamp).slice(0, 120);
}

export type WhaleStreamStatus = 'connected' | 'connecting' | 'reconnecting';

/**
 * Live WebSocket Combined Stream Binance (`@aggTrade`) untuk memantau eksekusi block trade
 * bernilai besar (>= $25K) secara real-time dengan cleanup & auto-reconnect aman.
 */
export function subscribeWhaleStream(
  onTx: (tx: WhaleTx) => void,
  onStatus?: (status: WhaleStreamStatus) => void,
): () => void {
  let ws: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let disposed = false;
  let retryCount = 0;

  const streams = MONITORED_WHALE_PAIRS.map((p) => `${p.symbol.toLowerCase()}@aggTrade`).join('/');
  const baseBySymbol = new Map(MONITORED_WHALE_PAIRS.map((p) => [p.symbol, p.baseAsset]));

  const connect = (): void => {
    if (disposed) return;
    onStatus?.(retryCount === 0 ? 'connecting' : 'reconnecting');

    try {
      ws = new WebSocket(`${BINANCE_STREAM_BASE}?streams=${streams}`);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      if (disposed) return;
      retryCount = 0;
      onStatus?.('connected');
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      if (disposed) return;
      try {
        const env = JSON.parse(event.data) as BinanceAggTradeWsEnvelope;
        const d = env.data;
        if (!d || !d.s) return;
        const price = Number.parseFloat(d.p);
        const qty = Number.parseFloat(d.q);
        const baseAsset = baseBySymbol.get(d.s) ?? d.s.replace(/USDT$/, '');
        const tx = mapAggTradeToWhaleTx({
          symbol: d.s,
          baseAsset,
          aggId: d.a,
          price,
          qty,
          timestamp: d.T,
          isBuyerMaker: Boolean(d.m),
        });
        if (tx) {
          onTx(tx);
        }
      } catch {
        // Ignore malformed frame
      }
    };

    ws.onerror = () => {
      // Handled by onclose reconnect
    };

    ws.onclose = () => {
      if (disposed) return;
      scheduleReconnect();
    };
  };

  const scheduleReconnect = (): void => {
    if (disposed) return;
    retryCount += 1;
    onStatus?.('reconnecting');
    const delayMs = Math.min(20_000, 2500 * retryCount);
    reconnectTimer = window.setTimeout(connect, delayMs);
  };

  connect();

  return () => {
    disposed = true;
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
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
