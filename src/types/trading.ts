import type { Timeframe } from './market';

export type TradeDirection = 'LONG' | 'SHORT';
export type SetupStatus = 'Waiting' | 'Running' | 'Hit TP' | 'Hit SL';
export type EntryMode = 'SINGLE' | 'LAYERING';

export interface EntryLeg {
  price: number;
  weightPercent: number; // e.g., 50
}

export interface TakeProfitTarget {
  label: 'TP1' | 'TP2' | 'TP3';
  price: number;
  allocationPercent: number;
}

export interface TradeSetup {
  id: string;
  symbol: string;
  baseAsset: string;
  direction: TradeDirection;
  timeframe: Timeframe;
  entryMode: EntryMode;
  entries: EntryLeg[];
  avgEntry: number;
  stopLoss: number;
  takeProfits: TakeProfitTarget[];
  accountEquity: number;
  riskPercent: number;
  leverage: number;
  riskAmountUsdt: number;
  positionSizeUsdt: number;
  positionQty: number;
  marginRequiredUsdt: number;
  estimatedLiquidation: number;
  rrTp1: number;
  rrTp2: number;
  rrTp3: number;
  btcBetaAligned: boolean;
  confluenceChecks: string[];
  notes: string;
  status: SetupStatus;
  realizedPnlUsdt?: number;
  source: 'Manual' | 'Backtest' | 'AutoBot';
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
}

export interface DcaLayer {
  layer: 1 | 2 | 3;
  label: string;
  price: number;
  allocationPercent: number; // 20, 30, 50
  budgetUsdt: number;
  estimatedQty: number;
}

export interface SpotQualityPillar {
  name: string;
  score: number; // 0-25
  maxScore: 25;
  note: string;
}

export interface SpotQualityScore {
  totalScore: number; // 0-100
  tier: 'Core' | 'Growth' | 'High-Risk';
  verdict: string;
  pillars: SpotQualityPillar[];
}

export interface SpotSetup {
  id: string;
  symbol: string;
  baseAsset: string;
  budgetUsdt: number;
  qualityScore: number;
  tier: 'Core' | 'Growth' | 'High-Risk';
  layers: DcaLayer[];
  projectedAvgEntry: number;
  tp1: number;
  tp2: number;
  tp3: number;
  roiTp1Percent: number;
  roiTp2Percent: number;
  roiTp3Percent: number;
  sellPercentAtTp2ForBreakEven: number;
  moonbagQty: number;
  moonbagValueAtTp3Usdt: number;
  notes: string;
  status: SetupStatus;
  source: 'Manual' | 'AutoBot';
  createdAt: number;
  updatedAt: number;
}

export type BacktestStrategyId = 'ema_pullback' | 'breakout_volume' | 'rsi_reversal';
export type BacktestGrade = 'A+' | 'A' | 'B+' | 'B' | 'C';

export interface BacktestParams {
  symbol: string;
  strategy: BacktestStrategyId;
  timeframe: Timeframe;
  targetRR: number;
  atrMultiplier: number;
  feeRate: number; // default 0.001 (0.1%)
}

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  direction: TradeDirection;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  outcome: 'WIN' | 'LOSS';
  netPnlPercent: number;
  rMultiple: number;
}

export interface EquityPoint {
  time: number;
  equity: number;
}

export interface BacktestResult {
  params: BacktestParams;
  candleCount: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  netPnlPercent: number;
  maxDrawdownPercent: number;
  grade: BacktestGrade;
  equityCurve: EquityPoint[];
  trades: BacktestTrade[];
  suggestedDirection: TradeDirection;
  suggestedEntry: number;
  suggestedStopLoss: number;
  suggestedTp1: number;
  suggestedTp2: number;
  suggestedTp3: number;
  atrValue: number;
}

export type AutoSignalMode = 'FUTURES' | 'SPOT_DCA';
export type AutoSignalRule = 'MOMENTUM_BREAKOUT' | 'RSI_OVERSOLD_BOUNCE' | 'HIGH_CONVICTION';

export interface AutoSignalConfig {
  enabled: boolean;
  intervalSeconds: number; // e.g., 30, 60, 180
  mode: AutoSignalMode;
  rule: AutoSignalRule;
  cooldownSeconds: number; // 30s to 14400s (4h)
  autoSendTelegram: boolean;
  autoSaveJournal: boolean;
  defaultFuturesEquity: number;
  defaultRiskPercent: number;
  defaultSpotBudget: number;
}

export interface AutoSignalLog {
  id: string;
  symbol: string;
  baseAsset: string;
  mode: AutoSignalMode;
  rule: AutoSignalRule;
  direction: TradeDirection | 'ACCUMULATE';
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  scoreOrGrade: string;
  summary: string;
  telegramSent: boolean;
  savedToJournal: boolean;
  createdAt: number;
}

export interface DerivativesSnapshot {
  symbol: string;
  fundingRate8h: number; // percentage e.g., 0.012
  nextFundingTime: number;
  openInterestUsd: number;
  openInterestChange24h: number;
  longRatioPercent: number;
  shortRatioPercent: number;
  isMock: boolean;
}

export interface LiquidationCluster {
  leverage: '25x' | '50x';
  side: 'LONG_LIQ' | 'SHORT_LIQ';
  price: number;
  distancePercent: number;
  estimatedVolumeUsd: number;
  intensity: number; // 0-100
}

export interface MtfTrendItem {
  timeframe: '15m' | '1h' | '4h' | '1d';
  trend: 'Bullish' | 'Bearish' | 'Sideways';
  rsi: number;
  emaAlignment: string;
}

export type TechnicalBias = 'Strong Buy' | 'Buy' | 'Neutral' | 'Sell' | 'Strong Sell';

export interface TechnicalSummary {
  bias: TechnicalBias;
  score: number; // -100 to +100
  patterns: string[];
  supports: number[];
  resistances: number[];
  ema20: number;
  ema50: number;
  ema200: number;
  rsi14: number;
  atr14: number;
}
