export type WhaleTxType = 'EXCHANGE_INFLOW' | 'EXCHANGE_OUTFLOW' | 'WALLET_TRANSFER';

export interface WhaleTx {
  id: string;
  symbol: string; // e.g., 'BTCUSDT'
  baseAsset: string; // e.g., 'BTC'
  amount: number;
  amountUsd: number;
  type: WhaleTxType;
  fromLabel: string;
  toLabel: string;
  txHash: string;
  blockchain: string;
  timestamp: number;
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
