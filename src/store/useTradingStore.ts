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
  demoCleanedV2?: boolean;
  toggleWatchlist: (symbol: string) => boolean;
  addToWatchlistBatch: (symbols: string[]) => number;
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
  intervalSeconds: 180,
  mode: 'BOTH',
  rule: 'HIGH_CONVICTION',
  timeframe: '1h',
  directionFilter: 'BOTH',
  universeScope: 'TOP_100',
  minVolume24hUsd: 10_000_000,
  minBacktestGrade: 'B+',
  minProfitFactor: 1.15,
  minConfluenceScore: 65,
  requireBtcAlignment: true,
  defaultLeverage: 5,
  minSpotScore: 68,
  minMcapFdvRatio: 0.55,
  autoAddWatchlist: false,
  cooldownSeconds: 900,
  autoSendTelegram: false,
  autoSaveJournal: false,
  defaultFuturesEquity: 5000,
  defaultRiskPercent: 1.0,
  defaultSpotBudget: 1000,
};

const LEGACY_DEMO_SETUP_IDS = new Set(['seed_fut_1', 'seed_fut_2', 'seed_fut_3']);

export const useTradingStore = create<TradingState>()(
  persist(
    (set, get) => ({
      watchlist: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'SUIUSDT'],
      futuresSetups: [],
      spotSetups: [],
      maxDailySlHits: 2,
      scannerConfig: DEFAULT_SCANNER_CONFIG,
      scannerLogs: [],
      scannerCooldowns: {},
      demoCleanedV2: true,

      toggleWatchlist: (symbol) => {
        const exists = get().watchlist.includes(symbol);
        set((state) => ({
          watchlist: exists
            ? state.watchlist.filter((s) => s !== symbol)
            : [symbol, ...state.watchlist],
        }));
        return !exists;
      },

      addToWatchlistBatch: (symbols) => {
        const current = get().watchlist;
        const existing = new Set(current);
        const toAdd = symbols.filter((s) => !existing.has(s));
        if (toAdd.length === 0) return 0;
        set((state) => ({
          watchlist: [...toAdd, ...state.watchlist],
        }));
        return toAdd.length;
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
          futuresSetups: Array.isArray(data.futuresSetups)
            ? data.futuresSetups.filter((s) => !LEGACY_DEMO_SETUP_IDS.has(s.id))
            : state.futuresSetups,
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
      version: 2,
      migrate: (persistedState) => {
        const persisted = (persistedState ?? {}) as Partial<TradingState>;
        const rawSetups = Array.isArray(persisted.futuresSetups) ? persisted.futuresSetups : [];
        return {
          ...persisted,
          futuresSetups: rawSetups.filter((s) => !LEGACY_DEMO_SETUP_IDS.has(s.id)),
          scannerConfig: {
            ...DEFAULT_SCANNER_CONFIG,
            ...(persisted.scannerConfig ?? {}),
          },
          demoCleanedV2: true,
        };
      },
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<TradingState>;
        const rawSetups = Array.isArray(persisted.futuresSetups) ? persisted.futuresSetups : [];
        const cleanedSetups = persisted.demoCleanedV2
          ? rawSetups
          : rawSetups.filter((s) => !LEGACY_DEMO_SETUP_IDS.has(s.id));

        return {
          ...currentState,
          ...persisted,
          futuresSetups: cleanedSetups,
          scannerConfig: {
            ...DEFAULT_SCANNER_CONFIG,
            ...(persisted.scannerConfig ?? {}),
          },
          demoCleanedV2: true,
        };
      },
    },
  ),
);
