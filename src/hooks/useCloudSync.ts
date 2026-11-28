import { useCallback, useEffect, useRef, useState } from 'react';
import {
  restoreBackupPayload,
  type BackupSummary,
  type CryptoPulseBackupPayload,
} from '../services/backupService';
import {
  decodeCloudPairCode,
  decodeSyncCode,
  fetchRemoteGistSnapshot,
  isApplyingRemoteSync,
  pullCloudSyncGist,
  pushCloudSyncGist,
  withRemoteSyncLock,
} from '../services/syncService';
import { useAppStore } from '../store/useAppStore';
import { usePortfolioStore } from '../store/usePortfolioStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTradingStore } from '../store/useTradingStore';

export interface IncomingSyncPrompt {
  kind: 'SNAPSHOT';
  payload: CryptoPulseBackupPayload;
  summary: BackupSummary;
}

export interface IncomingPairPrompt {
  kind: 'CLOUD_PAIR';
  githubToken: string;
  gistId: string;
}

export type IncomingMobileSyncPrompt = IncomingSyncPrompt | IncomingPairPrompt;

const AUTO_PUSH_DEBOUNCE_MS = 1200; // Fast 1.2s push so mobile edits reach Cloud before app switches
const AUTO_PULL_INTERVAL_MS = 20_000; // Check Cloud every 20s while visible so open Web tabs auto-update

/**
 * Global hook sinkronisasi lintas perangkat (Web <-> Mobile):
 * 1) Mendeteksi link transfer instan `#cp-sync=...` dan link pairing `#cp-pair=...`.
 * 2) Auto-Pull real-time saat startup, tab visible, window focus, reconnect online, & polling 20 detik.
 * 3) Auto-Push cepat (1.2 detik) + flush `keepalive` saat browser mobile ditutup/pindah app,
 *    hanya untuk perubahan data asli (mengabaikan tick harga/snapshot agar tidak pernah menimpa perangkat lain).
 */
