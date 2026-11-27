import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AutoSignalConfig,
  AutoSignalLog,
  SetupStatus,
  SpotSetup,
  TradeSetup,
} from '../types';

export interface TradingPersistedData {
  watchlist: string[];
  futuresSetups: TradeSetup[];
  spotSetups: SpotSetup[];
  maxDailySlHits: number;
  scannerConfig: AutoSignalConfig;
  scannerLogs: AutoSignalLog[];
  scannerCooldowns: Record<string, number>;
}

interface TradingState extends TradingPersistedData {
  toggleWatchlist: (symbol: string) => boolean;
  addFuturesSetup: (setup: TradeSetup) => void;
  updateFuturesSetupStatus: (id: string, status: SetupStatus, realizedPnlUsdt?: number) => void;
  deleteFuturesSetup: (id: string) => void;

  addSpotSetup: (setup: SpotSetup) => void;
  updateSpotSetupStatus: (id: string, status: SetupStatus) => void;
  deleteSpotSetup: (id: string) => void;

  setMaxDailySlHits: (max: number) => void;
  updateScannerConfig: (partial: Partial<AutoSignalConfig>) => void;
  addScannerLog: (log: AutoSignalLog) => void;
  markScannerLogTelegramSent: (id: string) => void;
  clearScannerLogs: () => void;
  setSymbolCooldown: (symbol: string, timestamp: number) => void;

  hydrateTrading: (data: Partial<TradingPersistedData>) => void;
}

const DEFAULT_SCANNER_CONFIG: AutoSignalConfig = {
  enabled: false,
  intervalSeconds: 45,
  mode: 'FUTURES',
  rule: 'MOMENTUM_BREAKOUT',
  cooldownSeconds: 300,
  autoSendTelegram: false,
  autoSaveJournal: false,
  defaultFuturesEquity: 5000,
  defaultRiskPercent: 1.0,
  defaultSpotBudget: 1000,
};

const SEEDED_FUTURES_SETUPS: TradeSetup[] = [
  {
    id: 'seed_fut_1',
    symbol: 'BTCUSDT',
    baseAsset: 'BTC',
    direction: 'LONG',
    timeframe: '4h',
    entryMode: 'SINGLE',
    entries: [{ price: 92800, weightPercent: 100 }],
    avgEntry: 92800,
    stopLoss: 91200,
    takeProfits: [
      { label: 'TP1', price: 95200, allocationPercent: 40 },
      { label: 'TP2', price: 97600, allocationPercent: 35 },
      { label: 'TP3', price: 100400, allocationPercent: 25 },
    ],
    accountEquity: 10000,
    riskPercent: 1.0,
    leverage: 10,
    riskAmountUsdt: 100,
    positionSizeUsdt: 5800,
    positionQty: 0.0625,
    marginRequiredUsdt: 580,
    estimatedLiquidation: 83984,
    rrTp1: 1.5,
    rrTp2: 3.0,
    rrTp3: 4.75,
    btcBetaAligned: true,
    confluenceChecks: ['Trend 4H Bullish', 'EMA 20/50 Support', 'Volume Confirmation'],
    notes: 'Reclaim area demand 4H dengan funding netral.',
    status: 'Running',
    source: 'Backtest',
    createdAt: Date.now() - 8 * 3_600_000,
    updatedAt: Date.now() - 4 * 3_600_000,
  },
  {
    id: 'seed_fut_2',
    symbol: 'SOLUSDT',
    baseAsset: 'SOL',
    direction: 'LONG',
    timeframe: '1h',
    entryMode: 'SINGLE',
    entries: [{ price: 204.5, weightPercent: 100 }],
    avgEntry: 204.5,
    stopLoss: 198.2,
    takeProfits: [
      { label: 'TP1', price: 214.0, allocationPercent: 50 },
      { label: 'TP2', price: 221.5, allocationPercent: 30 },
      { label: 'TP3', price: 230.0, allocationPercent: 20 },
    ],
    accountEquity: 10000,
    riskPercent: 1.0,
    leverage: 8,
    riskAmountUsdt: 100,
    positionSizeUsdt: 3246,
    positionQty: 15.873,
    marginRequiredUsdt: 405.75,
    estimatedLiquidation: 180.1,
    rrTp1: 1.51,
    rrTp2: 2.7,
    rrTp3: 4.05,
    btcBetaAligned: true,
    confluenceChecks: ['Breakout Volume >200%', 'MTF Bullish', 'BTC Beta Searah'],
    notes: 'Breakout struktur 1H + lonjakan OI sehat.',
    status: 'Hit TP',
    realizedPnlUsdt: 218.4,
    source: 'Manual',
    createdAt: Date.now() - 30 * 3_600_000,
    updatedAt: Date.now() - 18 * 3_600_000,
    closedAt: Date.now() - 18 * 3_600_000,
  },
  {
    id: 'seed_fut_3',
    symbol: 'WIFUSDT',
    baseAsset: 'WIF',
    direction: 'SHORT',
    timeframe: '15m',
    entryMode: 'SINGLE',
    entries: [{ price: 2.94, weightPercent: 100 }],
    avgEntry: 2.94,
    stopLoss: 3.06,
    takeProfits: [
      { label: 'TP1', price: 2.76, allocationPercent: 50 },
      { label: 'TP2', price: 2.64, allocationPercent: 30 },
      { label: 'TP3', price: 2.52, allocationPercent: 20 },
    ],
    accountEquity: 10000,
    riskPercent: 0.75,
    leverage: 5,
    riskAmountUsdt: 75,
    positionSizeUsdt: 1837.5,
    positionQty: 625,
    marginRequiredUsdt: 367.5,
    estimatedLiquidation: 3.49,
    rrTp1: 1.5,
    rrTp2: 2.5,
    rrTp3: 3.5,
    btcBetaAligned: false,
    confluenceChecks: ['RSI Overbought Divergence'],
    notes: 'Counter-trend scalp di resistance lokal.',
    status: 'Hit SL',
    realizedPnlUsdt: -75,
    source: 'Manual',
    createdAt: Date.now() - 26 * 3_600_000,
    updatedAt: Date.now() - 22 * 3_600_000,
    closedAt: Date.now() - 22 * 3_600_000,
  },
];

