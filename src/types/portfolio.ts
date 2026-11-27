export interface SpotHolding {
  id: string;
  symbol: string; // e.g., 'BTCUSDT'
  baseAsset: string; // e.g., 'BTC'
  name: string;
  quantity: number;
  avgBuyPrice: number;
  totalCostUsdt: number;
  targetSellPrice: number;
  realizedPnlUsdt: number;
  notes?: string;
  updatedAt: number;
}

export type ActivityCategory = 'SPOT' | 'FUTURES' | 'USDT_CASH';

export type ActivityAction =
  | 'SPOT_BUY'
  | 'SPOT_DCA'
  | 'SPOT_EDIT'
  | 'SPOT_SELL_TP'
  | 'USDT_DEPOSIT'
  | 'USDT_WITHDRAW'
  | 'USDT_SET_BALANCE'
  | 'FUTURES_HIT_TP'
  | 'FUTURES_HIT_SL';

export interface ActivityLog {
  id: string;
  category: ActivityCategory;
  action: ActivityAction;
  symbol?: string;
  baseAsset?: string;
  quantity?: number;
  price?: number;
  amountUsdt: number;
  pnlUsdt?: number;
  note: string;
  timestamp: number;
}

export interface PortfolioSnapshot {
  time: number; // Unix seconds
  totalValueUsdt: number;
  coinValueUsdt: number;
  usdtBalance: number;
}
