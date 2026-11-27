import { useCallback, useEffect, useRef, useState } from 'react';
import {
  restoreBackupPayload,
  type BackupSummary,
  type CryptoPulseBackupPayload,
} from '../services/backupService';
import {
  decodeCloudPairCode,
  decodeSyncCode,
  fetchCloudGistUpdatedAt,
  pullCloudSyncGist,
  pushCloudSyncGist,
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

/**
 * Global hook sinkronisasi lintas perangkat (Web <-> Mobile):
 * 1) Mendeteksi link transfer instan `#cp-sync=...` dan link pairing `#cp-pair=...` saat buka app.
 * 2) Menjalankan Cloud Auto-Sync dua arah via Private GitHub Gist bila diaktifkan oleh pengguna.
 */
export function useCloudSync() {
  const [incomingPrompt, setIncomingPrompt] = useState<IncomingMobileSyncPrompt | null>(null);
  const cloudSync = useSettingsStore((s) => s.cloudSyncConfig);
  const updateCloudSyncConfig = useSettingsStore((s) => s.updateCloudSyncConfig);
  const pushToast = useAppStore((s) => s.pushToast);

  const applyingRemoteRef = useRef(false);
  const pushTimerRef = useRef<number | null>(null);
  const syncingRef = useRef(false);

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
      applyingRemoteRef.current = true;
      try {
        restoreBackupPayload(current.payload);
        pushToast(
          'Sync Mobile/Web Diterapkan',
          `${current.summary.holdingsCount} aset spot, ${current.summary.futuresSetupsCount + current.summary.spotSetupsCount} setup, dan ${current.summary.watchlistCount} watchlist disinkronkan.`,
          'success',
        );
      } finally {
        window.setTimeout(() => {
          applyingRemoteRef.current = false;
        }, 500);
      }
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
    updateCloudSyncConfig(nextCfg);

    applyingRemoteRef.current = true;
    try {
      const pullRes = await pullCloudSyncGist(nextCfg);
      if (pullRes.ok) {
        updateCloudSyncConfig({
          lastSyncedAt: pullRes.syncedAt,
          lastSyncDirection: 'PULL',
          lastSyncError: undefined,
        });
        pushToast('Cloud Sync Terhubung & Ditarik', pullRes.message, 'success');
      } else {
        updateCloudSyncConfig({ lastSyncError: pullRes.error });
        pushToast('Pairing Tersimpan, Pull Gagal', pullRes.error, 'warning');
      }
    } finally {
      window.setTimeout(() => {
        applyingRemoteRef.current = false;
      }, 600);
    }
  }, [incomingPrompt, pushToast, updateCloudSyncConfig]);

  const cancelIncomingPrompt = useCallback(() => {
    setIncomingPrompt(null);
  }, []);

  // 2) Auto-Pull from Cloud Gist on startup & tab refocus (e.g., switching from Desktop to Mobile)
  useEffect(() => {
    if (!cloudSync.enabled || !cloudSync.autoSync || !cloudSync.githubToken || !cloudSync.gistId) {
      return;
    }

    const checkAndPull = async () => {
      if (syncingRef.current || applyingRemoteRef.current) return;
      const cfg = useSettingsStore.getState().cloudSyncConfig;
      if (!cfg.enabled || !cfg.autoSync || !cfg.githubToken || !cfg.gistId) return;

      syncingRef.current = true;
      try {
        const remoteTs = await fetchCloudGistUpdatedAt(cfg);
        if (!remoteTs) return;
        const localTs = cfg.lastSyncedAt ?? 0;
        // Pull if remote cloud snapshot is strictly newer (> 3s buffer)
        if (remoteTs > localTs + 3000) {
          applyingRemoteRef.current = true;
          const res = await pullCloudSyncGist(cfg);
          if (res.ok) {
            updateCloudSyncConfig({
              lastSyncedAt: res.syncedAt,
              lastSyncDirection: 'PULL',
              lastSyncError: undefined,
            });
            pushToast('Cloud Sync Diperbarui', res.message, 'info');
          }
          window.setTimeout(() => {
            applyingRemoteRef.current = false;
          }, 600);
        }
      } finally {
        syncingRef.current = false;
      }
    };

    void checkAndPull();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void checkAndPull();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [cloudSync.enabled, cloudSync.autoSync, cloudSync.githubToken, cloudSync.gistId, pushToast, updateCloudSyncConfig]);

  // 3) Auto-Push debounced when local persisted state changes
  useEffect(() => {
    if (!cloudSync.enabled || !cloudSync.autoSync || !cloudSync.githubToken || !cloudSync.gistId) {
      return;
    }

    const schedulePush = () => {
      if (applyingRemoteRef.current) return;
      if (pushTimerRef.current !== null) {
        window.clearTimeout(pushTimerRef.current);
      }
      pushTimerRef.current = window.setTimeout(async () => {
        if (applyingRemoteRef.current || syncingRef.current) return;
        const cfg = useSettingsStore.getState().cloudSyncConfig;
        if (!cfg.enabled || !cfg.autoSync || !cfg.githubToken || !cfg.gistId) return;

        syncingRef.current = true;
        try {
          const res = await pushCloudSyncGist(cfg);
          if (res.ok) {
            applyingRemoteRef.current = true;
            updateCloudSyncConfig({
              gistId: res.gistId,
              lastSyncedAt: res.syncedAt,
              lastSyncDirection: 'PUSH',
              lastSyncError: undefined,
            });
            window.setTimeout(() => {
              applyingRemoteRef.current = false;
            }, 300);
          } else {
            applyingRemoteRef.current = true;
            updateCloudSyncConfig({ lastSyncError: res.error });
            window.setTimeout(() => {
              applyingRemoteRef.current = false;
            }, 300);
          }
        } finally {
          syncingRef.current = false;
        }
      }, 4000);
    };

    const unsubTrading = useTradingStore.subscribe(schedulePush);
    const unsubPortfolio = usePortfolioStore.subscribe(schedulePush);
    const unsubSettings = useSettingsStore.subscribe((state, prev) => {
      // Only push when priceAlerts or telegramConfig changed (ignore cloudSync metadata timestamp updates)
      if (state.priceAlerts !== prev.priceAlerts || state.telegramConfig !== prev.telegramConfig) {
        schedulePush();
      }
    });

    return () => {
      unsubTrading();
      unsubPortfolio();
      unsubSettings();
      if (pushTimerRef.current !== null) {
        window.clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
    };
  }, [cloudSync.enabled, cloudSync.autoSync, cloudSync.githubToken, cloudSync.gistId, updateCloudSyncConfig]);

  return {
    incomingPrompt,
    confirmIncomingPrompt,
    cancelIncomingPrompt,
  };
}
