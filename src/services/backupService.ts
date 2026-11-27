import { usePortfolioStore, type PortfolioPersistedData } from '../store/usePortfolioStore';
import { useSettingsStore, type SettingsPersistedData } from '../store/useSettingsStore';
import { useTradingStore, type TradingPersistedData } from '../store/useTradingStore';

export interface CryptoPulseBackupPayload {
  app: 'CryptoPulse Terminal';
  schemaVersion: 1;
  exportedAt: number;
  trading: TradingPersistedData;
  portfolio: PortfolioPersistedData;
  settings: SettingsPersistedData;
}

export interface BackupSummary {
  exportedAt: number;
  watchlistCount: number;
  futuresSetupsCount: number;
  spotSetupsCount: number;
  holdingsCount: number;
  usdtBalance: number;
  activityLogsCount: number;
  alertsCount: number;
}

export function buildBackupPayload(includeTelegramSecrets = true): CryptoPulseBackupPayload {
  const t = useTradingStore.getState();
  const p = usePortfolioStore.getState();
  const s = useSettingsStore.getState();

  return {
    app: 'CryptoPulse Terminal',
    schemaVersion: 1,
    exportedAt: Date.now(),
    trading: {
      watchlist: t.watchlist,
      futuresSetups: t.futuresSetups,
      spotSetups: t.spotSetups,
      maxDailySlHits: t.maxDailySlHits,
      scannerConfig: t.scannerConfig,
      scannerLogs: t.scannerLogs,
      scannerCooldowns: t.scannerCooldowns,
    },
    portfolio: {
      usdtBalance: p.usdtBalance,
      autoDeductUsdtOnBuy: p.autoDeductUsdtOnBuy,
      autoCreditUsdtOnSell: p.autoCreditUsdtOnSell,
      holdings: p.holdings,
      activityLogs: p.activityLogs,
      snapshots: p.snapshots,
    },
    settings: {
      priceAlerts: s.priceAlerts,
      telegramConfig: includeTelegramSecrets
        ? s.telegramConfig
        : { ...s.telegramConfig, botToken: '', chatId: '' },
    },
  };
}

export function downloadBackupJson(includeTelegramSecrets = true): string {
  const payload = buildBackupPayload(includeTelegramSecrets);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `cryptopulse-backup-${dateStr}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

export function validateBackupJson(
  rawText: string,
): { ok: true; payload: CryptoPulseBackupPayload; summary: BackupSummary } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(rawText) as Partial<CryptoPulseBackupPayload>;
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'Format file bukan objek JSON yang valid.' };
    }
    if (parsed.app !== 'CryptoPulse Terminal' || parsed.schemaVersion !== 1) {
      return {
        ok: false,
        error: 'File backup tidak dikenali sebagai backup resmi CryptoPulse Terminal (v1).',
      };
    }
    if (!parsed.trading || !parsed.portfolio || !parsed.settings) {
      return { ok: false, error: 'Struktur backup tidak lengkap (trading/portfolio/settings hilang).' };
    }

    const payload = parsed as CryptoPulseBackupPayload;
    const summary: BackupSummary = {
      exportedAt: payload.exportedAt || Date.now(),
      watchlistCount: payload.trading.watchlist?.length ?? 0,
      futuresSetupsCount: payload.trading.futuresSetups?.length ?? 0,
      spotSetupsCount: payload.trading.spotSetups?.length ?? 0,
      holdingsCount: payload.portfolio.holdings?.length ?? 0,
      usdtBalance: payload.portfolio.usdtBalance ?? 0,
      activityLogsCount: payload.portfolio.activityLogs?.length ?? 0,
      alertsCount: payload.settings.priceAlerts?.length ?? 0,
    };

    return { ok: true, payload, summary };
  } catch {
    return { ok: false, error: 'Gagal membaca JSON — pastikan file backup valid dan tidak rusak.' };
  }
}

export function restoreBackupPayload(payload: CryptoPulseBackupPayload): void {
  useTradingStore.getState().hydrateTrading(payload.trading);
  usePortfolioStore.getState().hydratePortfolio(payload.portfolio);
  useSettingsStore.getState().hydrateSettings(payload.settings);
}
