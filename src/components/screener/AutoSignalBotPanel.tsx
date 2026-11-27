import { Bot, Check, Play, Power, Send, Trash2 } from 'lucide-react';
import type { AutoSignalMode, AutoSignalRule } from '../../types';
import { useAutoScanner } from '../../hooks/useAutoScanner';
import { useTradingStore } from '../../store/useTradingStore';
import { formatPrice, formatShortTime } from '../../utils/format';

const COOLDOWN_OPTIONS = [
  { label: '30 Detik', value: 30 },
  { label: '2 Menit', value: 120 },
  { label: '5 Menit', value: 300 },
  { label: '15 Menit', value: 900 },
  { label: '1 Jam', value: 3600 },
  { label: '4 Jam', value: 14400 },
];

const RULE_OPTIONS: Array<{ value: AutoSignalRule; label: string }> = [
  { value: 'MOMENTUM_BREAKOUT', label: 'Momentum Breakout' },
  { value: 'RSI_OVERSOLD_BOUNCE', label: 'RSI Oversold Bounce' },
  { value: 'HIGH_CONVICTION', label: 'High-Conviction' },
];

export function AutoSignalBotPanel() {
  const {
    scannerConfig,
    scannerLogs,
    isScanning,
    lastScanAt,
    updateScannerConfig,
    scanNow,
    resendSignalToTelegram,
  } = useAutoScanner();
  const clearScannerLogs = useTradingStore((s) => s.clearScannerLogs);

  return (
    <section aria-label="Auto-Signal Scanner Bot" className="cp-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2B3139] pb-3.5">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
              scannerConfig.enabled
                ? 'border-[#00C087]/50 bg-[#00C087]/15 text-[#00C087]'
                : 'border-[#2B3139] bg-[#0B0E11] text-[#F0B90B]'
            }`}
          >
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[#EAECEF]">Auto-Signal Scanner Bot</h2>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                  scannerConfig.enabled
                    ? 'bg-[#00C087]/15 text-[#00C087]'
                    : 'bg-[#1E2329] text-[#848E9C]'
                }`}
              >
                {scannerConfig.enabled ? 'AKTIF' : 'STANDBY'}
              </span>
            </div>
            <p className="text-xs text-[#848E9C]">
              Scan periodik otomatis dengan validasi Backtest + ATR / Spot Quality Score.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => updateScannerConfig({ enabled: !scannerConfig.enabled })}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-3.5 text-xs font-semibold transition ${
              scannerConfig.enabled
                ? 'bg-[#00C087] text-[#0B0E11] hover:bg-[#00C087]/90'
                : 'border border-[#2B3139] bg-[#1E2329] text-[#EAECEF] hover:border-[#F0B90B]/60'
            }`}
          >
            <Power className="h-3.5 w-3.5" />
            <span>{scannerConfig.enabled ? 'Matikan Auto-Scan' : 'Aktifkan Auto-Scan'}</span>
          </button>

          <button
            id="btn-scan-now"
            type="button"
            disabled={isScanning}
            onClick={() => void scanNow(true)}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[#F0B90B] px-3.5 text-xs font-semibold text-[#0B0E11] transition hover:bg-[#F0B90B]/90 disabled:opacity-60"
          >
            <Play className={`h-3.5 w-3.5 ${isScanning ? 'animate-pulse' : ''}`} />
            <span>{isScanning ? 'Memindai...' : 'Scan Sekarang'}</span>
          </button>
        </div>
      </div>

      {/* Bot Controls Grid */}
      <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Mode Futures vs Spot DCA */}
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#848E9C]">
            Mode Sinyal
          </label>
          <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-1">
            {(['FUTURES', 'SPOT_DCA'] as AutoSignalMode[]).map((m) => {
              const active = scannerConfig.mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => updateScannerConfig({ mode: m })}
                  className={`min-h-[36px] rounded-lg px-2 text-xs font-semibold transition ${
                    active ? 'bg-[#F0B90B] text-[#0B0E11]' : 'text-[#848E9C] hover:text-[#EAECEF]'
                  }`}
                >
                  {m === 'FUTURES' ? 'Futures' : 'Spot DCA'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Trigger Rule */}
        <div>
          <label
            htmlFor="scanner-rule"
            className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#848E9C]"
          >
            Aturan Pemicu
          </label>
          <select
            id="scanner-rule"
            value={scannerConfig.rule}
            onChange={(e) => updateScannerConfig({ rule: e.target.value as AutoSignalRule })}
            className="min-h-[44px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-xs font-medium text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
          >
            {RULE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Anti-Spam Cooldown */}
        <div>
          <label
            htmlFor="scanner-cooldown"
            className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#848E9C]"
          >
            Anti-Spam Cooldown / Coin
          </label>
          <select
            id="scanner-cooldown"
            value={scannerConfig.cooldownSeconds}
            onChange={(e) => updateScannerConfig({ cooldownSeconds: Number(e.target.value) })}
            className="font-mono tabular-nums min-h-[44px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-xs font-medium text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
          >
            {COOLDOWN_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Auto-actions Checkboxes */}
        <div className="flex flex-col justify-center gap-2 rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 py-2">
          <label className="flex min-h-[28px] cursor-pointer items-center gap-2 text-xs text-[#EAECEF]">
            <input
              type="checkbox"
              checked={scannerConfig.autoSendTelegram}
              onChange={(e) => updateScannerConfig({ autoSendTelegram: e.target.checked })}
              className="h-4 w-4 rounded accent-[#F0B90B]"
            />
            <span>Auto-kirim Telegram</span>
          </label>
          <label className="flex min-h-[28px] cursor-pointer items-center gap-2 text-xs text-[#EAECEF]">
            <input
              type="checkbox"
              checked={scannerConfig.autoSaveJournal}
              onChange={(e) => updateScannerConfig({ autoSaveJournal: e.target.checked })}
              className="h-4 w-4 rounded accent-[#F0B90B]"
            />
            <span>Auto-simpan Jurnal</span>
          </label>
        </div>
      </div>

      {/* Auto-Signal Log List */}
      <div className="mt-4 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#EAECEF]">Log Sinyal Otomatis</span>
            <span className="font-mono tabular-nums rounded bg-[#1E2329] px-1.5 py-0.5 text-[11px] text-[#848E9C]">
              {scannerLogs.length}
            </span>
            {lastScanAt && (
              <span className="font-mono tabular-nums text-[11px] text-[#5E6673]">
                Terakhir: {formatShortTime(lastScanAt)}
              </span>
            )}
          </div>
          {scannerLogs.length > 0 && (
            <button
              type="button"
              onClick={clearScannerLogs}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2 text-[11px] text-[#848E9C] hover:bg-[#1E2329] hover:text-[#F6465D]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Bersihkan
            </button>
          )}
        </div>

        {scannerLogs.length === 0 ? (
          <p className="py-3 text-center text-xs text-[#5E6673]">
            Belum ada sinyal tercatat. Klik &ldquo;Scan Sekarang&rdquo; atau aktifkan Auto-Scan.
          </p>
        ) : (
          <div className="cp-scrollbar max-h-56 space-y-2 overflow-y-auto pr-1">
            {scannerLogs.slice(0, 12).map((log) => (
              <div
                key={log.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2B3139] bg-[#161A1E] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-bold text-[#EAECEF]">{log.baseAsset}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        log.direction === 'SHORT'
                          ? 'bg-[#F6465D]/15 text-[#F6465D]'
                          : log.direction === 'ACCUMULATE'
                            ? 'bg-[#F0B90B]/15 text-[#F0B90B]'
                            : 'bg-[#00C087]/15 text-[#00C087]'
                      }`}
                    >
                      {log.direction}
                    </span>
                    <span className="font-mono tabular-nums rounded bg-[#0B0E11] px-1.5 py-0.5 text-[10px] text-[#F0B90B]">
                      {log.scoreOrGrade}
                    </span>
                    <span className="font-mono tabular-nums text-[11px] text-[#EAECEF]">
                      @ {formatPrice(log.entryPrice)}
                    </span>
                    {log.savedToJournal && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-[#00C087]">
                        <Check className="h-3 w-3" /> Jurnal
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-[#848E9C]">{log.summary}</p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono tabular-nums text-[10px] text-[#5E6673]">
                    {formatShortTime(log.createdAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void resendSignalToTelegram(log)}
                    className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-[#2B3139] bg-[#1E2329] px-2.5 text-[11px] font-medium text-[#EAECEF] transition hover:border-[#F0B90B]/60 hover:text-[#F0B90B]"
                  >
                    <Send className="h-3 w-3" />
                    <span>{log.telegramSent ? 'Kirim Ulang' : 'Telegram'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
