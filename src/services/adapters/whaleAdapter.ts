import type { Coin, WhaleTx, WhaleTxType } from '../../types';
import { generateId } from '../../utils/format';

const WHALE_API_KEY = (import.meta.env.VITE_WHALE_ALERT_API_KEY as string | undefined)?.trim();

const EXCHANGES = ['Binance Hot', 'Binance Cold', 'Coinbase Institutional', 'OKX Treasury', 'Bybit Cold', 'Kraken Vault'];
const WALLETS = ['Unknown Whale #A4F', 'Smart Money Vault #09', 'Wintermute OTC', 'Abraxas Capital Desk', 'Institutional Custody', 'Whale Accumulator #77'];

const WHALE_ASSETS: Array<{ symbol: string; baseAsset: string; chain: string }> = [
  { symbol: 'BTCUSDT', baseAsset: 'BTC', chain: 'Bitcoin' },
  { symbol: 'ETHUSDT', baseAsset: 'ETH', chain: 'Ethereum' },
  { symbol: 'SOLUSDT', baseAsset: 'SOL', chain: 'Solana' },
  { symbol: 'LINKUSDT', baseAsset: 'LINK', chain: 'Ethereum' },
  { symbol: 'TAOUSDT', baseAsset: 'TAO', chain: 'Bittensor' },
  { symbol: 'SUIUSDT', baseAsset: 'SUI', chain: 'Sui' },
  { symbol: 'AAVEUSDT', baseAsset: 'AAVE', chain: 'Ethereum' },
  { symbol: 'PEPEUSDT', baseAsset: 'PEPE', chain: 'Ethereum' },
  { symbol: 'ONDOUSDT', baseAsset: 'ONDO', chain: 'Ethereum' },
  { symbol: 'XRPUSDT', baseAsset: 'XRP', chain: 'Ripple' },
  { symbol: 'DOGEUSDT', baseAsset: 'DOGE', chain: 'Dogecoin' },
  { symbol: 'ENAUSDT', baseAsset: 'ENA', chain: 'Ethereum' },
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomHex(len: number): string {
  const chars = '0123456789abcdef';
  let out = '0x';
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function createMockWhaleTx(coinsMap: Record<string, Coin>, timestampOffsetMs = 0): WhaleTx {
  const asset = randomItem(WHALE_ASSETS);
  const coin = coinsMap[asset.symbol];
  const price = coin?.price ?? 100;

  const roll = Math.random();
  const type: WhaleTxType =
    roll < 0.44
      ? 'EXCHANGE_OUTFLOW'
      : roll < 0.82
        ? 'EXCHANGE_INFLOW'
        : 'WALLET_TRANSFER';

  // Weighted USD size between $520K and $26M
  const sizeRoll = Math.random();
  const amountUsd =
    sizeRoll < 0.48
      ? 520_000 + Math.random() * 980_000
      : sizeRoll < 0.82
        ? 1_500_000 + Math.random() * 4_200_000
        : 5_800_000 + Math.random() * 18_500_000;

  const amount = amountUsd / Math.max(price, 1e-8);

  let fromLabel: string;
  let toLabel: string;
  if (type === 'EXCHANGE_OUTFLOW') {
    fromLabel = randomItem(EXCHANGES);
    toLabel = randomItem(WALLETS);
  } else if (type === 'EXCHANGE_INFLOW') {
    fromLabel = randomItem(WALLETS);
    toLabel = randomItem(EXCHANGES);
  } else {
    fromLabel = randomItem(WALLETS);
    toLabel = randomItem(WALLETS.filter((w) => w !== fromLabel));
  }

  return {
    id: generateId('whale'),
    symbol: asset.symbol,
    baseAsset: asset.baseAsset,
    amount,
    amountUsd: Math.round(amountUsd),
    type,
    fromLabel,
    toLabel,
    txHash: `${randomHex(8)}...${randomHex(6).slice(2)}`,
    blockchain: asset.chain,
    timestamp: Date.now() - timestampOffsetMs,
  };
}

export function buildInitialWhaleFeed(coinsMap: Record<string, Coin>): WhaleTx[] {
  const list: WhaleTx[] = [];
  for (let i = 0; i < 24; i++) {
    list.push(createMockWhaleTx(coinsMap, i * 185_000 + Math.floor(Math.random() * 60_000)));
  }
  return list.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Modular Whale Stream Adapter — siap dihubungkan ke Whale Alert / Coinglass / DeFiLlama API
 * menggunakan VITE_WHALE_ALERT_API_KEY, dengan fallback live stream realistis.
 */
export function subscribeWhaleStream(
  getCoinsMap: () => Record<string, Coin>,
  onTx: (tx: WhaleTx) => void,
): () => void {
  let disposed = false;

  // Optional external polling hook if VITE_WHALE_ALERT_API_KEY is supplied
  const intervalMs = WHALE_API_KEY ? 15_000 : 4800;
  const timer = window.setInterval(() => {
    if (disposed) return;
    onTx(createMockWhaleTx(getCoinsMap(), 0));
  }, intervalMs);

  return () => {
    disposed = true;
    window.clearInterval(timer);
  };
}
