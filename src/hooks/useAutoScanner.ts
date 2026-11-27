import { useCallback, useEffect } from 'react';
import type { AutoSignalLog, SpotFunnelCandidate, SpotSetup } from '../types';
import { fetchBinanceKlines } from '../services/adapters/binanceAdapter';
import { sendTelegramHtmlMessage } from '../services/adapters/telegramAdapter';
import { detectSupportResistance } from '../services/indicators';
import { runFuturesProScan, runSpot100FunnelScan } from '../services/scannerEngine';
import { generateSpotDcaPlan } from '../services/spotScoring';
import { useAppStore } from '../store/useAppStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTradingStore } from '../store/useTradingStore';
import { generateId } from '../utils/format';
import { formatAutoScannerTelegram } from '../utils/telegramFormatters';

let scanInFlight = false;

/**
 * Shared singleton scanner execution runner (safe across tabs & manual clicks).
 */
export async function executeScannerCycle(manual = false): Promise<void> {
  if (scanInFlight) return;
  scanInFlight = true;

  const setRuntime = useAppStore.getState().setScannerRuntime;
  setRuntime({
    scannerRunning: true,
    scannerProgressText: 'Memulai pemindaian...',
    scannerProgressPct: 5,
  });

  try {
    const appState = useAppStore.getState();
    const tradingState = useTradingStore.getState();
    const settingsState = useSettingsStore.getState();
    const config = tradingState.scannerConfig;
    const now = Date.now();

    const shouldAutoSend =
      (config.autoSendTelegram ||
        (settingsState.telegramConfig.enabled && settingsState.telegramConfig.autoSendScanner)) &&
      Boolean(settingsState.telegramConfig.botToken && settingsState.telegramConfig.chatId);

    const onProgress = (label: string, pct: number) => {
      useAppStore.getState().setScannerRuntime({
        scannerProgressText: label,
        scannerProgressPct: pct,
      });
    };

    if (config.mode === 'FUTURES') {
      const { report, signals } = await runFuturesProScan(
        appState.coins,
        appState.coinsMap,
        tradingState.watchlist,
        tradingState.scannerCooldowns,
        config,
        onProgress,
      );

      for (const item of signals) {
        const { log, setup } = item;
        if (config.autoSaveJournal) {
          useTradingStore.getState().addFuturesSetup(setup);
          log.savedToJournal = true;
        }
        if (shouldAutoSend) {
          const res = await sendTelegramHtmlMessage(
            settingsState.telegramConfig,
            formatAutoScannerTelegram(log),
          );
          log.telegramSent = res.ok;
          if (!res.ok) {
            appState.pushToast('Auto-Kirim Telegram Gagal', res.message, 'error');
          }
        }
        useTradingStore.getState().setSymbolCooldown(log.symbol, now);
        useTradingStore.getState().addScannerLog(log);
      }

      setRuntime({
        lastScanAt: now,
        lastFuturesReport: report,
      });

      if (signals.length > 0) {
        appState.pushToast(
          `Scanner Pro Futures: ${signals.length} Sinyal Terverifikasi`,
          `${report.passedCount}/${report.evaluatedCount} kandidat lolos 6-Layer Quality Gate (TF ${config.timeframe.toUpperCase()}).`,
          'success',
        );
      } else if (manual) {
        appState.pushToast(
          'Scan Selesai — 0 Sinyal Lolos Filter Ketat',
          `Diperiksa ${report.evaluatedCount} koin di TF ${config.timeframe.toUpperCase()}. Semua ditolak Quality Gate untuk mencegah entry berisiko.`,
          'info',
        );
      }
    } else {
      // SPOT_DCA mode: 100-Coin 4-Stage Institutional Funnel
      const { report, signals } = await runSpot100FunnelScan(
        appState.coins,
        appState.coinsMap,
        tradingState.scannerCooldowns,
        config,
        manual,
        onProgress,
      );

      if (config.autoAddWatchlist) {
        const readySymbols = report.candidates
          .filter((c) => c.stageReached === 'WATCHLIST_READY')
          .map((c) => c.symbol);
        if (readySymbols.length > 0) {
          useTradingStore.getState().addToWatchlistBatch(readySymbols);
        }
      }

      for (const item of signals) {
        const { log, spotSetup } = item;
        if (config.autoSaveJournal) {
          useTradingStore.getState().addSpotSetup(spotSetup);
          log.savedToJournal = true;
        }
        if (shouldAutoSend) {
          const res = await sendTelegramHtmlMessage(
            settingsState.telegramConfig,
            formatAutoScannerTelegram(log),
          );
          log.telegramSent = res.ok;
          if (!res.ok) {
            appState.pushToast('Auto-Kirim Telegram Gagal', res.message, 'error');
          }
        }
        useTradingStore.getState().setSymbolCooldown(log.symbol, now);
        useTradingStore.getState().addScannerLog(log);
      }

      setRuntime({
        lastScanAt: now,
        lastSpotFunnelReport: report,
      });

      if (manual || report.watchlistReady > 0) {
        appState.pushToast(
          `Spot Funnel 100 Coin: ${report.watchlistReady} Layak Watchlist`,
          `Saringan: ${report.initialCount} → Outperf ${report.afterOutperformance} → Tokenomic ${report.afterTokenomics} → Trend ${report.afterTrend} → ${report.watchlistReady} Watchlist.`,
          report.watchlistReady > 0 ? 'success' : 'info',
        );
      }
    }
  } finally {
    scanInFlight = false;
    useAppStore.getState().setScannerRuntime({
      scannerRunning: false,
      scannerProgressText: '',
      scannerProgressPct: 0,
    });
  }
}