export function useCloudSync() {
  const [incomingPrompt, setIncomingPrompt] = useState<IncomingMobileSyncPrompt | null>(null);
  const cloudSync = useSettingsStore((s) => s.cloudSyncConfig);
  const updateCloudSyncConfig = useSettingsStore((s) => s.updateCloudSyncConfig);
  const pushToast = useAppStore((s) => s.pushToast);
  const setCloudSyncBusy = useAppStore((s) => s.setCloudSyncBusy);

  const pushTimerRef = useRef<number | null>(null);
  const hasPendingPushRef = useRef(false);
  const syncingRef = useRef(false);

  const hasCredentials = Boolean(cloudSync.githubToken.trim() && cloudSync.gistId.trim());
  const autoSyncActive = hasCredentials && cloudSync.autoSync !== false;

  // 1) Check URL hash for incoming instant sync snapshot or cloud pairing link
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const inspectHash = async () => {
      const hash = window.location.hash;
      if (!hash) return;

      if (hash.startsWith('#cp-sync=')) {
        const raw = hash;
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        const decoded = await decodeSyncCode(raw);
        if (decoded.ok) {
          setIncomingPrompt({
            kind: 'SNAPSHOT',
            payload: decoded.payload,
            summary: decoded.summary,
          });
        } else {
          pushToast('Link Sync Tidak Valid', decoded.error, 'error');
        }
      } else if (hash.startsWith('#cp-pair=')) {
        const raw = hash;
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        const decoded = decodeCloudPairCode(raw);
        if (decoded.ok) {
          setIncomingPrompt({
            kind: 'CLOUD_PAIR',
            githubToken: decoded.githubToken,
            gistId: decoded.gistId,
          });
        } else {
          pushToast('Link Pairing Cloud Tidak Valid', decoded.error, 'error');
        }
      }
    };

    void inspectHash();
    const onHashChange = () => void inspectHash();
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [pushToast]);

  const confirmIncomingPrompt = useCallback(async () => {
    if (!incomingPrompt) return;
    const current = incomingPrompt;
    setIncomingPrompt(null);

    if (current.kind === 'SNAPSHOT') {
      withRemoteSyncLock(() => {
        restoreBackupPayload(current.payload);
      });
      pushToast(
        'Sync Mobile/Web Diterapkan',
        `${current.summary.holdingsCount} aset spot, ${current.summary.futuresSetupsCount + current.summary.spotSetupsCount} setup, dan ${current.summary.watchlistCount} watchlist disinkronkan.`,
        'success',
      );
      return;
    }

    // CLOUD_PAIR: save credentials and immediately pull latest state from Cloud Gist
    const nextCfg = {
      ...useSettingsStore.getState().cloudSyncConfig,
      enabled: true,
      autoSync: true,
      githubToken: current.githubToken,
      gistId: current.gistId,
      lastSyncError: undefined,
    };
    withRemoteSyncLock(() => {
      updateCloudSyncConfig(nextCfg);
    });

    setCloudSyncBusy(true);
    try {
      const pullRes = await pullCloudSyncGist(nextCfg);
      if (pullRes.ok) {
        withRemoteSyncLock(() => {
          updateCloudSyncConfig({
            lastSyncedAt: pullRes.syncedAt,
            lastSyncDirection: 'PULL',
            lastSyncError: undefined,
          });
        });
        pushToast('Cloud Sync Terhubung & Ditarik', pullRes.message, 'success');
      } else {
        withRemoteSyncLock(() => {
          updateCloudSyncConfig({ lastSyncError: pullRes.error });
        });
        pushToast('Pairing Tersimpan, Pull Gagal', pullRes.error, 'warning');
      }
    } finally {
      setCloudSyncBusy(false);
    }
  }, [incomingPrompt, pushToast, setCloudSyncBusy, updateCloudSyncConfig]);

  const cancelIncomingPrompt = useCallback(() => {
    setIncomingPrompt(null);
  }, []);

  // 2) Auto-Pull on mount, visibilitychange, window focus, online reconnect, and 20s visible polling
  useEffect(() => {
    if (!autoSyncActive) return;

    const checkAndPull = async () => {
      if (syncingRef.current || isApplyingRemoteSync() || hasPendingPushRef.current) return;
      const cfg = useSettingsStore.getState().cloudSyncConfig;
      if (!cfg.githubToken.trim() || !cfg.gistId.trim() || cfg.autoSync === false) return;

      syncingRef.current = true;
      setCloudSyncBusy(true);
      try {
        const remoteRes = await fetchRemoteGistSnapshot(cfg);
        if (!remoteRes.ok) return;

        const { payload, summary, remoteUpdatedAt } = remoteRes.snapshot;
        const localSyncedAt = cfg.lastSyncedAt ?? 0;

        // Compare strictly against GitHub's own server timestamp (no clock skew, no 3s blind window!)
        if (remoteUpdatedAt > localSyncedAt) {
          withRemoteSyncLock(() => {
            restoreBackupPayload(payload);
            updateCloudSyncConfig({
              enabled: true,
              lastSyncedAt: remoteUpdatedAt,
              lastSyncDirection: 'PULL',
              lastSyncError: undefined,
            });
          });
          pushToast(
            'Cloud Sync Diperbarui',
            `${summary.holdingsCount} aset spot · ${summary.futuresSetupsCount + summary.spotSetupsCount} setup jurnal · ${summary.alertsCount} alerts.`,
            'info',
          );
        }
      } finally {
        syncingRef.current = false;
        setCloudSyncBusy(false);
      }
    };

    void checkAndPull();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void checkAndPull();
      }
    };
    const onFocus = () => {
      void checkAndPull();
    };
    const onOnline = () => {
      void checkAndPull();
    };

    const pollTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void checkAndPull();
      }
    }, AUTO_PULL_INTERVAL_MS);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);

    return () => {
      window.clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [autoSyncActive, pushToast, setCloudSyncBusy, updateCloudSyncConfig]);

  // 3) Fast Auto-Push (1.2s) ONLY on meaningful user edits + keepalive flush on mobile app switch/close
  useEffect(() => {
    if (!autoSyncActive) return;

    const executePush = async (keepalive = false) => {
      if (isApplyingRemoteSync()) return;
      if (syncingRef.current && !keepalive) return;

      const cfg = useSettingsStore.getState().cloudSyncConfig;
      if (!cfg.githubToken.trim() || !cfg.gistId.trim() || cfg.autoSync === false) return;

      hasPendingPushRef.current = false;
      syncingRef.current = true;
      setCloudSyncBusy(true);
      try {
        const res = await pushCloudSyncGist(cfg, { keepalive });
        if (res.ok) {
          withRemoteSyncLock(() => {
            updateCloudSyncConfig({
              enabled: true,
              gistId: res.gistId,
              lastSyncedAt: res.syncedAt,
              lastSyncDirection: 'PUSH',
              lastSyncError: undefined,
            });
          });
        } else {
          withRemoteSyncLock(() => {
            updateCloudSyncConfig({ lastSyncError: res.error });
          });
        }
      } finally {
        syncingRef.current = false;
        setCloudSyncBusy(false);
      }
    };

    const schedulePush = () => {
      if (isApplyingRemoteSync()) return;
      hasPendingPushRef.current = true;
      if (pushTimerRef.current !== null) {
        window.clearTimeout(pushTimerRef.current);
      }
      pushTimerRef.current = window.setTimeout(() => {
        pushTimerRef.current = null;
        void executePush(false);
      }, AUTO_PUSH_DEBOUNCE_MS);
    };

    // Only push on genuine user data changes (ignore live price snapshots & ephemeral cooldown ticks!)
    const unsubTrading = useTradingStore.subscribe((state, prev) => {
      if (
        state.watchlist !== prev.watchlist ||
        state.futuresSetups !== prev.futuresSetups ||
        state.spotSetups !== prev.spotSetups ||
        state.maxDailySlHits !== prev.maxDailySlHits ||
        state.scannerConfig !== prev.scannerConfig
      ) {
        schedulePush();
      }
    });

    const unsubPortfolio = usePortfolioStore.subscribe((state, prev) => {
      if (
        state.usdtBalance !== prev.usdtBalance ||
        state.holdings !== prev.holdings ||
        state.activityLogs !== prev.activityLogs ||
        state.autoDeductUsdtOnBuy !== prev.autoDeductUsdtOnBuy ||
        state.autoCreditUsdtOnSell !== prev.autoCreditUsdtOnSell
      ) {
        schedulePush();
      }
    });

    const unsubSettings = useSettingsStore.subscribe((state, prev) => {
      if (state.priceAlerts !== prev.priceAlerts || state.telegramConfig !== prev.telegramConfig) {
        schedulePush();
      }
    });

    // Flush immediately if user backgrounds/closes mobile browser right after saving a setup
    const flushIfPending = () => {
      if (!hasPendingPushRef.current) return;
      if (pushTimerRef.current !== null) {
        window.clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
      void executePush(true);
    };

    const onVisibilityHide = () => {
      if (document.visibilityState === 'hidden') {
        flushIfPending();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityHide);
    window.addEventListener('pagehide', flushIfPending);

    return () => {
      unsubTrading();
      unsubPortfolio();
      unsubSettings();
      document.removeEventListener('visibilitychange', onVisibilityHide);
      window.removeEventListener('pagehide', flushIfPending);
      if (pushTimerRef.current !== null) {
        window.clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
    };
  }, [autoSyncActive, setCloudSyncBusy, updateCloudSyncConfig]);

  return {
    incomingPrompt,
    confirmIncomingPrompt,
    cancelIncomingPrompt,
  };
}
