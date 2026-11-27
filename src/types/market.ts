export type SectorName = 'Layer 1' | 'AI' | 'DeFi' | 'Meme' | 'Layer 2' | 'RWA' | 'Altcoin';

export type Timeframe = '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

export interface Coin {
  symbol: string; // e.g., 'BTCUSDT'
  baseAsset: string; // e.g., 'BTC'
  name: string;
  sector: SectorName;
  price: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number; // Base volume
  quoteVolume24h: number; // USDT volume
  rsi14: number;
  volumeSpikeRatio: number; // e.g., 2.4 = 240% of baseline
  oiChange24h: number; // % change in Open Interest
  nearBreakout: boolean;
  fundingRate: number; // e.g., 0.0001 = 0.01%
  marketCapRank: number;
  hasFutures: boolean; // True jika tersedia kontrak perpetual USDT-M di Binance Futures
  futuresSymbol?: string; // e.g., 'BTCUSDT' atau '1000PEPEUSDT'
  lastUpdated: number;
}

export interface Candle {
  time: number; // Unix seconds (compatible with lightweight-charts UTCTimestamp)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface GlobalMarketData {
  totalMarketCapUsd: number;
  marketCapChangePercent24h: number;
  totalVolume24hUsd: number;
  btcDominance: number;
  usdtDominance: number;
  ethDominance: number;
  activeCryptocurrencies: number;
  updatedAt: number;
  isFallback: boolean;
}

export interface FearGreedData {
  value: number; // 0-100
  classification: string; // Extreme Fear | Fear | Neutral | Greed | Extreme Greed
  timestamp: number;
  previousValue?: number;
  isFallback: boolean;
}

export interface SectorStats {
  sector: SectorName;
  avgChange24h: number;
  totalVolume24h: number;
  leaderSymbol: string;
  leaderBaseAsset: string;
  leaderChange24h: number;
  coinCount: number;
}

export type MacroEventCategory = 'FOMC' | 'CPI' | 'PCE' | 'Token Unlock';
export type MacroImpact = 'High' | 'Medium';

export interface MacroEvent {
  id: string;
  title: string;
  category: MacroEventCategory;
  impact: MacroImpact;
  timestamp: number; // Unix ms (official UTC schedule)
  description: string;
  source: string;
  symbol?: string;
  unlockTokenAmount?: number;
  unlockUsdValue?: number;
  unlockSupplyPercent?: number;
}

export interface MiniTickerPayload {
  symbol: string;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  quoteVolume: number;
  eventTime: number;
}

export interface CoinTokenomicsRecord {
  symbol: string; // e.g., 'SOLUSDT'
  baseAsset: string; // e.g., 'SOL'
  name: string;
  marketCapRank: number;
  marketCapUsd: number;
  fdvUsd: number;
  mcapToFdvRatio: number; // 0..1 (e.g., 0.85 = 85% circulating float)
  circulatingSupply: number;
  totalSupply: number | null;
  maxSupply: number | null;
  change24hPercent: number;
  change7dPercent: number;
  change30dPercent: number;
  athChangePercent: number;
  isFallback: boolean;
}
