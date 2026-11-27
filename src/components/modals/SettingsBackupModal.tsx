import { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  Eye,
  EyeOff,
  Send,
  Upload,
} from 'lucide-react';
import { testTelegramConnection } from '../../services/adapters/telegramAdapter';
import {
  downloadBackupJson,
  restoreBackupPayload,
  validateBackupJson,
  type BackupSummary,
  type CryptoPulseBackupPayload,
} from '../../services/backupService';
import { useAppStore } from '../../store/useAppStore';
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
  const closeModal = useAppStore((s) => s.closeSettingsModal);
  const pushToast = useAppStore((s) => s.pushToast);

  const telegramConfig = useSettingsStore((s) => s.telegramConfig);
  const updateTelegramConfig = useSettingsStore((s) => s.updateTelegramConfig);
  const priceAlerts = useSettingsStore((s) => s.priceAlerts);

  const watchlist = useTradingStore((s) => s.watchlist);
  const futuresSetups = useTradingStore((s) => s.futuresSetups);
  const spotSetups = useTradingStore((s) => s.spotSetups);

  const holdings = usePortfolioStore((s) => s.holdings);
  const usdtBalance = usePortfolioStore((s) => s.usdtBalance);
  const activityLogs = usePortfolioStore((s) => s.activityLogs);

  const [activeTab, setActiveTab] = useState<'TELEGRAM' | 'BACKUP'>('TELEGRAM');
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [previewType, setPreviewType] = useState<FormatterTab>('FUTURES');
  const [includeSecrets, setIncludeSecrets] = useState(true);

  const [pendingRestore, setPendingRestore] = useState<{
    payload: CryptoPulseBackupPayload;
    summary: BackupSummary;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const samplePreviewHtml = useMemo(() => {
    if (previewType === 'FUTURES') {
      return formatFuturesSetupTelegram({
        id: 'sample',
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        direction: 'LONG',
        timeframe: '4h',
        entryMode: 'SINGLE',
        entries: [{ price: 61800, weightPercent: 100 }],
        avgEntry: 61800,
        stopLoss: 60400,
        takeProfits: [
          { label: 'TP1', price: 63900, allocationPercent: 40 },
          { label: 'TP2', price: 65300, allocationPercent: 35 },
          { label: 'TP3', price: 67400, allocationPercent: 25 },
        ],
        accountEquity: 10000,
        riskPercent: 1,
        leverage: 10,
        riskAmountUsdt: 100,
        positionSizeUsdt: 4414,
        positionQty: 0.0714,
        marginRequiredUsdt: 441.4,
        estimatedLiquidation: 55929,
        rrTp1: 1.5,
        rrTp2: 2.5,
        rrTp3: 4.0,
        btcBetaAligned: true,
        confluenceChecks: ['EMA 20/50 Support'],
        notes: 'Setup Backtest Grade A+',
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
        rule: 'MOMENTUM_BREAKOUT',
        direction: 'LONG',
        entryPrice: 188.5,
        stopLoss: 181.2,
        takeProfit: 204.5,
        scoreOrGrade: 'Grade A · WR 58%',
        summary: 'Volume spike 245% + Breakout struktur 1H',
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
      setPendingRestore({ payload: result.payload, summary: result.summary });
    };
    reader.readAsText(file);
  };

  const handleConfirmRestore = () => {
    if (!pendingRestore) return;
    restoreBackupPayload(pendingRestore.payload);
    pushToast(
      'Restore Backup Berhasil',
      `Data dipulihkan (${pendingRestore.summary.holdingsCount} aset spot, ${pendingRestore.summary.futuresSetupsCount} setup futures).`,
      'success',
    );
    setPendingRestore(null);
  };

  return (
    <>
      <Modal
        open={open}
        onClose={closeModal}
        title="Settings & Backup Data"
        subtitle="Integrasi Telegram Bot API & Export/Import seluruh data localStorage"
        maxWidthClass="max-w-2xl"
      >
        <div className="space-y-4">
          {/* Modal Section Switch */}
          <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-1">
            <button
              id="tab-settings-telegram"
              type="button"
              onClick={() => setActiveTab('TELEGRAM')}
              className={`inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg text-xs font-semibold transition ${
                activeTab === 'TELEGRAM' ? 'bg-[#F0B90B] text-[#0B0E11]' : 'text-[#848E9C]'
              }`}
            >
              <Send className="h-3.5 w-3.5" />
              Telegram Bot
            </button>
            <button
              id="tab-settings-backup"
              type="button"
              onClick={() => setActiveTab('BACKUP')}
              className={`inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg text-xs font-semibold transition ${
                activeTab === 'BACKUP' ? 'bg-[#F0B90B] text-[#0B0E11]' : 'text-[#848E9C]'
              }`}
            >
              <Database className="h-3.5 w-3.5" />
              Backup &amp; Restore JSON
            </button>
          </div>

          {activeTab === 'TELEGRAM' ? (
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
                  <label className="mb-1 block text-xs text-[#848E9C]">Chat ID / Channel ID</label>
                  <input
                    type="text"
                    value={telegramConfig.chatId}
                    onChange={(e) => updateTelegramConfig({ chatId: e.target.value })}
                    placeholder="-1001234567890 atau 987654321"
                    className="font-mono min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-xs text-[#EAECEF]"
                  />
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
          ) : (
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
                Seluruh data (Portofolio Spot, Kas USDT, Jurnal Futures/Spot, Watchlist, Price Alerts, dan Riwayat Aktivitas) tersimpan aman di perangkat Anda dan dapat dipindahkan antar browser desktop maupun Android APK via file JSON ini.
              </p>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(pendingRestore)}
        title="Konfirmasi Restore Data Backup?"
        description={
          pendingRestore
            ? `File backup (${formatDateTime(pendingRestore.summary.exportedAt)}) berisi ${pendingRestore.summary.holdingsCount} aset spot, Kas ${formatUsd(pendingRestore.summary.usdtBalance)}, ${pendingRestore.summary.futuresSetupsCount + pendingRestore.summary.spotSetupsCount} setup jurnal, dan ${pendingRestore.summary.alertsCount} alerts. Data lokal saat ini akan ditimpa.`
            : ''
        }
        confirmLabel="Timpa & Pulihkan"
        onConfirm={handleConfirmRestore}
        onCancel={() => setPendingRestore(null)}
      />
    </>
  );
}
