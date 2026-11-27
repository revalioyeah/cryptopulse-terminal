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
  expectancyR: number;
  maxConsecutiveLosses: number;
  longWinRate: number;
  shortWinRate: number;
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

export interface SetupDraftPayload {
  symbol: string;
  mode: 'FUTURES' | 'SPOT';
  direction?: TradeDirection;
  timeframe?: Timeframe;
  entryMode?: EntryMode;
  entryPrice?: number;
  entry2?: number;
  entry3?: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  poiLabel?: string;
  notes?: string;
}

export type AutoSignalMode = 'FUTURES' | 'SPOT_DCA';
export type AutoSignalRule =
  | 'MOMENTUM_BREAKOUT'
  | 'EMA_PULLBACK'
  | 'RSI_OVERSOLD_BOUNCE'
  | 'HIGH_CONVICTION';
export type ScannerDirectionFilter = 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY';
export type ScannerUniverseScope = 'ALL_LIQUID' | 'TOP_100' | 'WATCHLIST';

export interface AutoSignalConfig {
  enabled: boolean;
  intervalSeconds: number; // e.g., 45, 60, 180, 300, 900
  mode: AutoSignalMode;
  rule: AutoSignalRule;
  timeframe: '15m' | '1h' | '4h';
  directionFilter: ScannerDirectionFilter;
  universeScope: ScannerUniverseScope;
  minVolume24hUsd: number;
  minBacktestGrade: BacktestGrade;
  minProfitFactor: number;
  minConfluenceScore: number;
  requireBtcAlignment: boolean;
  defaultLeverage: number;
  minSpotScore: number;
  minMcapFdvRatio: number; // e.g., 0.55 = 55% minimum float
  autoAddWatchlist: boolean;
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
  timeframe?: Timeframe;
  entryPrice: number;
  entry2?: number;
  entry3?: number;
  poiLabel?: string;
  stopLoss?: number;
  takeProfit?: number;
  rrRatio?: number;
  confluenceScore?: number;
  rsiReal?: number;
  adxReal?: number;
  mcapFdvPercent?: number;
  rsVsBtc7d?: number;
  reasons?: string[];
  scoreOrGrade: string;
  summary: string;
  telegramSent: boolean;
  savedToJournal: boolean;
  createdAt: number;
}

export interface FuturesScanCandidateAudit {
  symbol: string;
  baseAsset: string;
  direction: TradeDirection;
  passed: boolean;
  confluenceScore: number;
  backtestGrade: BacktestGrade;
  profitFactor: number;
  winRate: number;
  rsi14: number;
  adx14: number;
  volumeRatio: number;
  htfTrend: 'Bullish' | 'Bearish' | 'Sideways';
  btcAligned: boolean;
  rrToResistance: number;
  poiLabel?: string;
  poiEntryPrice?: number;
  poiDistancePercent?: number;
  reasons: string[];
  rejectReason?: string;
}

export interface FuturesScanReport {
  scannedAt: number;
  timeframe: '15m' | '1h' | '4h';
  htfTimeframe: '1h' | '4h' | '1d';
  rule: AutoSignalRule;
  universeCount: number;
  evaluatedCount: number;
  passedCount: number;
  btcHtfTrend: 'Bullish' | 'Bearish' | 'Sideways';
  audits: FuturesScanCandidateAudit[];
}

export type SpotFunnelStage =
  | 'WATCHLIST_READY'
  | 'FAILED_TREND'
  | 'FAILED_TOKENOMICS'
  | 'FAILED_OUTPERFORMANCE';

export interface SpotFunnelCandidate {
  symbol: string;
  baseAsset: string;
  name: string;
  sector: string;
  price: number;
  marketCapRank: number;
  marketCapUsd: number;
  fdvUsd: number;
  quoteVolume24h: number;
  // Stage 1: Outperformance vs BTC
  change24h: number;
  change7d: number;
  change30d: number;
  rsVsBtc24h: number;
  rsVsBtc7d: number;
  rsVsBtc30d: number;
  outperformanceScore: number;
  passedOutperformance: boolean;
  // Stage 2: Tokenomics
  mcapFdvRatio: number; // 0..1
  hasMaxSupply: boolean;
  hasUpcomingHeavyUnlock: boolean;
  tokenomicsScore: number;
  tokenomicsNote: string;
  passedTokenomics: boolean;
  // Stage 3: Real 1D + 4H Trend
  trend1d?: 'Bullish' | 'Bearish' | 'Sideways';
  trend4h?: 'Bullish' | 'Bearish' | 'Sideways';
  rsi1d?: number;
  rsi4h?: number;
  emaStructure1d?: string;
  trendScore?: number;
  passedTrend: boolean;
  // Stage 4: Layak Watchlist + DCA Plan
  finalScore: number;
  tier?: 'Core' | 'Growth' | 'High-Risk';
  projectedAvgEntry?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  sellPercentAtTp2?: number;
  stageReached: SpotFunnelStage;
  rejectReason?: string;
  highlights: string[];
}

export interface SpotFunnelReport {
  scannedAt: number;
  initialCount: number;
  afterOutperformance: number;
  afterTokenomics: number;
  afterTrend: number;
  watchlistReady: number;
  btcBench24h: number;
  btcBench7d: number;
  btcBench30d: number;
  isTokenomicsFallback: boolean;
  candidates: SpotFunnelCandidate[];
}

export interface DerivativesSnapshot {
  symbol: string;
  fundingRate8h: number; // percentage e.g., 0.012
  nextFundingTime: number;
  openInterestUsd: number;
  openInterestChange24h: number;
  longRatioPercent: number;
  shortRatioPercent: number;
  source: string;
  longShortAvailable: boolean;
  oiChangeAvailable: boolean;
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
