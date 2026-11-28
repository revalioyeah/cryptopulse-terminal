import { create } from 'zustand';
import type {
  Coin,
  FuturesScanReport,
  MarketDataSource,
  MiniTickerPayload,
  NavTabId,
  ScreenerPreset,
  SectorName,
  SetupDraftPayload,
  SpotFunnelReport,
  ToastItem,
  ToastVariant,
  WsConnectionStatus,
} from '../types';
import { buildFallbackCoins, deriveTechnicalHints } from '../services/adapters/mockData';
import { generateId } from '../utils/format';

export type SettingsModalTab = 'TELEGRAM' | 'SYNC' | 'BACKUP';

interface AppState {
  activeTab: NavTabId;
  selectedSymbol: string;
  setupMode: 'FUTURES' | 'SPOT';
  pendingSetupDraft: SetupDraftPayload | null;
  screenerSectorFilter: SectorName | 'ALL';
  screenerPreset: ScreenerPreset;
  wsStatus: WsConnectionStatus;
  marketSource: MarketDataSource;
  coinsMap: Record<string, Coin>;
  coins: Coin[];
  priceAlertsModalOpen: boolean;
  priceAlertDraftSymbol: string | null;
  settingsModalOpen: boolean;
  settingsModalTab: SettingsModalTab;
  toasts: ToastItem[];

  // Shared global scanner runtime state (survives tab switches)
  scannerRunning: boolean;
  scannerProgressText: string;
  scannerProgressPct: number;
  lastScanAt: number | null;
  lastFuturesReport: FuturesScanReport | null;
  lastSpotFunnelReport: SpotFunnelReport | null;

  // Live Cloud Sync status
  cloudSyncBusy: boolean;
  setCloudSyncBusy: (busy: boolean) => void;

  setActiveTab: (tab: NavTabId) => void;
  setSelectedSymbol: (symbol: string) => void;
  setSetupMode: (mode: 'FUTURES' | 'SPOT') => void;
  clearPendingSetupDraft: () => void;
  setScreenerSectorFilter: (sector: SectorName | 'ALL') => void;
  setScreenerPreset: (preset: ScreenerPreset) => void;
  setWsStatus: (status: WsConnectionStatus) => void;
  seedCoins: (coins: Coin[], isFallback?: boolean) => void;
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
  openSetupForCoin: (
    symbol: string,
    mode?: 'FUTURES' | 'SPOT',
    draft?: Omit<SetupDraftPayload, 'symbol' | 'mode'>,
  ) => void;
  openPriceAlertsModal: (symbol?: string) => void;
  closePriceAlertsModal: () => void;
  openSettingsModal: (tab?: SettingsModalTab) => void;
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
  pendingSetupDraft: null,
  screenerSectorFilter: 'ALL',
  screenerPreset: 'ALL',
  wsStatus: 'connecting',
  marketSource: 'loading',
  coinsMap: initialMap,
  coins: initialCoins,
  priceAlertsModalOpen: false,
  priceAlertDraftSymbol: null,
  settingsModalOpen: false,
  settingsModalTab: 'TELEGRAM',
  toasts: [],

  scannerRunning: false,
  scannerProgressText: '',
  scannerProgressPct: 0,
  lastScanAt: null,
  lastFuturesReport: null,
  lastSpotFunnelReport: null,

  cloudSyncBusy: false,
  setCloudSyncBusy: (busy) => set({ cloudSyncBusy: busy }),

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),
  setSetupMode: (mode) => set({ setupMode: mode }),
  clearPendingSetupDraft: () => set({ pendingSetupDraft: null }),
  setScreenerSectorFilter: (sector) => set({ screenerSectorFilter: sector }),
  setScreenerPreset: (preset) => set({ screenerPreset: preset }),
  setWsStatus: (status) => set({ wsStatus: status }),
  setScannerRuntime: (partial) => set(partial),

  seedCoins: (coins, isFallback = false) => {
    const coinsMap: Record<string, Coin> = {};
    for (const c of coins) {
      coinsMap[c.symbol] = c;
    }
    set({
      coinsMap,
      coins,
      marketSource: isFallback ? 'fallback' : 'live',
    });
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
      return {
        coinsMap: nextMap,
        coins: nextCoins,
        marketSource: 'live',
      };
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

  openSetupForCoin: (symbol, mode, draft) =>
    set((state) => {
      const targetCoin = state.coinsMap[symbol];
      const requestedMode = mode ?? state.setupMode;
      const targetMode =
        requestedMode === 'FUTURES' && targetCoin && !targetCoin.hasFutures
          ? 'SPOT'
          : requestedMode;
      return {
        selectedSymbol: symbol,
        setupMode: targetMode,
        pendingSetupDraft: draft ? { symbol, mode: targetMode, ...draft } : null,
        activeTab: 'setup',
      };
    }),

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

  openSettingsModal: (tab) =>
    set((state) => ({
      settingsModalOpen: true,
      settingsModalTab: tab ?? state.settingsModalTab,
    })),
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
