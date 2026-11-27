import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AlertCondition, CloudSyncConfig, PriceAlert, TelegramConfig } from '../types';
import { generateId } from '../utils/format';

export interface SettingsPersistedData {
  priceAlerts: PriceAlert[];
  telegramConfig: TelegramConfig;
  cloudSyncConfig?: CloudSyncConfig;
}

interface SettingsState extends SettingsPersistedData {
  cloudSyncConfig: CloudSyncConfig;
  demoCleanedV2?: boolean;
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
  updateCloudSyncConfig: (partial: Partial<CloudSyncConfig>) => void;
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

const DEFAULT_CLOUD_SYNC: CloudSyncConfig = {
  enabled: false,
  githubToken: '',
  gistId: '',
  autoSync: true,
  includeSecrets: true,
};

const LEGACY_DEMO_ALERT_IDS = new Set(['alert_seed_btc', 'alert_seed_sol']);

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      priceAlerts: [],
      telegramConfig: DEFAULT_TELEGRAM,
      cloudSyncConfig: DEFAULT_CLOUD_SYNC,
      demoCleanedV2: true,

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

      updateCloudSyncConfig: (partial) =>
        set((state) => ({
          cloudSyncConfig: { ...state.cloudSyncConfig, ...partial },
        })),

      hydrateSettings: (data) =>
        set((state) => ({
          priceAlerts: Array.isArray(data.priceAlerts)
            ? data.priceAlerts.filter((a) => !LEGACY_DEMO_ALERT_IDS.has(a.id))
            : state.priceAlerts,
          telegramConfig: data.telegramConfig
            ? { ...DEFAULT_TELEGRAM, ...data.telegramConfig }
            : state.telegramConfig,
          cloudSyncConfig: data.cloudSyncConfig
            ? { ...state.cloudSyncConfig, ...data.cloudSyncConfig }
            : state.cloudSyncConfig,
        })),
    }),
    {
      name: 'cryptopulse-settings-v1',
      version: 2,
      migrate: (persistedState) => {
        const persisted = (persistedState ?? {}) as Partial<SettingsState>;
        const rawAlerts = Array.isArray(persisted.priceAlerts) ? persisted.priceAlerts : [];
        return {
          ...persisted,
          priceAlerts: rawAlerts.filter((a) => !LEGACY_DEMO_ALERT_IDS.has(a.id)),
          telegramConfig: {
            ...DEFAULT_TELEGRAM,
            ...(persisted.telegramConfig ?? {}),
          },
          cloudSyncConfig: {
            ...DEFAULT_CLOUD_SYNC,
            ...(persisted.cloudSyncConfig ?? {}),
          },
          demoCleanedV2: true,
        };
      },
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<SettingsState>;
        const rawAlerts = Array.isArray(persisted.priceAlerts) ? persisted.priceAlerts : [];
        const cleanedAlerts = persisted.demoCleanedV2
          ? rawAlerts
          : rawAlerts.filter((a) => !LEGACY_DEMO_ALERT_IDS.has(a.id));

        return {
          ...currentState,
          ...persisted,
          priceAlerts: cleanedAlerts,
          telegramConfig: {
            ...DEFAULT_TELEGRAM,
            ...(persisted.telegramConfig ?? {}),
          },
          cloudSyncConfig: {
            ...DEFAULT_CLOUD_SYNC,
            ...(persisted.cloudSyncConfig ?? {}),
          },
          demoCleanedV2: true,
        };
      },
    },
  ),
);
