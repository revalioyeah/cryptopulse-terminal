export type WhaleTxType = 'WHALE_BUY' | 'WHALE_SELL';

export interface WhaleTx {
  id: string;
  symbol: string; // e.g., 'BTCUSDT'
  baseAsset: string; // e.g., 'BTC'
  price: number;
  amount: number;
  amountUsd: number;
  type: WhaleTxType;
  fromLabel: string;
  toLabel: string;
  txHash: string; // Real Binance AggTrade ID e.g. #3849102941
  blockchain: string; // Exchange / Market venue e.g. 'Binance Spot'
  timestamp: number;
  isMegaBlock?: boolean;
  source: 'Binance Live' | 'Fallback';
}

export type AlertCondition = 'ABOVE' | 'BELOW';

export interface PriceAlert {
  id: string;
  symbol: string;
  baseAsset: string;
  condition: AlertCondition;
  targetPrice: number;
  note: string;
  active: boolean;
  triggered: boolean;
  triggeredAt?: number;
  triggeredPrice?: number;
  createdAt: number;
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
  autoSendFutures: boolean;
  autoSendSpot: boolean;
  autoSendScanner: boolean;
  autoSendAlerts: boolean;
  lastTestedAt?: number;
  lastTestSuccess?: boolean;
}

export interface CloudSyncConfig {
  enabled: boolean;
  githubToken: string;
  gistId: string;
  autoSync: boolean;
  includeSecrets: boolean;
  lastSyncedAt?: number;
  lastSyncDirection?: 'PUSH' | 'PULL';
  lastSyncError?: string;
}

export type MarketDataSource = 'loading' | 'live' | 'fallback';

export type NavTabId =
  | 'dashboard'
  | 'screener'
  | 'analysis'
  | 'setup'
  | 'whale'
  | 'portfolio';

export type WsConnectionStatus = 'connected' | 'connecting' | 'reconnecting' | 'fallback';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  createdAt: number;
}

export type ScreenerPreset =
  | 'ALL'
  | 'WATCHLIST'
  | 'VOLUME_SPIKE'
  | 'RSI_OVERSOLD'
  | 'RSI_OVERBOUGHT'
  | 'NEAR_BREAKOUT'
  | 'HIGH_OI';
