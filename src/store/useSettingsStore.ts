import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AlertCondition, PriceAlert, TelegramConfig } from '../types';
import { generateId } from '../utils/format';

export interface SettingsPersistedData {
  priceAlerts: PriceAlert[];
  telegramConfig: TelegramConfig;
}

interface SettingsState extends SettingsPersistedData {
  addPriceAlert: (input: {
    symbol: string;
    baseAsset: string;
    condition: AlertCondition;
    targetPrice: number;
    note: string;
  }) => PriceAlert;
  togglePriceAlert: (id: string) => void;
  resetPriceAlert: (id: string) => void;
  markAlertTriggered: (id: string, triggeredPrice: number) => void;
  deletePriceAlert: (id: string) => void;
  updateTelegramConfig: (partial: Partial<TelegramConfig>) => void;
  hydrateSettings: (data: Partial<SettingsPersistedData>) => void;
}

const DEFAULT_TELEGRAM: TelegramConfig = {
  botToken: (import.meta.env.VITE_TELEGRAM_BOT_TOKEN as string | undefined)?.trim() || '',
  chatId: (import.meta.env.VITE_TELEGRAM_CHAT_ID as string | undefined)?.trim() || '',
  enabled: false,
  autoSendFutures: true,
  autoSendSpot: true,
  autoSendScanner: true,
  autoSendAlerts: true,
};

const SEEDED_ALERTS: PriceAlert[] = [
  {
    id: 'alert_seed_btc',
    symbol: 'BTCUSDT',
    baseAsset: 'BTC',
    condition: 'ABOVE',
    targetPrice: 100000,
    note: 'Breakout psikologis $100K — pantau volume konfirmasi',
    active: true,
    triggered: false,
    createdAt: Date.now() - 3_600_000,
  },
  {
    id: 'alert_seed_sol',
    symbol: 'SOLUSDT',
    baseAsset: 'SOL',
    condition: 'BELOW',
    targetPrice: 195,
    note: 'Zona DCA Layer 1 SOL',
    active: true,
    triggered: false,
    createdAt: Date.now() - 7_200_000,
  },
];

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      priceAlerts: SEEDED_ALERTS,
      telegramConfig: DEFAULT_TELEGRAM,

      addPriceAlert: (input) => {
        const alert: PriceAlert = {
          id: generateId('alert'),
          symbol: input.symbol,
          baseAsset: input.baseAsset,
          condition: input.condition,
          targetPrice: input.targetPrice,
          note: input.note.trim(),
          active: true,
          triggered: false,
          createdAt: Date.now(),
        };
        set((state) => ({
          priceAlerts: [alert, ...state.priceAlerts],
        }));
        return alert;
      },

      togglePriceAlert: (id) =>
        set((state) => ({
          priceAlerts: state.priceAlerts.map((a) =>
            a.id === id ? { ...a, active: !a.active } : a,
          ),
        })),

      resetPriceAlert: (id) =>
        set((state) => ({
          priceAlerts: state.priceAlerts.map((a) =>
            a.id === id
              ? { ...a, active: true, triggered: false, triggeredAt: undefined, triggeredPrice: undefined }
              : a,
          ),
        })),

      markAlertTriggered: (id, triggeredPrice) =>
        set((state) => ({
          priceAlerts: state.priceAlerts.map((a) =>
            a.id === id
              ? {
                  ...a,
                  active: false,
                  triggered: true,
                  triggeredAt: Date.now(),
                  triggeredPrice,
                }
              : a,
          ),
        })),

      deletePriceAlert: (id) =>
        set((state) => ({
          priceAlerts: state.priceAlerts.filter((a) => a.id !== id),
        })),

      updateTelegramConfig: (partial) =>
        set((state) => ({
          telegramConfig: { ...state.telegramConfig, ...partial },
        })),

      hydrateSettings: (data) =>
        set((state) => ({
          priceAlerts: Array.isArray(data.priceAlerts) ? data.priceAlerts : state.priceAlerts,
          telegramConfig: data.telegramConfig
            ? { ...DEFAULT_TELEGRAM, ...data.telegramConfig }
            : state.telegramConfig,
        })),
    }),
    {
      name: 'cryptopulse-settings-v1',
    },
  ),
);
