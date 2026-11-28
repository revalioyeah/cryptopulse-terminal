import { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  CloudDownload,
  CloudUpload,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  Link2,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  Upload,
} from 'lucide-react';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import {
  detectTelegramChatId,
  testTelegramConnection,
} from '../../services/adapters/telegramAdapter';
import {
  downloadBackupJson,
  restoreBackupPayload,
  validateBackupJson,
  type BackupSummary,
  type CryptoPulseBackupPayload,
} from '../../services/backupService';
import {
  buildSyncShareUrl,
  decodeCloudPairCode,
  decodeSyncCode,
  discoverCryptoPulseGistId,
  encodeCloudPairCode,
  pullCloudSyncGist,
  pushCloudSyncGist,
  withRemoteSyncLock,
} from '../../services/syncService';
import { useAppStore, type SettingsModalTab } from '../../store/useAppStore';
import { usePortfolioStore } from '../../store/usePortfolioStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTradingStore } from '../../store/useTradingStore';
import { formatDateTime, formatUsd } from '../../utils/format';
import {
  formatAutoScannerTelegram,
  formatFuturesSetupTelegram,
  formatPriceAlertTelegram,
  formatSpotSetupTelegram,
} from '../../utils/telegramFormatters';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Modal } from '../ui/Modal';

type FormatterTab = 'FUTURES' | 'SPOT' | 'SCANNER' | 'ALERT';

