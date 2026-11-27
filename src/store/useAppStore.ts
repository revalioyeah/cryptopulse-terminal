import { create } from 'zustand';
import type {
  Coin,
  FuturesScanReport,
  MiniTickerPayload,
  NavTabId,
  ScreenerPreset,
  SectorName,
  SpotFunnelReport,
  ToastItem,
  ToastVariant,
  WsConnectionStatus,
} from '../types';
import { buildFallbackCoins, deriveTechnicalHints } from '../services/adapters/mockData';
import { generateId } from '../utils/format';

interface AppState {
  activeTab: NavTabId;
  selectedSymbol: string;
  setupMode: 'FUTURES' | 'SPOT';
  screenerSectorFilter: SectorName | 'ALL';
  screenerPreset: ScreenerPreset;
  wsStatus: WsConnectionStatus;
  coinsMap: Record<string, Coin>;
  coins: Coin[];
  priceAlertsModalOpen: boolean;
  priceAlertDraftSymbol: string | null;
  settingsModalOpen: boolean;
  toasts: ToastItem[];

  // Shared global scanner runtime state (survives tab switches)
  scannerRunning: boolean;
  scannerProgressText: string;
  scannerProgressPct: number;
  lastScanAt: number | null;
  lastFuturesReport: FuturesScanReport | null;
  lastSpotFunnelReport: SpotFunnelReport | null;

  setActiveTab: (tab: NavTabId) => void;
  setSelectedSymbol: (symbol: string) => void;
  setSetupMode: (mode: 'FUTURES' | 'SPOT') => void;
  setScreenerSectorFilter: (sector: SectorName | 'ALL') => void;
  setScreenerPreset: (preset: ScreenerPreset) => void;
  setWsStatus: (status: WsConnectionStatus) => void;
  seedCoins: (coins: Coin[]) => void;
  applyMiniTicks: (ticks: MiniTickerPayload[]) => void;

  setScannerRuntime: (partial: {
    scannerRunning?: boolean;
    scannerProgressText?: string;
    scannerProgressPct?: number;
    lastScanAt?: number | null;
    lastFuturesReport?: FuturesScanReport | null;
    lastSpotFunnelReport?: SpotFunnelReport | null;
  }) => void;

  openAnalysis: (symbol: string) => void;
  openScreenerForSector: (sector: SectorName | 'ALL') => void;
  openSetupForCoin: (symbol: string, mode?: 'FUTURES' | 'SPOT') => void;
  openPriceAlertsModal: (symbol?: string) => void;
  closePriceAlertsModal: () => void;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;

  pushToast: (title: string, description?: string, variant?: ToastVariant) => void;
  dismissToast: (id: string) => void;
}

const initialCoins = buildFallbackCoins();
const initialMap: Record<string, Coin> = Object.fromEntries(initialCoins.map((c) => [c.symbol, c]));

export const useAppStore = create<AppState>((set) => ({
  activeTab: 'dashboard',
  selectedSymbol: 'BTCUSDT',
  setupMode: 'FUTURES',
  screenerSectorFilter: 'ALL',
  screenerPreset: 'ALL',
  wsStatus: 'connecting',
  coinsMap: initialMap,
  coins: initialCoins,
  priceAlertsModalOpen: false,
  priceAlertDraftSymbol: null,
  settingsModalOpen: false,
  toasts: [],

  scannerRunning: false,
  scannerProgressText: '',
  scannerProgressPct: 0,
  lastScanAt: null,
  lastFuturesReport: null,
  lastSpotFunnelReport: null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),
  setSetupMode: (mode) => set({ setupMode: mode }),
  setScreenerSectorFilter: (sector) => set({ screenerSectorFilter: sector }),
  setScreenerPreset: (preset) => set({ screenerPreset: preset }),
  setWsStatus: (status) => set({ wsStatus: status }),
  setScannerRuntime: (partial) => set(partial),

  seedCoins: (coins) => {
    const coinsMap: Record<string, Coin> = {};
    for (const c of coins) {
      coinsMap[c.symbol] = c;
    }
    set({ coinsMap, coins });
  },

  applyMiniTicks: (ticks) =>
    set((state) => {
      if (ticks.length === 0) return state;
      let changed = false;
      const nextMap = { ...state.coinsMap };

      for (const tick of ticks) {
        const existing = nextMap[tick.symbol];
        if (!existing) continue;
        const open = tick.open > 0 ? tick.open : existing.price;
        const priceChange24h = tick.close - open;
        const priceChangePercent24h = open > 0 ? (priceChange24h / open) * 100 : existing.priceChangePercent24h;
        const hints = deriveTechnicalHints(
          tick.symbol,
          tick.close,
          tick.high,
          tick.low,
          priceChangePercent24h,
          tick.quoteVolume,
        );

        nextMap[tick.symbol] = {
          ...existing,
          price: tick.close,
          priceChange24h,
          priceChangePercent24h,
          high24h: tick.high,
          low24h: tick.low,
          volume24h: tick.volume,
          quoteVolume24h: tick.quoteVolume,
          lastUpdated: tick.eventTime,
          ...hints,
        };
        changed = true;
      }

      if (!changed) return state;
      const nextCoins = state.coins.map((c) => nextMap[c.symbol] ?? c);
      return { coinsMap: nextMap, coins: nextCoins };
    }),

  openAnalysis: (symbol) =>
    set({
      selectedSymbol: symbol,
      activeTab: 'analysis',
    }),

  openScreenerForSector: (sector) =>
    set({
      screenerSectorFilter: sector,
      screenerPreset: 'ALL',
      activeTab: 'screener',
    }),

  openSetupForCoin: (symbol, mode) =>
    set((state) => ({
      selectedSymbol: symbol,
      setupMode: mode ?? state.setupMode,
      activeTab: 'setup',
    })),

  openPriceAlertsModal: (symbol) =>
    set({
      priceAlertsModalOpen: true,
      priceAlertDraftSymbol: symbol ?? null,
    }),

  closePriceAlertsModal: () =>
    set({
      priceAlertsModalOpen: false,
      priceAlertDraftSymbol: null,
    }),

  openSettingsModal: () => set({ settingsModalOpen: true }),
  closeSettingsModal: () => set({ settingsModalOpen: false }),

  pushToast: (title, description, variant = 'info') =>
    set((state) => {
      const item: ToastItem = {
        id: generateId('toast'),
        title,
        description,
        variant,
        createdAt: Date.now(),
      };
      return {
        toasts: [item, ...state.toasts].slice(0, 5),
      };
    }),

  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));