/**
 * Mounted ONCE globally in App.tsx so Auto-Scan continues running seamlessly
 * even when the user switches away from the Screener tab.
 */
export function useGlobalAutoScanner(): void {
  const enabled = useTradingStore((s) => s.scannerConfig.enabled);
  const intervalSeconds = useTradingStore((s) => s.scannerConfig.intervalSeconds);

  useEffect(() => {
    if (!enabled) return;
    const intervalMs = Math.max(30, intervalSeconds) * 1000;
    const timer = window.setInterval(() => {
      void executeScannerCycle(false);
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [enabled, intervalSeconds]);
}

/**
 * UI hook consumed by AutoSignalBotPanel & SpotFunnelPanel.
 */
export function useAutoScanner() {
  const scannerConfig = useTradingStore((s) => s.scannerConfig);
  const scannerLogs = useTradingStore((s) => s.scannerLogs);
  const updateScannerConfig = useTradingStore((s) => s.updateScannerConfig);

  const isScanning = useAppStore((s) => s.scannerRunning);
  const progressText = useAppStore((s) => s.scannerProgressText);
  const progressPct = useAppStore((s) => s.scannerProgressPct);
  const lastScanAt = useAppStore((s) => s.lastScanAt);
  const lastFuturesReport = useAppStore((s) => s.lastFuturesReport);
  const lastSpotFunnelReport = useAppStore((s) => s.lastSpotFunnelReport);

  const scanNow = useCallback(async (manual = true) => {
    await executeScannerCycle(manual);
  }, []);

  const resendSignalToTelegram = useCallback(async (log: AutoSignalLog) => {
    const { telegramConfig } = useSettingsStore.getState();
    const { pushToast, openSettingsModal } = useAppStore.getState();

    if (!telegramConfig.botToken || !telegramConfig.chatId) {
      pushToast(
        'Telegram Belum Dikonfigurasi',
        'Isi Bot Token & Chat ID di Settings & Backup untuk mengirim sinyal.',
        'warning',
      );
      openSettingsModal();
      return;
    }

    const res = await sendTelegramHtmlMessage(telegramConfig, formatAutoScannerTelegram(log));
    if (res.ok) {
      useTradingStore.getState().markScannerLogTelegramSent(log.id);
      pushToast(
        'Sinyal Terkirim ke Telegram',
        `${log.symbol} (${log.direction}) berhasil diteruskan.`,
        'success',
      );
    } else {
      pushToast('Gagal Kirim Telegram', res.message, 'error');
    }
  }, []);

  const saveSpotCandidateToJournal = useCallback(async (cand: SpotFunnelCandidate) => {
    const { scannerConfig: cfg, addSpotSetup } = useTradingStore.getState();
    const { pushToast } = useAppStore.getState();
    const { candles } = await fetchBinanceKlines(cand.symbol, '1d', 160, cand.price);
    const { supports } = detectSupportResistance(candles);
    const plan = generateSpotDcaPlan(cand.price, cfg.defaultSpotBudget, supports);
    const now = Date.now();

    const setup: SpotSetup = {
      id: generateId('spot'),
      symbol: cand.symbol,
      baseAsset: cand.baseAsset,
      budgetUsdt: cfg.defaultSpotBudget,
      qualityScore: cand.finalScore,
      tier: cand.tier ?? 'Growth',
      layers: plan.layers,
      projectedAvgEntry: plan.projectedAvgEntry,
      tp1: plan.tp1,
      tp2: plan.tp2,
      tp3: plan.tp3,
      roiTp1Percent: plan.roiTp1Percent,
      roiTp2Percent: plan.roiTp2Percent,
      roiTp3Percent: plan.roiTp3Percent,
      sellPercentAtTp2ForBreakEven: plan.sellPercentAtTp2ForBreakEven,
      moonbagQty: plan.moonbagQty,
      moonbagValueAtTp3Usdt: plan.moonbagValueAtTp3Usdt,
      notes: `Spot Funnel 100→Watchlist: ${cand.highlights.join(' | ')}`,
      status: 'Waiting',
      source: 'AutoBot',
      createdAt: now,
      updatedAt: now,
    };

    addSpotSetup(setup);
    pushToast(
      `Setup DCA ${cand.baseAsset} Disimpan`,
      `3-Layer DCA (Avg ${plan.projectedAvgEntry.toPrecision(5)}) tersimpan di Tab Setup & Risk.`,
      'success',
    );
  }, []);

  return {
    scannerConfig,
    scannerLogs,
    isScanning,
    progressText,
    progressPct,
    lastScanAt,
    lastFuturesReport,
    lastSpotFunnelReport,
    updateScannerConfig,
    scanNow,
    resendSignalToTelegram,
    saveSpotCandidateToJournal,
  };
}