export function SettingsBackupModal() {
  const open = useAppStore((s) => s.settingsModalOpen);
  const activeTab = useAppStore((s) => s.settingsModalTab);
  const openSettingsModal = useAppStore((s) => s.openSettingsModal);
  const closeModal = useAppStore((s) => s.closeSettingsModal);
  const pushToast = useAppStore((s) => s.pushToast);

  const telegramConfig = useSettingsStore((s) => s.telegramConfig);
  const updateTelegramConfig = useSettingsStore((s) => s.updateTelegramConfig);
  const cloudSyncConfig = useSettingsStore((s) => s.cloudSyncConfig);
  const updateCloudSyncConfig = useSettingsStore((s) => s.updateCloudSyncConfig);
  const priceAlerts = useSettingsStore((s) => s.priceAlerts);

  const watchlist = useTradingStore((s) => s.watchlist);
  const futuresSetups = useTradingStore((s) => s.futuresSetups);
  const spotSetups = useTradingStore((s) => s.spotSetups);

  const holdings = usePortfolioStore((s) => s.holdings);
  const usdtBalance = usePortfolioStore((s) => s.usdtBalance);
  const activityLogs = usePortfolioStore((s) => s.activityLogs);

  const { canPromptInstall, isInstalled, isIos, promptInstall } = usePwaInstall();

  const [showToken, setShowToken] = useState(false);
  const [showGithubToken, setShowGithubToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [previewType, setPreviewType] = useState<FormatterTab>('FUTURES');
  const [includeSecrets, setIncludeSecrets] = useState(true);

  // Instant Sync & Cloud Sync state
  const [syncInputText, setSyncInputText] = useState('');
  const [generatedSyncOutput, setGeneratedSyncOutput] = useState<{
    label: string;
    value: string;
  } | null>(null);
  const [generatingSync, setGeneratingSync] = useState(false);
  const [cloudBusy, setCloudBusy] = useState<'PUSH' | 'PULL' | null>(null);
  const [pairCodeInput, setPairCodeInput] = useState('');

  const [pendingRestore, setPendingRestore] = useState<{
    payload: CryptoPulseBackupPayload;
    summary: BackupSummary;
    originLabel: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const setActiveTab = (tab: SettingsModalTab) => {
    openSettingsModal(tab);
  };

  const handleDetectChatId = async () => {
    setDetecting(true);
    try {
      const res = await detectTelegramChatId(telegramConfig.botToken);
      if (res.ok && res.chatId) {
        updateTelegramConfig({ chatId: res.chatId });
        pushToast('Chat ID Ditemukan', res.message, 'success');
      } else {
        pushToast('Chat ID Belum Terdeteksi', res.message, 'warning');
      }
    } finally {
      setDetecting(false);
    }
  };

  const handleTestTelegram = async () => {
    setTesting(true);
    try {
      const res = await testTelegramConnection(telegramConfig);
      updateTelegramConfig({
        lastTestedAt: Date.now(),
        lastTestSuccess: res.ok,
      });
      pushToast(
        res.ok ? 'Koneksi Telegram Berhasil' : 'Test Koneksi Gagal',
        res.message,
        res.ok ? 'success' : 'error',
      );
    } finally {
      setTesting(false);
    }
  };

  const copyToClipboard = async (text: string, title: string, desc: string) => {
    let copied = false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        copied = false;
      }
    }

    pushToast(
      copied ? title : `${title} (Siap Disalin)`,
      copied ? desc : 'Salin langsung dari kotak hasil di bawah ini.',
      copied ? 'success' : 'info',
    );
  };

  const handleCopySyncLink = async (mode: 'URL' | 'CODE') => {
    setGeneratingSync(true);
    try {
      const res = await buildSyncShareUrl(includeSecrets);
      if (mode === 'URL') {
        setGeneratedSyncOutput({ label: 'Link Sync Mobile Siap Kirim', value: res.url });
        await copyToClipboard(
          res.url,
          'Link Sync Mobile Disalin',
          `Kirim link ini ke HP Anda (WhatsApp / Telegram Saved Messages) lalu klik untuk sinkronisasi instan (${res.chars} karakter).`,
        );
      } else {
        setGeneratedSyncOutput({ label: 'Kode Sync Instan (CP1Z)', value: res.code });
        await copyToClipboard(
          res.code,
          'Kode Sync Instan Disalin',
          `Tempelkan Kode Sync (${res.code.length} karakter) di HP pada menu Settings -> Mobile & Sync.`,
        );
      }
    } finally {
      setGeneratingSync(false);
    }
  };

  const handleApplySyncInput = async () => {
    const decoded = await decodeSyncCode(syncInputText);
    if (!decoded.ok) {
      pushToast('Kode / Link Sync Tidak Valid', decoded.error, 'error');
      return;
    }
    setPendingRestore({
      payload: decoded.payload,
      summary: decoded.summary,
      originLabel: 'Kode / Link Sync Instan',
    });
  };

  const handleCloudPush = async () => {
    setCloudBusy('PUSH');
    try {
      const res = await pushCloudSyncGist(cloudSyncConfig);
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
        pushToast('Cloud Push Berhasil', res.message, 'success');
      } else {
        withRemoteSyncLock(() => {
          updateCloudSyncConfig({ lastSyncError: res.error });
        });
        pushToast('Cloud Push Gagal', res.error, 'error');
      }
    } finally {
      setCloudBusy(null);
    }
  };

  const handleCloudPull = async () => {
    setCloudBusy('PULL');
    try {
      const res = await pullCloudSyncGist(cloudSyncConfig);
      if (res.ok) {
        withRemoteSyncLock(() => {
          updateCloudSyncConfig({
            enabled: true,
            gistId: res.gistId,
            lastSyncedAt: res.syncedAt,
            lastSyncDirection: 'PULL',
            lastSyncError: undefined,
          });
        });
        pushToast('Cloud Pull Berhasil', res.message, 'success');
      } else {
        withRemoteSyncLock(() => {
          updateCloudSyncConfig({ lastSyncError: res.error });
        });
        pushToast('Cloud Pull Gagal', res.error, 'error');
      }
    } finally {
      setCloudBusy(null);
    }
  };

  const handleDetectGist = async () => {
    setCloudBusy('PULL');
    try {
      const found = await discoverCryptoPulseGistId(cloudSyncConfig.githubToken);
      if (!found.ok) {
        withRemoteSyncLock(() => {
          updateCloudSyncConfig({ lastSyncError: found.error });
        });
        pushToast('Gist Belum Ditemukan', found.error, 'warning');
        return;
      }
      const nextCfg = {
        ...cloudSyncConfig,
        enabled: true,
        autoSync: true,
        gistId: found.gistId,
        lastSyncError: undefined,
      };
      withRemoteSyncLock(() => {
        updateCloudSyncConfig(nextCfg);
      });
      const pullRes = await pullCloudSyncGist(nextCfg);
      if (pullRes.ok) {
        withRemoteSyncLock(() => {
          updateCloudSyncConfig({
            enabled: true,
            gistId: pullRes.gistId,
            lastSyncedAt: pullRes.syncedAt,
            lastSyncDirection: 'PULL',
            lastSyncError: undefined,
          });
        });
        pushToast('Gist Ditemukan & Data Ditarik', pullRes.message, 'success');
      } else {
        withRemoteSyncLock(() => {
          updateCloudSyncConfig({ lastSyncError: pullRes.error });
        });
        pushToast('Gist Ditemukan, Pull Gagal', pullRes.error, 'warning');
      }
    } finally {
      setCloudBusy(null);
    }
  };

  const handleCopyCloudPair = async (mode: 'URL' | 'CODE') => {
    if (!cloudSyncConfig.githubToken || !cloudSyncConfig.gistId) {
      pushToast('Cloud Sync Belum Aktif', 'Push ke Cloud minimal 1x dulu untuk membuat Gist ID.', 'warning');
      return;
    }
    const pair = encodeCloudPairCode(cloudSyncConfig.githubToken, cloudSyncConfig.gistId);
    if (mode === 'URL') {
      await copyToClipboard(
        pair.url,
        'Link Pairing Cloud Disalin',
        'Buka link ini di HP Anda untuk langsung menghubungkan Cloud Auto-Sync (1 klik).',
      );
    } else {
      await copyToClipboard(
        pair.code,
        'Kode Pairing Cloud Disalin',
        'Tempelkan di HP pada kotak "Hubungkan via Kode Pairing".',
      );
    }
  };

  const handleApplyPairCode = async () => {
    const decoded = decodeCloudPairCode(pairCodeInput);
    if (!decoded.ok) {
      pushToast('Kode Pairing Tidak Valid', decoded.error, 'error');
      return;
    }
    const nextCfg = {
      ...cloudSyncConfig,
      enabled: true,
      autoSync: true,
      githubToken: decoded.githubToken,
      gistId: decoded.gistId,
      lastSyncError: undefined,
    };
    updateCloudSyncConfig(nextCfg);
    setPairCodeInput('');

    setCloudBusy('PULL');
    try {
      const res = await pullCloudSyncGist(nextCfg);
      if (res.ok) {
        updateCloudSyncConfig({
          lastSyncedAt: res.syncedAt,
          lastSyncDirection: 'PULL',
          lastSyncError: undefined,
        });
        pushToast('Perangkat Terhubung & Tersinkron', res.message, 'success');
      } else {
        updateCloudSyncConfig({ lastSyncError: res.error });
        pushToast('Pairing Tersimpan, Pull Gagal', res.error, 'warning');
      }
    } finally {
      setCloudBusy(null);
    }
  };

  const handleInstallPwa = async () => {
    const res = await promptInstall();
    if (res === 'accepted') {
      pushToast('Aplikasi Terpasang', 'CryptoPulse Terminal berhasil ditambahkan ke layar utama.', 'success');
    }
  };

  const samplePreviewHtml = useMemo(() => {
    if (previewType === 'FUTURES') {
      return formatFuturesSetupTelegram({
        id: 'sample',
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        direction: 'LONG',
        timeframe: '4h',
        entryMode: 'LAYERING',
        entries: [
          { price: 61200, weightPercent: 40 },
          { price: 60850, weightPercent: 35 },
          { price: 60500, weightPercent: 25 },
        ],
        avgEntry: 60902.5,
        stopLoss: 59850,
        takeProfits: [
          { label: 'TP1', price: 62600, allocationPercent: 40 },
          { label: 'TP2', price: 64100, allocationPercent: 35 },
          { label: 'TP3', price: 66200, allocationPercent: 25 },
        ],
        accountEquity: 10000,
        riskPercent: 1,
        leverage: 10,
        riskAmountUsdt: 100,
        positionSizeUsdt: 5786,
        positionQty: 0.095,
        marginRequiredUsdt: 578.6,
        estimatedLiquidation: 55116,
        rrTp1: 1.61,
        rrTp2: 3.04,
        rrTp3: 5.03,
        btcBetaAligned: true,
        confluenceChecks: ['Bullish Order Block + FVG 4H'],
        notes: 'Limit Pullback POI 4H',
        status: 'Waiting',
        source: 'Backtest',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    if (previewType === 'SPOT') {
      return formatSpotSetupTelegram({
        id: 'sample_spot',
        symbol: 'SOLUSDT',
        baseAsset: 'SOL',
        budgetUsdt: 1500,
        qualityScore: 84,
        tier: 'Core',
        layers: [
          { layer: 1, label: 'L1', price: 72, allocationPercent: 20, budgetUsdt: 300, estimatedQty: 4.16 },
          { layer: 2, label: 'L2', price: 67, allocationPercent: 30, budgetUsdt: 450, estimatedQty: 6.71 },
          { layer: 3, label: 'L3', price: 61, allocationPercent: 50, budgetUsdt: 750, estimatedQty: 12.29 },
        ],
        projectedAvgEntry: 64.75,
        tp1: 81,
        tp2: 107,
        tp3: 158,
        roiTp1Percent: 25.1,
        roiTp2Percent: 65.2,
        roiTp3Percent: 144.0,
        sellPercentAtTp2ForBreakEven: 60.5,
        moonbagQty: 9.15,
        moonbagValueAtTp3Usdt: 1445.7,
        notes: 'Akumulasi bertahap di support mingguan',
        status: 'Waiting',
        source: 'Manual',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    if (previewType === 'SCANNER') {
      return formatAutoScannerTelegram({
        id: 'sample_sig',
        symbol: 'TAOUSDT',
        baseAsset: 'TAO',
        mode: 'FUTURES',
        rule: 'HIGH_CONVICTION',
        direction: 'LONG',
        entryPrice: 188.5,
        stopLoss: 181.2,
        takeProfit: 204.5,
        scoreOrGrade: 'Grade A · WR 58%',
        summary: 'Limit Pullback Bullish OB 1H + ADX 28',
        telegramSent: false,
        savedToJournal: true,
        createdAt: Date.now(),
      });
    }
    return formatPriceAlertTelegram(
      {
        id: 'sample_alert',
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        condition: 'ABOVE',
        targetPrice: 65000,
        note: 'Konfirmasi breakout resistance mayor',
        active: true,
        triggered: true,
        createdAt: Date.now(),
      },
      65042.5,
    );
  }, [previewType]);

  const handleExport = () => {
    const filename = downloadBackupJson(includeSecrets);
    pushToast('Backup JSON Diunduh', `File ${filename} berhasil diekspor.`, 'success');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const result = validateBackupJson(text);
      if (!result.ok) {
        pushToast('File Backup Tidak Valid', result.error, 'error');
        return;
      }
      setPendingRestore({
        payload: result.payload,
        summary: result.summary,
        originLabel: `File ${file.name}`,
      });
    };
    reader.readAsText(file);
  };

  const handleConfirmRestore = () => {
    if (!pendingRestore) return;
    restoreBackupPayload(pendingRestore.payload);
    pushToast(
      'Data Berhasil Disinkronkan',
      `Data dipulihkan dari ${pendingRestore.originLabel} (${pendingRestore.summary.holdingsCount} aset spot, ${pendingRestore.summary.futuresSetupsCount + pendingRestore.summary.spotSetupsCount} setup jurnal).`,
      'success',
    );
    setPendingRestore(null);
    setSyncInputText('');
  };

  return (
    <>
      <Modal
        open={open}
        onClose={closeModal}
        title="Settings, Mobile Sync & Backup"
        subtitle="Integrasi Telegram Bot, Sinkronisasi Web ↔ Mobile, PWA Install, dan Backup JSON"
        maxWidthClass="max-w-2xl"
      >
        <div className="space-y-4">
          {/* 3-Tab Switch */}
          <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-1">
            <button
              id="tab-settings-telegram"
              type="button"
              onClick={() => setActiveTab('TELEGRAM')}
              className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition ${
                activeTab === 'TELEGRAM' ? 'bg-[#F0B90B] text-[#0B0E11]' : 'text-[#848E9C]'
              }`}
            >
              <Send className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Telegram</span>
            </button>
            <button
              id="tab-settings-sync"
              type="button"
              onClick={() => setActiveTab('SYNC')}
              className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition ${
                activeTab === 'SYNC' ? 'bg-[#F0B90B] text-[#0B0E11]' : 'text-[#848E9C]'
              }`}
            >
              <Smartphone className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Mobile &amp; Sync</span>
            </button>
            <button
              id="tab-settings-backup"
              type="button"
              onClick={() => setActiveTab('BACKUP')}
              className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition ${
                activeTab === 'BACKUP' ? 'bg-[#F0B90B] text-[#0B0E11]' : 'text-[#848E9C]'
              }`}
            >
              <Database className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Backup JSON</span>
            </button>
          </div>

          {activeTab === 'TELEGRAM' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-[#848E9C]">Telegram Bot Token</label>
                  <div className="relative">
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={telegramConfig.botToken}
                      onChange={(e) => updateTelegramConfig({ botToken: e.target.value })}
                      placeholder="123456789:AAH..."
                      className="font-mono min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] pl-3 pr-11 text-xs text-[#EAECEF]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken((v) => !v)}
                      aria-label={showToken ? 'Sembunyikan token' : 'Tampilkan token'}
                      className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#848E9C] hover:text-[#EAECEF]"
                    >
                      {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-[#848E9C]">
                    Chat ID Tujuan (Angka Akun / Channel)
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={telegramConfig.chatId}
                      onChange={(e) => updateTelegramConfig({ chatId: e.target.value })}
                      placeholder="987654321 atau -100..."
                      className="font-mono min-h-[42px] min-w-0 flex-1 rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-xs text-[#EAECEF]"
                    />
                    <button
                      type="button"
                      disabled={detecting}
                      onClick={() => void handleDetectChatId()}
                      title="Kirim /start ke bot Anda di Telegram lalu klik Deteksi"
                      className="inline-flex min-h-[42px] shrink-0 items-center gap-1 rounded-xl border border-[#F0B90B]/50 bg-[#F0B90B]/15 px-3 text-xs font-semibold text-[#F0B90B] transition hover:bg-[#F0B90B] hover:text-[#0B0E11] disabled:opacity-60"
                    >
                      <Search className="h-3.5 w-3.5" />
                      <span>{detecting ? '...' : 'Deteksi'}</span>
                    </button>
                  </div>
                  {/^@.+bot$/i.test(telegramConfig.chatId.trim()) ? (
                    <p className="mt-1 text-[11px] text-[#F6465D]">
                      Jangan isi username bot. Kirim /start ke bot Anda di Telegram lalu klik{' '}
                      <strong>Deteksi</strong>.
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-[#5E6673]">
                      Kirim <code>/start</code> ke bot Anda di Telegram, lalu klik <strong>Deteksi</strong>.
                    </p>
                  )}
                </div>
              </div>

              {/* Auto-Send Toggles */}
              <div className="space-y-2 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3.5">
                <label className="flex min-h-[34px] cursor-pointer items-center justify-between gap-2 border-b border-[#2B3139] pb-2 text-xs font-semibold text-[#EAECEF]">
                  <span>Aktifkan Pengiriman Otomatis Telegram (Master Switch)</span>
                  <input
                    type="checkbox"
                    checked={telegramConfig.enabled}
                    onChange={(e) => updateTelegramConfig({ enabled: e.target.checked })}
                    className="h-4 w-4 accent-[#00C087]"
                  />
                </label>

                <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                  {[
                    { key: 'autoSendFutures' as const, label: 'Auto-send Setup Futures' },
                    { key: 'autoSendSpot' as const, label: 'Auto-send Setup Spot DCA' },
                    { key: 'autoSendScanner' as const, label: 'Auto-send Auto-Scanner Bot' },
                    { key: 'autoSendAlerts' as const, label: 'Auto-send Price Alerts' },
                  ].map((item) => (
                    <label
                      key={item.key}
                      className="flex min-h-[32px] cursor-pointer items-center gap-2 text-xs text-[#848E9C]"
                    >
                      <input
                        type="checkbox"
                        checked={telegramConfig[item.key]}
                        onChange={(e) => updateTelegramConfig({ [item.key]: e.target.checked })}
                        className="h-4 w-4 accent-[#F0B90B]"
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-[#848E9C]">
                  {telegramConfig.lastTestedAt ? (
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2
                        className={`h-3.5 w-3.5 ${
                          telegramConfig.lastTestSuccess ? 'text-[#00C087]' : 'text-[#F6465D]'
                        }`}
                      />
                      Test terakhir: {formatDateTime(telegramConfig.lastTestedAt)}
                    </span>
                  ) : (
                    'Disimpan lokal di browser (localStorage).'
                  )}
                </span>

                <button
                  type="button"
                  disabled={testing}
                  onClick={() => void handleTestTelegram()}
                  className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-[#F0B90B] px-4 text-xs font-bold text-[#0B0E11] hover:bg-[#F0B90B]/90 disabled:opacity-60"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{testing ? 'Menguji...' : 'Test Koneksi'}</span>
                </button>
              </div>

              {/* 4 Separate HTML Formatters Preview */}
              <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3.5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#EAECEF]">
                    Pratinjau Formatter HTML Telegram
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        { id: 'FUTURES', label: 'Futures' },
                        { id: 'SPOT', label: 'Spot DCA' },
                        { id: 'SCANNER', label: 'Scanner' },
                        { id: 'ALERT', label: 'Alert' },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setPreviewType(t.id)}
                        className={`min-h-[32px] rounded-lg px-2.5 text-[11px] font-semibold ${
                          previewType === t.id
                            ? 'bg-[#F0B90B] text-[#0B0E11]'
                            : 'bg-[#161A1E] text-[#848E9C]'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <pre className="cp-scrollbar max-h-44 overflow-auto whitespace-pre-wrap rounded-lg border border-[#2B3139] bg-[#161A1E] p-3 font-mono text-[11px] leading-relaxed text-[#EAECEF]">
                  {samplePreviewHtml}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'SYNC' && (
            <div className="space-y-4">
              {/* 1. Mobile App / PWA Installation Card */}
              <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-[#F0B90B]" />
                    <h3 className="text-xs font-bold text-[#EAECEF]">
                      Aplikasi Mobile (PWA &amp; Android Ready)
                    </h3>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                      isInstalled
                        ? 'bg-[#00C087]/15 text-[#00C087]'
                        : 'bg-[#F0B90B]/15 text-[#F0B90B]'
                    }`}
                  >
                    {isInstalled ? 'TERPASANG (APP MODE)' : 'SIAP INSTALL'}
                  </span>
                </div>

                <p className="mt-1.5 text-[11px] leading-relaxed text-[#848E9C]">
                  {isInstalled
                    ? 'Anda sedang menjalankan CryptoPulse Terminal dalam mode Aplikasi Standalone layar penuh.'
                    : isIos
                      ? 'Di iPhone/iPad (Safari): tekan tombol Share (kotak panah atas) lalu pilih "Add to Home Screen" untuk memasang CryptoPulse sebagai aplikasi mobile.'
                      : 'Pasang CryptoPulse langsung ke Home Screen HP Android (Chrome: menu ⋮ -> "Install App") untuk tampilan fullscreen native, atau build APK via Capacitor (`npm run build:android`).'}
                </p>

                {canPromptInstall && (
                  <button
                    id="btn-install-pwa"
                    type="button"
                    onClick={() => void handleInstallPwa()}
                    className="mt-2.5 inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[#00C087] px-3.5 text-xs font-bold text-[#0B0E11] hover:bg-[#00C087]/90"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Install CryptoPulse App Sekarang
                  </button>
                )}
              </div>

              {/* 2. Instant Transfer Link / Sync Code (Zero Account Needed) */}
              <div className="space-y-2.5 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-[#F0B90B]" />
                    <h3 className="text-xs font-bold text-[#EAECEF]">
                      Sync Instan Web ↔ Mobile (Tanpa Akun)
                    </h3>
                  </div>
                  <span className="text-[10px] text-[#00C087]">1-Klik via Link / Kode</span>
                </div>

                <p className="text-[11px] text-[#848E9C]">
                  Salin Link Sync di Web lalu kirim ke HP (WhatsApp/Telegram Saved Messages). Saat link dibuka di HP, seluruh Portofolio, Watchlist, Jurnal Setup, Alerts, dan setting Telegram langsung sinkron.
                </p>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    id="btn-copy-sync-url"
                    type="button"
                    disabled={generatingSync}
                    onClick={() => void handleCopySyncLink('URL')}
                    className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-[#F0B90B] px-3 text-xs font-bold text-[#0B0E11] hover:bg-[#F0B90B]/90 disabled:opacity-60"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Salin Link Sync Mobile
                  </button>
                  <button
                    id="btn-copy-sync-code"
                    type="button"
                    disabled={generatingSync}
                    onClick={() => void handleCopySyncLink('CODE')}
                    className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-[#2B3139] bg-[#1E2329] px-3 text-xs font-semibold text-[#EAECEF] hover:border-[#F0B90B]/60 disabled:opacity-60"
                  >
                    <Copy className="h-3.5 w-3.5 text-[#F0B90B]" />
                    Salin Kode Sync (CP1Z)
                  </button>
                </div>

                {generatedSyncOutput && (
                  <div className="rounded-xl border border-[#00C087]/40 bg-[#161A1E] p-2.5">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#00C087]">
                        {generatedSyncOutput.label}
                      </span>
                      <span className="font-mono text-[10px] text-[#848E9C]">
                        {generatedSyncOutput.value.length} karakter
                      </span>
                    </div>
                    <input
                      id="generated-sync-output"
                      type="text"
                      readOnly
                      value={generatedSyncOutput.value}
                      onFocus={(e) => e.currentTarget.select()}
                      className="font-mono w-full rounded-lg border border-[#2B3139] bg-[#0B0E11] px-2.5 py-1.5 text-[11px] text-[#EAECEF]"
                    />
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                  <input
                    id="input-sync-code"
                    type="text"
                    value={syncInputText}
                    onChange={(e) => setSyncInputText(e.target.value)}
                    placeholder="Tempel Kode Sync (CP1Z:...) atau Link #cp-sync= dari perangkat lain..."
                    className="font-mono min-h-[40px] min-w-0 flex-1 rounded-xl border border-[#2B3139] bg-[#161A1E] px-3 text-xs text-[#EAECEF] placeholder-[#5E6673]"
                  />
                  <button
                    id="btn-apply-sync-code"
                    type="button"
                    disabled={!syncInputText.trim()}
                    onClick={() => void handleApplySyncInput()}
                    className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#00C087]/15 px-3.5 text-xs font-bold text-[#00C087] transition hover:bg-[#00C087] hover:text-[#0B0E11] disabled:opacity-40"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Terapkan Sync
                  </button>
                </div>
              </div>

              {/* 3. Real-Time Cloud Auto-Sync (Private GitHub Gist) */}
              <div className="space-y-3 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-[#00C087]" />
                    <h3 className="text-xs font-bold text-[#EAECEF]">
                      Cloud Auto-Sync Real-Time (Private GitHub Gist)
                    </h3>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                      cloudSyncConfig.githubToken.trim() &&
                      cloudSyncConfig.gistId.trim() &&
                      cloudSyncConfig.autoSync
                        ? 'bg-[#00C087]/15 text-[#00C087]'
                        : 'bg-[#1E2329] text-[#848E9C]'
                    }`}
                  >
                    {cloudSyncConfig.githubToken.trim() &&
                    cloudSyncConfig.gistId.trim() &&
                    cloudSyncConfig.autoSync
                      ? 'AUTO-SYNC AKTIF'
                      : 'BELUM TERHUBUNG'}
                  </span>
                </div>

                <p className="text-[11px] leading-relaxed text-[#848E9C]">
                  Simpan data di Private Secret Gist milik akun GitHub Anda sendiri (gratis &amp; privat). Perubahan otomatis di-push dalam ~1.2 detik (dengan Smart Merge anti-timpa) dan otomatis ditarik saat perangkat lain dibuka atau tiap 20 detik.
                </p>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] text-[#848E9C]">
                      GitHub Token (scope: gist)
                    </label>
                    <div className="relative">
                      <input
                        type={showGithubToken ? 'text' : 'password'}
                        value={cloudSyncConfig.githubToken}
                        onChange={(e) => {
                          const nextToken = e.target.value;
                          updateCloudSyncConfig({
                            githubToken: nextToken,
                            enabled: Boolean(nextToken.trim() && cloudSyncConfig.gistId.trim()),
                          });
                        }}
                        placeholder="ghp_..."
                        className="font-mono min-h-[40px] w-full rounded-xl border border-[#2B3139] bg-[#161A1E] pl-3 pr-10 text-xs text-[#EAECEF]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGithubToken((v) => !v)}
                        aria-label="Toggle GitHub Token"
                        className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-[#848E9C] hover:text-[#EAECEF]"
                      >
                        {showGithubToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] text-[#848E9C]">
                      Private Gist ID (otomatis terdeteksi dari Token)
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={cloudSyncConfig.gistId}
                        onChange={(e) => {
                          const nextId = e.target.value;
                          updateCloudSyncConfig({
                            gistId: nextId,
                            enabled: Boolean(cloudSyncConfig.githubToken.trim() && nextId.trim()),
                          });
                        }}
                        placeholder="Kosongkan / klik Deteksi"
                        className="font-mono min-h-[40px] min-w-0 flex-1 rounded-xl border border-[#2B3139] bg-[#161A1E] px-3 text-xs text-[#EAECEF]"
                      />
                      <button
                        id="btn-detect-gist"
                        type="button"
                        disabled={cloudBusy !== null || !cloudSyncConfig.githubToken.trim()}
                        onClick={() => void handleDetectGist()}
                        title="Cari Gist CryptoPulse milik token ini secara otomatis & tarik datanya"
                        className="inline-flex min-h-[40px] shrink-0 items-center gap-1 rounded-xl border border-[#F0B90B]/50 bg-[#F0B90B]/15 px-2.5 text-xs font-semibold text-[#F0B90B] transition hover:bg-[#F0B90B] hover:text-[#0B0E11] disabled:opacity-50"
                      >
                        <Search className="h-3.5 w-3.5" />
                        <span>Deteksi</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="flex min-h-[34px] cursor-pointer items-center gap-2 text-xs text-[#EAECEF]">
                    <input
                      type="checkbox"
                      checked={cloudSyncConfig.autoSync}
                      onChange={(e) => updateCloudSyncConfig({ autoSync: e.target.checked })}
                      className="h-4 w-4 accent-[#00C087]"
                    />
                    <span>Auto-Push &amp; Auto-Pull otomatis</span>
                  </label>
                  <label className="flex min-h-[34px] cursor-pointer items-center gap-2 text-xs text-[#EAECEF]">
                    <input
                      type="checkbox"
                      checked={cloudSyncConfig.includeSecrets}
                      onChange={(e) => updateCloudSyncConfig({ includeSecrets: e.target.checked })}
                      className="h-4 w-4 accent-[#F0B90B]"
                    />
                    <span>Ikut sinkronkan Bot Telegram</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    id="btn-cloud-push"
                    type="button"
                    disabled={cloudBusy !== null || !cloudSyncConfig.githubToken.trim()}
                    onClick={() => void handleCloudPush()}
                    className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl bg-[#00C087] px-3 text-xs font-bold text-[#0B0E11] hover:bg-[#00C087]/90 disabled:opacity-50"
                  >
                    <CloudUpload className="h-4 w-4" />
                    <span>{cloudBusy === 'PUSH' ? 'Mengunggah...' : 'Push ke Cloud'}</span>
                  </button>
                  <button
                    id="btn-cloud-pull"
                    type="button"
                    disabled={cloudBusy !== null || !cloudSyncConfig.githubToken.trim()}
                    onClick={() => void handleCloudPull()}
                    className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-[#2B3139] bg-[#1E2329] px-3 text-xs font-semibold text-[#EAECEF] hover:border-[#F0B90B]/60 disabled:opacity-50"
                  >
                    <CloudDownload className="h-4 w-4 text-[#F0B90B]" />
                    <span>{cloudBusy === 'PULL' ? 'Menarik...' : 'Pull dari Cloud'}</span>
                  </button>
                </div>

                {cloudSyncConfig.lastSyncedAt && (
                  <p className="font-mono text-[11px] text-[#00C087]">
                    ✓ Terakhir sinkron ({cloudSyncConfig.lastSyncDirection ?? 'SYNC'}):{' '}
                    {formatDateTime(cloudSyncConfig.lastSyncedAt)}
                  </p>
                )}
                {cloudSyncConfig.lastSyncError && (
                  <p className="text-[11px] text-[#F6465D]">{cloudSyncConfig.lastSyncError}</p>
                )}

                {/* 1-Tap Pairing between Web & Mobile */}
                <div className="border-t border-[#2B3139] pt-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-[#EAECEF]">
                      Pairing Cepat Desktop → Mobile
                    </span>
                    {cloudSyncConfig.githubToken && cloudSyncConfig.gistId && (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleCopyCloudPair('URL')}
                          className="min-h-[32px] rounded-lg bg-[#F0B90B]/15 px-2.5 text-[11px] font-semibold text-[#F0B90B] hover:bg-[#F0B90B] hover:text-[#0B0E11]"
                        >
                          Salin Link Pairing HP
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCopyCloudPair('CODE')}
                          className="min-h-[32px] rounded-lg border border-[#2B3139] bg-[#161A1E] px-2.5 text-[11px] font-medium text-[#EAECEF]"
                        >
                          Salin Kode
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={pairCodeInput}
                      onChange={(e) => setPairCodeInput(e.target.value)}
                      placeholder="Di HP: tempel Kode Pairing (CPPAIR:...) untuk langsung konek & pull..."
                      className="font-mono min-h-[38px] min-w-0 flex-1 rounded-xl border border-[#2B3139] bg-[#161A1E] px-3 text-xs text-[#EAECEF] placeholder-[#5E6673]"
                    />
                    <button
                      type="button"
                      disabled={!pairCodeInput.trim() || cloudBusy !== null}
                      onClick={() => void handleApplyPairCode()}
                      className="min-h-[38px] shrink-0 rounded-xl border border-[#00C087]/50 bg-[#00C087]/15 px-3 text-xs font-semibold text-[#00C087] hover:bg-[#00C087] hover:text-[#0B0E11] disabled:opacity-40"
                    >
                      Hubungkan
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'BACKUP' && (
            <div className="space-y-4">
              {/* Current LocalStorage Snapshot Stats */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {[
                  { label: 'Aset Spot', val: `${holdings.length} coin` },
                  { label: 'Saldo Kas USDT', val: formatUsd(usdtBalance) },
                  { label: 'Jurnal Setup', val: `${futuresSetups.length + spotSetups.length} setup` },
                  { label: 'Watchlist', val: `${watchlist.length} coin` },
                  { label: 'Price Alerts', val: `${priceAlerts.length} alert` },
                  { label: 'Riwayat Aktivitas', val: `${activityLogs.length} log` },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3"
                  >
                    <span className="text-[11px] text-[#848E9C]">{s.label}</span>
                    <p className="font-mono tabular-nums mt-1 text-sm font-bold text-[#EAECEF]">
                      {s.val}
                    </p>
                  </div>
                ))}
              </div>

              <label className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3.5 py-2 text-xs text-[#EAECEF]">
                <input
                  type="checkbox"
                  checked={includeSecrets}
                  onChange={(e) => setIncludeSecrets(e.target.checked)}
                  className="h-4 w-4 accent-[#F0B90B]"
                />
                <span>Sertakan Bot Token &amp; Chat ID Telegram dalam file backup</span>
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  id="btn-export-json"
                  type="button"
                  onClick={handleExport}
                  className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-[#F0B90B] px-4 text-xs font-bold text-[#0B0E11] hover:bg-[#F0B90B]/90"
                >
                  <Download className="h-4 w-4" />
                  Export Backup (.json)
                </button>

                <button
                  id="btn-import-json"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-[#2B3139] bg-[#1E2329] px-4 text-xs font-semibold text-[#EAECEF] hover:border-[#F0B90B]/60"
                >
                  <Upload className="h-4 w-4 text-[#00C087]" />
                  Import Restore (.json)
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              <p className="text-[11px] leading-relaxed text-[#848E9C]">
                Seluruh data (Portofolio Spot, Kas USDT, Jurnal Futures/Spot, Watchlist, Price Alerts, dan Riwayat Aktivitas) tersimpan aman di perangkat Anda dan dapat dipindahkan antar browser desktop maupun Android APK via file JSON ini atau tab <strong>Mobile &amp; Sync</strong>.
              </p>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(pendingRestore)}
        title="Konfirmasi Sinkronisasi / Restore Data?"
        description={
          pendingRestore
            ? `Sumber: ${pendingRestore.originLabel} (${formatDateTime(pendingRestore.summary.exportedAt)}). Berisi ${pendingRestore.summary.holdingsCount} aset spot, Kas ${formatUsd(pendingRestore.summary.usdtBalance)}, ${pendingRestore.summary.futuresSetupsCount + pendingRestore.summary.spotSetupsCount} setup jurnal, dan ${pendingRestore.summary.alertsCount} alerts. Data lokal saat ini akan ditimpa.`
            : ''
        }
        confirmLabel="Terapkan & Sinkronkan"
        onConfirm={handleConfirmRestore}
        onCancel={() => setPendingRestore(null)}
      />
    </>
  );
}
