import { useState } from 'react';
import {
  Bot,
  CandlestickChart,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Play,
  Power,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import type {
  AutoSignalMode,
  AutoSignalRule,
  BacktestGrade,
  ScannerDirectionFilter,
  ScannerUniverseScope,
} from '../../types';
import { useAutoScanner } from '../../hooks/useAutoScanner';
import { useAppStore } from '../../store/useAppStore';
import { useTradingStore } from '../../store/useTradingStore';
import { formatPrice, formatShortTime } from '../../utils/format';
import { SpotFunnelPanel } from './SpotFunnelPanel';

const COOLDOWN_OPTIONS = [
  { label: '2 Menit', value: 120 },
  { label: '5 Menit', value: 300 },
  { label: '15 Menit', value: 900 },
  { label: '1 Jam', value: 3600 },
  { label: '4 Jam', value: 14400 },
];

const INTERVAL_OPTIONS = [
  { label: 'Tiap 1 Menit', value: 60 },
  { label: 'Tiap 3 Menit', value: 180 },
  { label: 'Tiap 5 Menit', value: 300 },
  { label: 'Tiap 15 Menit', value: 900 },
];

const RULE_OPTIONS: Array<{ value: AutoSignalRule; label: string }> = [
  { value: 'HIGH_CONVICTION', label: 'High-Conviction (HTF + EMA + ADX + MACD)' },
  { value: 'MOMENTUM_BREAKOUT', label: 'Momentum Breakout + Vol Spike Real' },
  { value: 'EMA_PULLBACK', label: 'EMA 20/50 Pullback Confirmation' },
  { value: 'RSI_OVERSOLD_BOUNCE', label: 'RSI Reversal + Divergence (Long/Short)' },
];

const MIN_VOLUME_OPTIONS = [
  { label: 'Min Vol $2M', value: 2_000_000 },
  { label: 'Min Vol $5M', value: 5_000_000 },
  { label: 'Min Vol $10M', value: 10_000_000 },
  { label: 'Min Vol $25M', value: 25_000_000 },
  { label: 'Min Vol $50M', value: 50_000_000 },
];

const GRADE_OPTIONS: BacktestGrade[] = ['B', 'B+', 'A', 'A+'];

export function AutoSignalBotPanel() {
  const {
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
  } = useAutoScanner();

  const clearScannerLogs = useTradingStore((s) => s.clearScannerLogs);
  const openAnalysis = useAppStore((s) => s.openAnalysis);
  const openSetupForCoin = useAppStore((s) => s.openSetupForCoin);
  const [showAuditList, setShowAuditList] = useState(true);

  const isFutures = scannerConfig.mode === 'FUTURES';

  return (
    <section aria-label="Auto-Signal Scanner Bot" className="cp-card p-4">
      {/* Header */}
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
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-[#EAECEF]">
                Auto-Signal Scanner Pro
              </h2>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                  scannerConfig.enabled
                    ? 'bg-[#00C087]/15 text-[#00C087]'
                    : 'bg-[#1E2329] text-[#848E9C]'
                }`}
              >
                {scannerConfig.enabled ? 'AKTIF DI BACKGROUND' : 'STANDBY'}
              </span>
            </div>
            <p className="text-xs text-[#848E9C]">
              {isFutures
                ? '6-Layer Anti-Loss Futures (Long & Short): Real Kline TF+HTF · EMA/ADX/MACD/VWAP/RSI Div · S/R Clearance · Backtest Gate.'
                : 'Spot Funnel 100 Coin: Outperformance vs BTC → Tokenomic MCap/FDV → Trend 1D/4H Real → Layak Watchlist + 3-Layer DCA.'}
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
            <span>
              {isScanning
                ? 'Memindai...'
                : isFutures
                  ? 'Scan Futures Pro'
                  : 'Scan Funnel 100 Coin'}
            </span>
          </button>
        </div>
      </div>

      {/* Live Scanning Progress Bar */}
      {isScanning && (
        <div className="mt-3 rounded-xl border border-[#F0B90B]/30 bg-[#F0B90B]/5 p-2.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate font-medium text-[#F0B90B]">
              {progressText || 'Memvalidasi data real Binance...'}
            </span>
            <span className="font-mono tabular-nums shrink-0 font-bold text-[#F0B90B]">
              {progressPct}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#0B0E11]">
            <div
              className="h-full rounded-full bg-[#F0B90B] transition-all duration-300"
              style={{ width: `${Math.max(8, progressPct)}%` }}
            />
          </div>
        </div>
      )}

      {/* Mode Switch + Primary Controls */}
      <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Mode Switch */}
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#848E9C]">
            Mode Scanner
          </label>
          <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-1">
            {(['FUTURES', 'SPOT_DCA'] as AutoSignalMode[]).map((m) => {
              const active = scannerConfig.mode === m;
              return (
                <button
                  key={m}
                  id={`btn-scanner-mode-${m.toLowerCase()}`}
                  type="button"
                  onClick={() => updateScannerConfig({ mode: m })}
                  className={`min-h-[36px] rounded-lg px-2 text-xs font-semibold transition ${
                    active ? 'bg-[#F0B90B] text-[#0B0E11]' : 'text-[#848E9C] hover:text-[#EAECEF]'
                  }`}
                >
                  {m === 'FUTURES' ? 'Futures L/S' : 'Spot 100 Funnel'}
                </button>
              );
            })}
          </div>
        </div>

        {isFutures ? (
          <>
            {/* Trigger Rule */}
            <div>
              <label
                htmlFor="scanner-rule"
                className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#848E9C]"
              >
                Metode / Strategi
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

            {/* Direction & Timeframe */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="scanner-direction"
                  className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#848E9C]"
                >
                  Arah
                </label>
                <select
                  id="scanner-direction"
                  value={scannerConfig.directionFilter}
                  onChange={(e) =>
                    updateScannerConfig({
                      directionFilter: e.target.value as ScannerDirectionFilter,
                    })
                  }
                  className="min-h-[44px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-2.5 text-xs font-medium text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
                >
                  <option value="BOTH">Long &amp; Short</option>
                  <option value="LONG_ONLY">Long Saja</option>
                  <option value="SHORT_ONLY">Short Saja</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="scanner-tf"
                  className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#848E9C]"
                >
                  Timeframe
                </label>
                <select
                  id="scanner-tf"
                  value={scannerConfig.timeframe}
                  onChange={(e) =>
                    updateScannerConfig({
                      timeframe: e.target.value as '15m' | '1h' | '4h',
                    })
                  }
                  className="font-mono tabular-nums min-h-[44px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-2.5 text-xs font-medium text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
                >
                  <option value="15m">15m (HTF 1H)</option>
                  <option value="1h">1H (HTF 4H)</option>
                  <option value="4h">4H (HTF 1D)</option>
                </select>
              </div>
            </div>

            {/* Scope & Min Volume */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="scanner-scope"
                  className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#848E9C]"
                >
                  Target Scan
                </label>
                <select
                  id="scanner-scope"
                  value={scannerConfig.universeScope}
                  onChange={(e) =>
                    updateScannerConfig({
                      universeScope: e.target.value as ScannerUniverseScope,
                    })
                  }
                  className="min-h-[44px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-2.5 text-xs font-medium text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
                >
                  <option value="TOP_100">Top 100 Vol</option>
                  <option value="ALL_LIQUID">Semua Likuid</option>
                  <option value="WATCHLIST">Watchlist</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="scanner-minvol"
                  className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#848E9C]"
                >
                  Likuiditas
                </label>
                <select
                  id="scanner-minvol"
                  value={scannerConfig.minVolume24hUsd}
                  onChange={(e) =>
                    updateScannerConfig({ minVolume24hUsd: Number(e.target.value) })
                  }
                  className="font-mono tabular-nums min-h-[44px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-2.5 text-xs font-medium text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
                >
                  {MIN_VOLUME_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Spot Funnel Quality Gates */}
            <div>
              <label
                htmlFor="scanner-float"
                className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#848E9C]"
              >
                Min Float Tokenomic (MCap/FDV)
              </label>
              <select
                id="scanner-float"
                value={scannerConfig.minMcapFdvRatio}
                onChange={(e) =>
                  updateScannerConfig({ minMcapFdvRatio: Number(e.target.value) })
                }
                className="font-mono tabular-nums min-h-[44px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-xs font-medium text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
              >
                <option value={0.45}>≥ 45% Circulating (Agresif)</option>
                <option value={0.55}>≥ 55% Circulating (Standar Pro)</option>
                <option value={0.65}>≥ 65% Circulating (Ketat)</option>
                <option value={0.75}>≥ 75% Circulating (Anti-Dilusi)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="scanner-spot-score"
                className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#848E9C]"
              >
                Min Skor Layak Watchlist
              </label>
              <select
                id="scanner-spot-score"
                value={scannerConfig.minSpotScore}
                onChange={(e) =>
                  updateScannerConfig({ minSpotScore: Number(e.target.value) })
                }
                className="font-mono tabular-nums min-h-[44px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-xs font-medium text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
              >
                <option value={60}>≥ 60 / 100 (Moderat)</option>
                <option value={68}>≥ 68 / 100 (Standar Pro)</option>
                <option value={74}>≥ 74 / 100 (Selektif)</option>
                <option value={80}>≥ 80 / 100 (Core Tier Only)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="scanner-spot-budget"
                className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#848E9C]"
              >
                Budget DCA / Setup (USDT)
              </label>
              <input
                id="scanner-spot-budget"
                type="number"
                min={50}
                step={50}
                value={scannerConfig.defaultSpotBudget}
                onChange={(e) =>
                  updateScannerConfig({
                    defaultSpotBudget: Math.max(50, Number(e.target.value) || 500),
                  })
                }
                className="font-mono tabular-nums min-h-[44px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-xs font-medium text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
              />
            </div>
          </>
        )}
      </div>

      {/* Second Row: Quality Gates + Interval/Cooldown + Auto Checkboxes */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {isFutures ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="scanner-min-grade"
                  className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#848E9C]"
                >
                  Min Grade BT
                </label>
                <select
                  id="scanner-min-grade"
                  value={scannerConfig.minBacktestGrade}
                  onChange={(e) =>
                    updateScannerConfig({
                      minBacktestGrade: e.target.value as BacktestGrade,
                    })
                  }
                  className="font-mono tabular-nums min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-2.5 text-xs font-medium text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
                >
                  {GRADE_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      Grade ≥ {g}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="scanner-min-score"
                  className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#848E9C]"
                >
                  Min Skor
                </label>
                <select
                  id="scanner-min-score"
                  value={scannerConfig.minConfluenceScore}
                  onChange={(e) =>
                    updateScannerConfig({ minConfluenceScore: Number(e.target.value) })
                  }
                  className="font-mono tabular-nums min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-2.5 text-xs font-medium text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
                >
                  <option value={55}>≥ 55/100</option>
                  <option value={65}>≥ 65/100</option>
                  <option value={72}>≥ 72/100</option>
                  <option value={80}>≥ 80/100</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="scanner-pf"
                  className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#848E9C]"
                >
                  Min PF
                </label>
                <select
                  id="scanner-pf"
                  value={scannerConfig.minProfitFactor}
                  onChange={(e) =>
                    updateScannerConfig({ minProfitFactor: Number(e.target.value) })
                  }
                  className="font-mono tabular-nums min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-2.5 text-xs font-medium text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
                >
                  <option value={1.0}>PF ≥ 1.00</option>
                  <option value={1.15}>PF ≥ 1.15</option>
                  <option value={1.3}>PF ≥ 1.30</option>
                  <option value={1.5}>PF ≥ 1.50</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="scanner-lev"
                  className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#848E9C]"
                >
                  Leverage
                </label>
                <select
                  id="scanner-lev"
                  value={scannerConfig.defaultLeverage}
                  onChange={(e) =>
                    updateScannerConfig({ defaultLeverage: Number(e.target.value) })
                  }
                  className="font-mono tabular-nums min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-2.5 text-xs font-medium text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
                >
                  <option value={3}>3x (Aman)</option>
                  <option value={5}>5x (Standar)</option>
                  <option value={8}>8x</option>
                  <option value={10}>10x</option>
                </select>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 py-2 text-xs text-[#848E9C] sm:col-span-2">
            <div>
              <span className="font-semibold text-[#EAECEF]">Urutan Saringan Ketat 4 Tahap:</span>{' '}
              <span className="text-[#F0B90B]">100 Coin</span> →{' '}
              <span className="text-[#EAECEF]">Outperformance BTC</span> →{' '}
              <span className="text-[#38BDF8]">Tokenomic Float/FDV</span> →{' '}
              <span className="text-[#A78BFA]">Trend 1D+4H Real</span> →{' '}
              <span className="text-[#00C087]">Layak Watchlist</span>
            </div>
          </div>
        )}

        {/* Interval & Anti-Spam Cooldown */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label
              htmlFor="scanner-interval"
              className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#848E9C]"
            >
              Interval
            </label>
            <select
              id="scanner-interval"
              value={scannerConfig.intervalSeconds}
              onChange={(e) =>
                updateScannerConfig({ intervalSeconds: Number(e.target.value) })
              }
              className="font-mono tabular-nums min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-2.5 text-xs font-medium text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
            >
              {INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="scanner-cooldown"
              className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#848E9C]"
            >
              Cooldown
            </label>
            <select
              id="scanner-cooldown"
              value={scannerConfig.cooldownSeconds}
              onChange={(e) =>
                updateScannerConfig({ cooldownSeconds: Number(e.target.value) })
              }
              className="font-mono tabular-nums min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-2.5 text-xs font-medium text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
            >
              {COOLDOWN_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Auto-actions Checkboxes */}
        <div className="flex flex-col justify-center gap-1.5 rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 py-2">
          {isFutures ? (
            <label className="flex min-h-[26px] cursor-pointer items-center gap-2 text-xs text-[#EAECEF]">
              <input
                type="checkbox"
                checked={scannerConfig.requireBtcAlignment}
                onChange={(e) =>
                  updateScannerConfig({ requireBtcAlignment: e.target.checked })
                }
                className="h-4 w-4 rounded accent-[#F0B90B]"
              />
              <span>Wajib Searah HTF BTC</span>
            </label>
          ) : (
            <label className="flex min-h-[26px] cursor-pointer items-center gap-2 text-xs text-[#EAECEF]">
              <input
                type="checkbox"
                checked={scannerConfig.autoAddWatchlist}
                onChange={(e) =>
                  updateScannerConfig({ autoAddWatchlist: e.target.checked })
                }
                className="h-4 w-4 rounded accent-[#00C087]"
              />
              <span>Auto-masuk Watchlist</span>
            </label>
          )}
          <label className="flex min-h-[26px] cursor-pointer items-center gap-2 text-xs text-[#EAECEF]">
            <input
              type="checkbox"
              checked={scannerConfig.autoSendTelegram}
              onChange={(e) => updateScannerConfig({ autoSendTelegram: e.target.checked })}
              className="h-4 w-4 rounded accent-[#F0B90B]"
            />
            <span>Auto-kirim Telegram</span>
          </label>
          <label className="flex min-h-[26px] cursor-pointer items-center gap-2 text-xs text-[#EAECEF]">
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

      {/* Mode-Specific Diagnostic Output */}
      {isFutures && lastFuturesReport && (
        <div className="mt-4 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
          <button
            type="button"
            onClick={() => setShowAuditList((prev) => !prev)}
            className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
          >
            <div className="flex flex-wrap items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-[#F0B90B]" />
              <span className="text-xs font-semibold text-[#EAECEF]">
                Audit Quality Gate Futures ({lastFuturesReport.timeframe.toUpperCase()} / HTF{' '}
                {lastFuturesReport.htfTimeframe.toUpperCase()})
              </span>
              <span className="font-mono tabular-nums rounded bg-[#1E2329] px-1.5 py-0.5 text-[10px] text-[#EAECEF]">
                Lolos {lastFuturesReport.passedCount} / {lastFuturesReport.evaluatedCount} koin
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  lastFuturesReport.btcHtfTrend === 'Bullish'
                    ? 'bg-[#00C087]/15 text-[#00C087]'
                    : lastFuturesReport.btcHtfTrend === 'Bearish'
                      ? 'bg-[#F6465D]/15 text-[#F6465D]'
                      : 'bg-[#1E2329] text-[#848E9C]'
                }`}
              >
                BTC HTF: {lastFuturesReport.btcHtfTrend}
              </span>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] text-[#848E9C]">
              {showAuditList ? 'Sembunyikan' : 'Lihat Detail'}
              {showAuditList ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </span>
          </button>

          {showAuditList && (
            <div className="cp-scrollbar mt-2.5 max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {lastFuturesReport.audits.map((a) => (
                <div
                  key={a.symbol}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                    a.passed
                      ? 'border-[#00C087]/40 bg-[#00C087]/5'
                      : 'border-[#2B3139] bg-[#161A1E]/80'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {a.passed ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#00C087]" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 shrink-0 text-[#F6465D]" />
                      )}
                      <span className="font-bold text-[#EAECEF]">{a.baseAsset}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          a.direction === 'LONG'
                            ? 'bg-[#00C087]/15 text-[#00C087]'
                            : 'bg-[#F6465D]/15 text-[#F6465D]'
                        }`}
                      >
                        {a.direction}
                      </span>
                      <span className="font-mono tabular-nums text-[11px] text-[#F0B90B]">
                        Skor {a.confluenceScore} · Grade {a.backtestGrade} (PF {a.profitFactor})
                      </span>
                      <span className="font-mono tabular-nums text-[10px] text-[#848E9C]">
                        RSI {a.rsi14} · ADX {a.adx14} · Vol {a.volumeRatio}x · HTF {a.htfTrend}
                      </span>
                    </div>
                    <p
                      className={`mt-0.5 text-[11px] ${
                        a.passed ? 'text-[#00C087]' : 'text-[#848E9C]'
                      }`}
                    >
                      {a.passed
                        ? `LOLOS: ${a.reasons.join(' · ')} (Ruang S/R 1:${a.rrToResistance})`
                        : `Ditolak: ${a.rejectReason}`}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => openAnalysis(a.symbol)}
                    className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg border border-[#2B3139] bg-[#0B0E11] px-2.5 text-[11px] text-[#EAECEF] hover:border-[#F0B90B]/60 hover:text-[#F0B90B]"
                  >
                    <CandlestickChart className="h-3 w-3" />
                    Chart
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!isFutures && (
        <SpotFunnelPanel
          report={lastSpotFunnelReport}
          isScanning={isScanning}
          onRunFunnel={() => void scanNow(true)}
          onSaveSpotDca={(cand) => void saveSpotCandidateToJournal(cand)}
        />
      )}

      {/* Auto-Signal Log List */}
      <div className="mt-4 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#EAECEF]">Log Sinyal Terverifikasi</span>
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
            Belum ada sinyal yang lolos Quality Gate. Klik tombol Scan atau aktifkan Auto-Scan.
          </p>
        ) : (
          <div className="cp-scrollbar max-h-64 space-y-2 overflow-y-auto pr-1">
            {scannerLogs.slice(0, 15).map((log) => (
              <div
                key={log.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2B3139] bg-[#161A1E] px-3 py-2.5"
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
                    {log.timeframe && (
                      <span className="font-mono tabular-nums rounded bg-[#0B0E11] px-1.5 py-0.5 text-[10px] uppercase text-[#848E9C]">
                        {log.timeframe}
                      </span>
                    )}
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

                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <span className="font-mono tabular-nums text-[10px] text-[#5E6673]">
                    {formatShortTime(log.createdAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => openAnalysis(log.symbol)}
                    className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-[#2B3139] bg-[#0B0E11] px-2.5 text-[11px] font-medium text-[#EAECEF] transition hover:border-[#F0B90B]/60 hover:text-[#F0B90B]"
                  >
                    <CandlestickChart className="h-3 w-3" />
                    <span>Chart</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      openSetupForCoin(log.symbol, log.mode === 'SPOT_DCA' ? 'SPOT' : 'FUTURES', {
                        direction:
                          log.direction === 'LONG' || log.direction === 'SHORT'
                            ? log.direction
                            : undefined,
                        timeframe: log.timeframe,
                        entryPrice: log.entryPrice,
                        stopLoss: log.stopLoss,
                        tp2: log.takeProfit,
                        notes: `Scanner Pro: ${log.summary}`,
                      })
                    }
                    className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-[#F0B90B]/15 px-2.5 text-[11px] font-semibold text-[#F0B90B] transition hover:bg-[#F0B90B] hover:text-[#0B0E11]"
                  >
                    <ShieldCheck className="h-3 w-3" />
                    <span>Setup</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void resendSignalToTelegram(log)}
                    className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-[#2B3139] bg-[#1E2329] px-2.5 text-[11px] font-medium text-[#EAECEF] transition hover:border-[#F0B90B]/60 hover:text-[#F0B90B]"
                  >
                    <Send className="h-3 w-3" />
                    <span>{log.telegramSent ? 'Ulang' : 'TG'}</span>
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