export const useTradingStore = create<TradingState>()(
  persist(
    (set, get) => ({
      watchlist: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'TAOUSDT', 'LINKUSDT', 'PEPEUSDT'],
      futuresSetups: SEEDED_FUTURES_SETUPS,
      spotSetups: [],
      maxDailySlHits: 2,
      scannerConfig: DEFAULT_SCANNER_CONFIG,
      scannerLogs: [],
      scannerCooldowns: {},

      toggleWatchlist: (symbol) => {
        const exists = get().watchlist.includes(symbol);
        set((state) => ({
          watchlist: exists
            ? state.watchlist.filter((s) => s !== symbol)
            : [symbol, ...state.watchlist],
        }));
        return !exists;
      },

      addFuturesSetup: (setup) =>
        set((state) => ({
          futuresSetups: [setup, ...state.futuresSetups],
        })),

      updateFuturesSetupStatus: (id, status, realizedPnlUsdt) =>
        set((state) => ({
          futuresSetups: state.futuresSetups.map((item) => {
            if (item.id !== id) return item;
            const isClosed = status === 'Hit TP' || status === 'Hit SL';
            const computedPnl =
              realizedPnlUsdt !== undefined
                ? realizedPnlUsdt
                : status === 'Hit TP'
                  ? Number((item.riskAmountUsdt * item.rrTp2).toFixed(2))
                  : status === 'Hit SL'
                    ? -item.riskAmountUsdt
                    : undefined;
            return {
              ...item,
              status,
              realizedPnlUsdt: isClosed ? computedPnl : undefined,
              updatedAt: Date.now(),
              closedAt: isClosed ? Date.now() : undefined,
            };
          }),
        })),

      deleteFuturesSetup: (id) =>
        set((state) => ({
          futuresSetups: state.futuresSetups.filter((item) => item.id !== id),
        })),

      addSpotSetup: (setup) =>
        set((state) => ({
          spotSetups: [setup, ...state.spotSetups],
        })),

      updateSpotSetupStatus: (id, status) =>
        set((state) => ({
          spotSetups: state.spotSetups.map((item) =>
            item.id === id ? { ...item, status, updatedAt: Date.now() } : item,
          ),
        })),

      deleteSpotSetup: (id) =>
        set((state) => ({
          spotSetups: state.spotSetups.filter((item) => item.id !== id),
        })),

      setMaxDailySlHits: (max) => set({ maxDailySlHits: Math.max(1, Math.min(10, max)) }),

      updateScannerConfig: (partial) =>
        set((state) => ({
          scannerConfig: { ...state.scannerConfig, ...partial },
        })),

      addScannerLog: (log) =>
        set((state) => ({
          scannerLogs: [log, ...state.scannerLogs].slice(0, 60),
        })),

      markScannerLogTelegramSent: (id) =>
        set((state) => ({
          scannerLogs: state.scannerLogs.map((l) =>
            l.id === id ? { ...l, telegramSent: true } : l,
          ),
        })),

      clearScannerLogs: () => set({ scannerLogs: [] }),

      setSymbolCooldown: (symbol, timestamp) =>
        set((state) => ({
          scannerCooldowns: { ...state.scannerCooldowns, [symbol]: timestamp },
        })),

      hydrateTrading: (data) =>
        set((state) => ({
          watchlist: Array.isArray(data.watchlist) ? data.watchlist : state.watchlist,
          futuresSetups: Array.isArray(data.futuresSetups) ? data.futuresSetups : state.futuresSetups,
          spotSetups: Array.isArray(data.spotSetups) ? data.spotSetups : state.spotSetups,
          maxDailySlHits: typeof data.maxDailySlHits === 'number' ? data.maxDailySlHits : state.maxDailySlHits,
          scannerConfig: data.scannerConfig
            ? { ...DEFAULT_SCANNER_CONFIG, ...data.scannerConfig }
            : state.scannerConfig,
          scannerLogs: Array.isArray(data.scannerLogs) ? data.scannerLogs : state.scannerLogs,
          scannerCooldowns: data.scannerCooldowns ?? state.scannerCooldowns,
        })),
    }),
    {
      name: 'cryptopulse-trading-v1',
    },
  ),
);
