import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wand2,
} from 'lucide-react';
import type {
  BacktestResult,
  Coin,
  EntryLeg,
  EntryMode,
  TakeProfitTarget,
  Timeframe,
  TradeDirection,
  TradeSetup,
} from '../../types';
import { useBinanceKlinesQuery } from '../../hooks/useMarketQueries';
import { sendTelegramHtmlMessage } from '../../services/adapters/telegramAdapter';
import {
  analyzeFuturesSetupReadiness,
  buildSmartFuturesLevels,
  getHigherTimeframeForSetup,
} from '../../services/setupAdvisor';
import { useAppStore } from '../../store/useAppStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTradingStore } from '../../store/useTradingStore';
import {
  formatPrice,
  formatQty,
  formatRawPrice,
  formatUsd,
  generateId,
} from '../../utils/format';
import { calculateFuturesRisk, evaluateBtcBetaAlignment } from '../../utils/riskCalc';
import { formatFuturesSetupTelegram } from '../../utils/telegramFormatters';

const CONFLUENCE_ITEMS = [
  'Struktur HTF Searah',
  'Harga di Key Support / Resistance',
  'Konfirmasi EMA 20/50',
  'Volume Spike / Orderflow Kuat',
  'RSI Tidak Overextended',
  'Funding & Risk Management Sehat',
];

const TP_PRESETS: Array<{ label: string; alloc: [number, number, number] }> = [
  { label: '40/35/25', alloc: [40, 35, 25] },
  { label: '50/30/20', alloc: [50, 30, 20] },
  { label: '30/30/40', alloc: [30, 30, 40] },
];

interface FuturesSetupFormProps {
  coin: Coin;
  btcCoin?: Coin;
  appliedBacktest: BacktestResult | null;
  onClearApplied: () => void;
}

export function FuturesSetupForm({
  coin,
  btcCoin,
  appliedBacktest,
  onClearApplied,
}: FuturesSetupFormProps) {
  const addFuturesSetup = useTradingStore((s) => s.addFuturesSetup);
  const futuresSetups = useTradingStore((s) => s.futuresSetups);
  const maxDailySlHits = useTradingStore((s) => s.maxDailySlHits);
  const setMaxDailySlHits = useTradingStore((s) => s.setMaxDailySlHits);
  const telegramConfig = useSettingsStore((s) => s.telegramConfig);
  const pushToast = useAppStore((s) => s.pushToast);
  const openSettingsModal = useAppStore((s) => s.openSettingsModal);
  const pendingSetupDraft = useAppStore((s) => s.pendingSetupDraft);
  const clearPendingSetupDraft = useAppStore((s) => s.clearPendingSetupDraft);

  const [direction, setDirection] = useState<TradeDirection>('LONG');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [entryMode, setEntryMode] = useState<EntryMode>('SINGLE');
  const [accountEquity, setAccountEquity] = useState<number>(10000);
  const [riskPercent, setRiskPercent] = useState<number>(1.0);
  const [leverage, setLeverage] = useState<number>(5);

  const [entry1, setEntry1] = useState<number>(() => coin.price);
  const [entry2, setEntry2] = useState<number>(() => Number((coin.price * 0.99).toPrecision(6)));
  const [entry3, setEntry3] = useState<number>(() => Number((coin.price * 0.98).toPrecision(6)));
  const [stopLoss, setStopLoss] = useState<number>(() => Number((coin.price * 0.975).toPrecision(6)));
  const [tp1, setTp1] = useState<number>(() => Number((coin.price * 1.035).toPrecision(6)));
  const [tp2, setTp2] = useState<number>(() => Number((coin.price * 1.065).toPrecision(6)));
  const [tp3, setTp3] = useState<number>(() => Number((coin.price * 1.1).toPrecision(6)));
  const [tpAlloc, setTpAlloc] = useState<[number, number, number]>([40, 35, 25]);
  const [confluences, setConfluences] = useState<string[]>([
    'Struktur HTF Searah',
    'Konfirmasi EMA 20/50',
  ]);
  const [notes, setNotes] = useState('');
  const [source, setSource] = useState<'Manual' | 'Backtest'>('Manual');

  // Real multi-timeframe Binance Klines via TanStack Query for Live Setup Audit & Structural Levels
  const htfTf = getHigherTimeframeForSetup(timeframe);
  const primaryKlinesQuery = useBinanceKlinesQuery(coin.symbol, timeframe, 240, coin.price);
  const htfKlinesQuery = useBinanceKlinesQuery(coin.symbol, htfTf, 120, coin.price);
  const btcHtfKlinesQuery = useBinanceKlinesQuery('BTCUSDT', htfTf, 120, btcCoin?.price);

  const primaryCandles = primaryKlinesQuery.data?.candles ?? [];
  const htfCandles = htfKlinesQuery.data?.candles ?? [];
  const btcHtfCandles = btcHtfKlinesQuery.data?.candles ?? [];

  // Re-initialize smart structural defaults cleanly when selected coin changes (unless draft pending)
  useEffect(() => {
    if (pendingSetupDraft && pendingSetupDraft.symbol === coin.symbol && pendingSetupDraft.mode === 'FUTURES') {
      return;
    }
    const p = coin.price;
    setEntry1(Number(formatRawPrice(p)));
    setEntry2(Number(formatRawPrice(direction === 'LONG' ? p * 0.99 : p * 1.01)));
    setEntry3(Number(formatRawPrice(direction === 'LONG' ? p * 0.98 : p * 1.02)));
    setStopLoss(Number(formatRawPrice(direction === 'LONG' ? p * 0.975 : p * 1.025)));
    setTp1(Number(formatRawPrice(direction === 'LONG' ? p * 1.035 : p * 0.965)));
    setTp2(Number(formatRawPrice(direction === 'LONG' ? p * 1.065 : p * 0.935)));
    setTp3(Number(formatRawPrice(direction === 'LONG' ? p * 1.1 : p * 0.9)));
    setSource('Manual');
  }, [coin.symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  // Consume optional draft forwarded from Scanner Pro or Active Journal
  useEffect(() => {
    if (!pendingSetupDraft || pendingSetupDraft.mode !== 'FUTURES' || pendingSetupDraft.symbol !== coin.symbol) {
      return;
    }
    const nextDir = pendingSetupDraft.direction ?? direction;
    const e = pendingSetupDraft.entryPrice ?? coin.price;
    setDirection(nextDir);
    if (pendingSetupDraft.timeframe) setTimeframe(pendingSetupDraft.timeframe);
    setEntryMode('SINGLE');
    setEntry1(Number(formatRawPrice(e)));
    if (pendingSetupDraft.stopLoss) {
      const sl = pendingSetupDraft.stopLoss;
      const dist = Math.abs(e - sl);
      setStopLoss(Number(formatRawPrice(sl)));
      setTp1(
        Number(
          formatRawPrice(
            pendingSetupDraft.tp1 ?? (nextDir === 'LONG' ? e + dist * 1.5 : e - dist * 1.5),
          ),
        ),
      );
      setTp2(
        Number(
          formatRawPrice(
            pendingSetupDraft.tp2 ?? (nextDir === 'LONG' ? e + dist * 2.4 : e - dist * 2.4),
          ),
        ),
      );
      setTp3(
        Number(
          formatRawPrice(
            pendingSetupDraft.tp3 ?? (nextDir === 'LONG' ? e + dist * 3.5 : e - dist * 3.5),
          ),
        ),
      );
    }
    if (pendingSetupDraft.notes) setNotes(pendingSetupDraft.notes);
    clearPendingSetupDraft();
  }, [pendingSetupDraft, coin.symbol, coin.price, direction, clearPendingSetupDraft]);

  // Apply 1-Click Backtest suggestion
  useEffect(() => {
    if (!appliedBacktest) return;
    setDirection(appliedBacktest.suggestedDirection);
    setTimeframe(appliedBacktest.params.timeframe);
    setEntryMode('SINGLE');
    setEntry1(Number(formatRawPrice(appliedBacktest.suggestedEntry)));
    setStopLoss(Number(formatRawPrice(appliedBacktest.suggestedStopLoss)));
    setTp1(Number(formatRawPrice(appliedBacktest.suggestedTp1)));
    setTp2(Number(formatRawPrice(appliedBacktest.suggestedTp2)));
    setTp3(Number(formatRawPrice(appliedBacktest.suggestedTp3)));
    setSource('Backtest');
    setNotes(
      `Backtest ${appliedBacktest.params.strategy} (${appliedBacktest.params.timeframe.toUpperCase()}) · Grade ${appliedBacktest.grade} · WR ${appliedBacktest.winRate}% · PF ${appliedBacktest.profitFactor} · Exp ${appliedBacktest.expectancyR >= 0 ? '+' : ''}${appliedBacktest.expectancyR}R`,
    );
    onClearApplied();
  }, [appliedBacktest, onClearApplied]);

  // Active open risk across existing Waiting + Running Futures setups
  const existingActiveRiskUsdt = useMemo(
    () =>
      futuresSetups
        .filter((s) => s.status === 'Waiting' || s.status === 'Running')
        .reduce((acc, s) => acc + s.riskAmountUsdt, 0),
    [futuresSetups],
  );

  // Daily Drawdown Guardrail: count Hit SL closed today (local calendar day)
  const todaySlHits = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startMs = startOfToday.getTime();
    return futuresSetups.filter(
      (s) => s.status === 'Hit SL' && (s.closedAt ?? s.updatedAt) >= startMs,
    ).length;
  }, [futuresSetups]);

  const cooldownActive = todaySlHits >= maxDailySlHits;

  const entries: EntryLeg[] = useMemo(() => {
    if (entryMode === 'SINGLE') {
      return [{ price: entry1, weightPercent: 100 }];
    }
    return [
      { price: entry1, weightPercent: 40 },
      { price: entry2, weightPercent: 35 },
      { price: entry3, weightPercent: 25 },
    ];
  }, [entryMode, entry1, entry2, entry3]);

  const takeProfits: TakeProfitTarget[] = useMemo(
    () => [
      { label: 'TP1', price: tp1, allocationPercent: tpAlloc[0] },
      { label: 'TP2', price: tp2, allocationPercent: tpAlloc[1] },
      { label: 'TP3', price: tp3, allocationPercent: tpAlloc[2] },
    ],
    [tp1, tp2, tp3, tpAlloc],
  );

  const metrics = useMemo(
    () =>
      calculateFuturesRisk({
        direction,
        entries,
        stopLoss,
        takeProfits,
        accountEquity,
        riskPercent,
        leverage,
        feeRateRoundTrip: 0.001,
        activePortfolioRiskUsdt: existingActiveRiskUsdt,
      }),
    [direction, entries, stopLoss, takeProfits, accountEquity, riskPercent, leverage, existingActiveRiskUsdt],
  );

  // Live Multi-Timeframe Setup Readiness Audit (real closed candles)
  const readiness = useMemo(
    () =>
      analyzeFuturesSetupReadiness({
        symbol: coin.symbol,
        livePrice: coin.price,
        direction,
        timeframe,
        primaryCandles,
        htfCandles,
        btcHtfCandles,
        isLiquidationBeforeSl: metrics.isLiquidationBeforeSl,
        blendedNetRR: metrics.blendedNetRR,
      }),
    [
      coin.symbol,
      coin.price,
      direction,
      timeframe,
      primaryCandles,
      htfCandles,
      btcHtfCandles,
      metrics.isLiquidationBeforeSl,
      metrics.blendedNetRR,
    ],
  );

  // Real HTF BTC Beta Check (upgraded from naive 24h % to real BTC HTF Klines)
  const btcBeta = useMemo(
    () =>
      evaluateBtcBetaAlignment(
        coin.symbol,
        direction,
        btcCoin?.priceChangePercent24h ?? 0,
        readiness.btcHtfTrend,
      ),
    [coin.symbol, direction, btcCoin?.priceChangePercent24h, readiness.btcHtfTrend],
  );

  const handleApplySmartSetup = (overrideDirection?: TradeDirection) => {
    const targetDir = overrideDirection ?? readiness.recommendedDirection;
    const closed = primaryCandles.length > 60 ? primaryCandles.slice(0, -1) : primaryCandles;
    const smart = buildSmartFuturesLevels(closed, coin.price, targetDir, 1.5);

    setDirection(targetDir);
    setEntry1(Number(formatRawPrice(smart.entry1)));
    setEntry2(Number(formatRawPrice(smart.entry2)));
    setEntry3(Number(formatRawPrice(smart.entry3)));
    setStopLoss(Number(formatRawPrice(smart.stopLoss)));
    setTp1(Number(formatRawPrice(smart.tp1)));
    setTp2(Number(formatRawPrice(smart.tp2)));
    setTp3(Number(formatRawPrice(smart.tp3)));
    setLeverage(smart.recommendedLeverage);
    if (readiness.autoChecklist.length > 0) {
      setConfluences(readiness.autoChecklist);
    }
    setNotes(
      `Smart Setup ${targetDir} (${timeframe.toUpperCase()} / HTF ${htfTf.toUpperCase()} ${readiness.htfTrend}) · SL ${smart.slBasisLabel} · RSI ${readiness.rsi14} · ADX ${readiness.adx14}`,
    );
    pushToast(
      `Smart Setup ${targetDir} ${coin.baseAsset} Diterapkan`,
      `SL (${smart.slBasisLabel}) & TP1–TP3 berbasis struktur S/R + ATR · Safe Lev ${smart.recommendedLeverage}x.`,
      'success',
    );
  };

  const handleDirectionSwitch = (nextDir: TradeDirection) => {
    setDirection(nextDir);
    if (primaryCandles.length > 40) {
      const closed = primaryCandles.slice(0, -1);
      const smart = buildSmartFuturesLevels(closed, coin.price, nextDir, 1.5);
      setEntry1(Number(formatRawPrice(smart.entry1)));
      setEntry2(Number(formatRawPrice(smart.entry2)));
      setEntry3(Number(formatRawPrice(smart.entry3)));
      setStopLoss(Number(formatRawPrice(smart.stopLoss)));
      setTp1(Number(formatRawPrice(smart.tp1)));
      setTp2(Number(formatRawPrice(smart.tp2)));
      setTp3(Number(formatRawPrice(smart.tp3)));
      return;
    }
    const p = entry1 > 0 ? entry1 : coin.price;
    setStopLoss(Number(formatRawPrice(nextDir === 'LONG' ? p * 0.975 : p * 1.025)));
    setTp1(Number(formatRawPrice(nextDir === 'LONG' ? p * 1.035 : p * 0.965)));
    setTp2(Number(formatRawPrice(nextDir === 'LONG' ? p * 1.065 : p * 0.935)));
    setTp3(Number(formatRawPrice(nextDir === 'LONG' ? p * 1.1 : p * 0.9)));
  };

  const toggleConfluence = (item: string) => {
    setConfluences((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item],
    );
  };

  const buildSetupRecord = (): TradeSetup => ({
    id: generateId('fut'),
    symbol: coin.symbol,
    baseAsset: coin.baseAsset,
    direction,
    timeframe,
    entryMode,
    entries,
    avgEntry: metrics.avgEntry,
    stopLoss,
    takeProfits,
    accountEquity,
    riskPercent,
    leverage,
    riskAmountUsdt: metrics.riskAmountUsdt,
    positionSizeUsdt: metrics.positionSizeUsdt,
    positionQty: metrics.positionQty,
    marginRequiredUsdt: metrics.marginRequiredUsdt,
    estimatedLiquidation: metrics.estimatedLiquidation,
    rrTp1: metrics.netRrTp1,
    rrTp2: metrics.netRrTp2,
    rrTp3: metrics.netRrTp3,
    btcBetaAligned: btcBeta.aligned,
    confluenceChecks: confluences,
    notes: notes.trim(),
    status: 'Waiting',
    source,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const handleSave = async () => {
    if (!metrics.isValidSl || metrics.isLiquidationBeforeSl) {
      pushToast('Setup Belum Aman / Valid', metrics.validationMessage, 'error');
      return;
    }
    if (!metrics.isTpAllocValid) {
      pushToast(
        'Alokasi Split TP Harus 100%',
        `Total saat ini ${metrics.tpAllocationSum}%. Gunakan preset 40/35/25 atau sesuaikan slider.`,
        'warning',
      );
      return;
    }
    const record = buildSetupRecord();
    addFuturesSetup(record);
    pushToast(
      `Setup ${record.direction} ${record.baseAsset} Disimpan`,
      `Risk ${formatUsd(record.riskAmountUsdt)} (+Fee ${formatUsd(metrics.estimatedFeeUsdt)}) · Net R:R TP2 1:${record.rrTp2.toFixed(2)}`,
      'success',
    );

    if (
      telegramConfig.enabled &&
      telegramConfig.autoSendFutures &&
      telegramConfig.botToken &&
      telegramConfig.chatId
    ) {
      const res = await sendTelegramHtmlMessage(telegramConfig, formatFuturesSetupTelegram(record));
      if (res.ok) {
        pushToast('Terkirim ke Telegram', `Setup ${record.symbol} diteruskan otomatis.`, 'info');
      }
    }
  };

  const handleSendTelegramNow = async () => {
    if (!metrics.isValidSl || metrics.isLiquidationBeforeSl) {
      pushToast('Setup Belum Valid', metrics.validationMessage, 'error');
      return;
    }
    if (!telegramConfig.botToken || !telegramConfig.chatId) {
      pushToast('Telegram Belum Diatur', 'Isi Bot Token & Chat ID di Settings & Backup.', 'warning');
      openSettingsModal();
      return;
    }
    const record = buildSetupRecord();
    const res = await sendTelegramHtmlMessage(telegramConfig, formatFuturesSetupTelegram(record));
    pushToast(
      res.ok ? 'Setup Terkirim ke Telegram' : 'Gagal Kirim Telegram',
      res.message,
      res.ok ? 'success' : 'error',
    );
  };

  // Visual Trade Ladder positions (0%..100%)
  const ladderBounds = useMemo(() => {
    const prices = [
      metrics.estimatedLiquidation,
      stopLoss,
      metrics.avgEntry,
      coin.price,
      tp1,
      tp2,
      tp3,
    ].filter((v) => Number.isFinite(v) && v > 0);
    if (prices.length < 2) return null;
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const span = Math.max(maxP - minP, minP * 0.001);
    const pct = (val: number) => Math.max(0, Math.min(100, ((val - minP) / span) * 100));
    return {
      liq: pct(metrics.estimatedLiquidation),
      sl: pct(stopLoss),
      entry: pct(metrics.avgEntry),
      tp1: pct(tp1),
      tp2: pct(tp2),
      tp3: pct(tp3),
    };
  }, [metrics.estimatedLiquidation, stopLoss, metrics.avgEntry, coin.price, tp1, tp2, tp3]);

  const gradeBadgeStyle =
    readiness.readinessGrade === 'A+' || readiness.readinessGrade === 'A'
      ? 'border-[#00C087]/50 bg-[#00C087]/15 text-[#00C087]'
      : readiness.readinessGrade === 'B'
        ? 'border-[#F0B90B]/50 bg-[#F0B90B]/15 text-[#F0B90B]'
        : 'border-[#F6465D]/50 bg-[#F6465D]/15 text-[#F6465D]';

  return (
    <div className="space-y-4">
      {/* Daily Drawdown Guardrail Banner */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5 ${
          cooldownActive
            ? 'border-[#F6465D]/60 bg-[#F6465D]/10'
            : 'border-[#2B3139] bg-[#161A1E]'
        }`}
      >
        <div className="flex items-start gap-2.5">
          <ShieldAlert
            className={`mt-0.5 h-5 w-5 shrink-0 ${
              cooldownActive ? 'text-[#F6465D]' : 'text-[#00C087]'
            }`}
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-[#EAECEF]">
                Daily Drawdown Guardrail {cooldownActive ? '— COOLDOWN MODE AKTIF' : '— Aman'}
              </span>
              <span
                className={`font-mono tabular-nums rounded px-2 py-0.5 text-[11px] font-bold ${
                  cooldownActive
                    ? 'bg-[#F6465D]/20 text-[#F6465D]'
                    : 'bg-[#00C087]/15 text-[#00C087]'
                }`}
              >
                Hit SL Hari Ini: {todaySlHits} / {maxDailySlHits}
              </span>
              <span className="font-mono tabular-nums rounded bg-[#0B0E11] px-2 py-0.5 text-[11px] text-[#848E9C]">
                Total Eksposur: {metrics.totalExposureRiskPercent.toFixed(1)}% Ekuitas
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[#848E9C]">
              {cooldownActive
                ? 'Batas kerugian harian tercapai! Hindari revenge trading atau turunkan risiko ke 0.5%.'
                : 'Disiplin risiko terjaga. Total risiko terbuka + setup ini dipantau otomatis.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-[#848E9C]">
            <span>Maks SL/Hari:</span>
            <select
              value={maxDailySlHits}
              onChange={(e) => setMaxDailySlHits(Number(e.target.value))}
              className="font-mono tabular-nums min-h-[40px] rounded-lg border border-[#2B3139] bg-[#0B0E11] px-2 text-xs font-bold text-[#EAECEF]"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}x
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => {
              setRiskPercent(0.5);
              pushToast(
                'Risk Diturunkan ke 0.5%',
                'Mode proteksi modal aktif pada kalkulator.',
                'warning',
              );
            }}
            className="min-h-[40px] rounded-lg border border-[#F0B90B]/60 bg-[#F0B90B]/15 px-3 text-xs font-semibold text-[#F0B90B] transition hover:bg-[#F0B90B] hover:text-[#0B0E11]"
          >
            1-Klik Risk 0.5%
          </button>
        </div>
      </div>

      {/* NEW: Live AI Setup Readiness & Smart Structural Generator Card */}
      <section aria-label="Audit Kesiapan Setup Live" className="cp-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2B3139] pb-3">
          <div className="flex items-start gap-2.5">
            <Cpu className="mt-0.5 h-5 w-5 shrink-0 text-[#F0B90B]" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-[#EAECEF]">
                  Audit Kesiapan Setup Real-Time ({coin.baseAsset} {direction} · {timeframe.toUpperCase()})
                </h2>
                <span
                  className={`font-mono tabular-nums rounded-md border px-2 py-0.5 text-xs font-bold ${gradeBadgeStyle}`}
                >
                  Skor {readiness.readinessScore}/100 · Grade {readiness.readinessGrade}
                </span>
              </div>
              <p className="font-mono tabular-nums mt-0.5 text-[11px] text-[#848E9C]">
                HTF {htfTf.toUpperCase()}: {readiness.htfTrend} · BTC HTF: {readiness.btcHtfTrend} ·
                RSI {readiness.rsi14} · ADX {readiness.adx14} · Vol {readiness.volumeRatio}x ·{' '}
                {readiness.structureLabel}
                {readiness.divergence !== 'NONE' ? ` · ${readiness.divergence} RSI DIV` : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              id="btn-smart-setup"
              type="button"
              onClick={() => handleApplySmartSetup(readiness.recommendedDirection)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#F0B90B] px-3.5 text-xs font-semibold text-[#0B0E11] transition hover:bg-[#F0B90B]/90"
            >
              <Wand2 className="h-3.5 w-3.5" />
              <span>Smart Setup ({readiness.recommendedDirection} Struktur+ATR)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setConfluences(readiness.autoChecklist);
                pushToast(
                  'Checklist Disinkronkan',
                  `${readiness.autoChecklist.length}/6 konfluensi terdeteksi otomatis dari candle live.`,
                  'info',
                );
              }}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#2B3139] bg-[#1E2329] px-3 text-xs font-medium text-[#EAECEF] transition hover:border-[#00C087]/60 hover:text-[#00C087]"
            >
              <Sparkles className="h-3.5 w-3.5 text-[#00C087]" />
              <span>Sync Checklist</span>
            </button>
          </div>
        </div>

        {/* Strengths & Warnings Grid + Real HTF BTC Beta */}
        <div className="mt-3 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          <div className="space-y-1.5 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#00C087]">
              Konfluensi Pendukung ({readiness.strengths.length})
            </span>
            {readiness.strengths.length === 0 ? (
              <p className="text-xs text-[#5E6673]">
                Belum ada konfluensi kuat untuk arah {direction}. Pertimbangkan klik Smart Setup ({readiness.recommendedDirection}).
              </p>
            ) : (
              <ul className="space-y-1 text-xs text-[#EAECEF]">
                {readiness.strengths.map((s) => (
                  <li key={s} className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#00C087]" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1.5 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#F0B90B]">
              Peringatan Risiko &amp; BTC Beta ({readiness.warnings.length + (btcBeta.aligned ? 0 : 1)})
            </span>
            {readiness.warnings.length === 0 && btcBeta.aligned ? (
              <p className="flex items-center gap-1.5 text-xs text-[#00C087]">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                <span>{btcBeta.label} — tidak ada bendera merah teknikal pada TF {timeframe.toUpperCase()}.</span>
              </p>
            ) : (
              <ul className="space-y-1 text-xs text-[#F0B90B]">
                {!btcBeta.aligned && (
                  <li className="flex items-start gap-1.5">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#F0B90B]" />
                    <span>{btcBeta.detail}</span>
                  </li>
                )}
                {readiness.warnings.map((w) => (
                  <li key={w} className="flex items-start gap-1.5">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#F6465D]" />
                    <span className="text-[#EAECEF]">{w}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Main Calculator Grid */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Left: Input Form */}
        <div className="cp-card space-y-4 p-4 xl:col-span-7">
          {/* Direction + Entry Mode + TF */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <span className="mb-1 block text-[11px] font-medium uppercase text-[#848E9C]">Arah</span>
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-1">
                <button
                  type="button"
                  onClick={() => handleDirectionSwitch('LONG')}
                  className={`min-h-[38px] rounded-lg text-xs font-bold transition ${
                    direction === 'LONG' ? 'bg-[#00C087] text-[#0B0E11]' : 'text-[#848E9C]'
                  }`}
                >
                  LONG
                </button>
                <button
                  type="button"
                  onClick={() => handleDirectionSwitch('SHORT')}
                  className={`min-h-[38px] rounded-lg text-xs font-bold transition ${
                    direction === 'SHORT' ? 'bg-[#F6465D] text-white' : 'text-[#848E9C]'
                  }`}
                >
                  SHORT
                </button>
              </div>
            </div>

            <div>
              <span className="mb-1 block text-[11px] font-medium uppercase text-[#848E9C]">
                Tipe Entry
              </span>
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-1">
                {(['SINGLE', 'LAYERING'] as EntryMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setEntryMode(m)}
                    className={`min-h-[38px] rounded-lg text-xs font-semibold transition ${
                      entryMode === m ? 'bg-[#F0B90B] text-[#0B0E11]' : 'text-[#848E9C]'
                    }`}
                  >
                    {m === 'SINGLE' ? 'Single' : 'Layering'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="fut-tf"
                className="mb-1 block text-[11px] font-medium uppercase text-[#848E9C]"
              >
                Timeframe
              </label>
              <select
                id="fut-tf"
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as Timeframe)}
                className="font-mono tabular-nums min-h-[44px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-xs font-semibold text-[#EAECEF]"
              >
                {(['5m', '15m', '1h', '4h', '1d'] as Timeframe[]).map((tf) => (
                  <option key={tf} value={tf}>
                    {tf.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Equity, Risk %, Leverage */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] text-[#848E9C]">Ekuitas Akun (USDT)</label>
              <input
                type="number"
                min={10}
                step={100}
                value={accountEquity}
                onChange={(e) => setAccountEquity(Number(e.target.value) || 0)}
                className="font-mono tabular-nums min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-sm font-semibold text-[#EAECEF]"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-[#848E9C]">Risk / Trade (%)</label>
              <input
                type="number"
                min={0.1}
                max={15}
                step={0.1}
                value={riskPercent}
                onChange={(e) => setRiskPercent(Number(e.target.value) || 0.5)}
                className="font-mono tabular-nums min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-sm font-semibold text-[#F0B90B]"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="text-[#848E9C]">Leverage (x)</span>
                <button
                  type="button"
                  onClick={() => setLeverage(metrics.maxSafeLeverage)}
                  className="font-mono tabular-nums text-[10px] font-semibold text-[#00C087] hover:underline"
                >
                  Aman ≤ {metrics.maxSafeLeverage}x
                </button>
              </div>
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value) || 1)}
                className={`font-mono tabular-nums min-h-[42px] w-full rounded-xl border bg-[#0B0E11] px-3 text-sm font-semibold ${
                  metrics.isLiquidationBeforeSl
                    ? 'border-[#F6465D] text-[#F6465D]'
                    : 'border-[#2B3139] text-[#EAECEF]'
                }`}
              />
            </div>
          </div>

          {/* Entry & Stop Loss */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="text-[#848E9C]">
                  {entryMode === 'SINGLE' ? 'Harga Entry' : 'Entry 1 (40%)'}
                </span>
                <button
                  type="button"
                  onClick={() => setEntry1(Number(formatRawPrice(coin.price)))}
                  className="font-mono tabular-nums text-[10px] font-semibold text-[#F0B90B] hover:underline"
                >
                  Pakai Live {formatPrice(coin.price)}
                </button>
              </div>
              <input
                type="number"
                step="any"
                value={entry1}
                onChange={(e) => setEntry1(Number(e.target.value) || 0)}
                className="font-mono tabular-nums min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-sm font-semibold text-[#EAECEF]"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="text-[#F6465D]">Stop Loss (SL)</span>
                <button
                  type="button"
                  onClick={() => handleApplySmartSetup(direction)}
                  className="text-[10px] font-semibold text-[#F0B90B] hover:underline"
                >
                  Auto SL/TP ({direction})
                </button>
              </div>
              <input
                type="number"
                step="any"
                value={stopLoss}
                onChange={(e) => setStopLoss(Number(e.target.value) || 0)}
                className="font-mono tabular-nums min-h-[42px] w-full rounded-xl border border-[#F6465D]/40 bg-[#0B0E11] px-3 text-sm font-semibold text-[#F6465D]"
              />
            </div>
          </div>

          {entryMode === 'LAYERING' && (
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] text-[#848E9C]">
                  Entry 2 (35% · Pullback EMA20/VWAP)
                </label>
                <input
                  type="number"
                  step="any"
                  value={entry2}
                  onChange={(e) => setEntry2(Number(e.target.value) || 0)}
                  className="font-mono tabular-nums min-h-[40px] w-full rounded-lg border border-[#2B3139] bg-[#161A1E] px-3 text-xs font-semibold text-[#EAECEF]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-[#848E9C]">
                  Entry 3 (25% · Key S/R)
                </label>
                <input
                  type="number"
                  step="any"
                  value={entry3}
                  onChange={(e) => setEntry3(Number(e.target.value) || 0)}
                  className="font-mono tabular-nums min-h-[40px] w-full rounded-lg border border-[#2B3139] bg-[#161A1E] px-3 text-xs font-semibold text-[#EAECEF]"
                />
              </div>
            </div>
          )}

          {/* Split TP1 - TP3 with 100% Presets */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="font-medium uppercase text-[#848E9C]">
                Split Take Profit{' '}
                <span
                  className={`font-mono tabular-nums ml-1 font-bold ${
                    metrics.isTpAllocValid ? 'text-[#00C087]' : 'text-[#F6465D]'
                  }`}
                >
                  (Total {metrics.tpAllocationSum}%)
                </span>
              </span>
              <div className="flex items-center gap-1">
                {TP_PRESETS.map((pr) => (
                  <button
                    key={pr.label}
                    type="button"
                    onClick={() => setTpAlloc(pr.alloc)}
                    className="font-mono tabular-nums rounded-md border border-[#2B3139] bg-[#0B0E11] px-2 py-1 text-[10px] font-semibold text-[#848E9C] hover:border-[#00C087]/60 hover:text-[#00C087]"
                  >
                    {pr.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: 'TP1', val: tp1, set: setTp1, allocIdx: 0 as const, netUsd: metrics.netRewardTp1Usdt },
                { label: 'TP2', val: tp2, set: setTp2, allocIdx: 1 as const, netUsd: metrics.netRewardTp2Usdt },
                { label: 'TP3', val: tp3, set: setTp3, allocIdx: 2 as const, netUsd: metrics.netRewardTp3Usdt },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-2.5">
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-[#00C087]">{item.label}</span>
                    <span className="font-mono tabular-nums text-[#848E9C]">
                      Split {tpAlloc[item.allocIdx]}%
                    </span>
                  </div>
                  <input
                    type="number"
                    step="any"
                    value={item.val}
                    onChange={(e) => item.set(Number(e.target.value) || 0)}
                    className="font-mono tabular-nums min-h-[40px] w-full rounded-lg border border-[#2B3139] bg-[#161A1E] px-2.5 text-xs font-semibold text-[#00C087]"
                  />
                  <input
                    type="range"
                    min={10}
                    max={80}
                    step={5}
                    value={tpAlloc[item.allocIdx]}
                    onChange={(e) => {
                      const next: [number, number, number] = [...tpAlloc];
                      next[item.allocIdx] = Number(e.target.value);
                      setTpAlloc(next);
                    }}
                    className="mt-1.5 w-full accent-[#00C087]"
                  />
                  <span className="font-mono tabular-nums block text-right text-[10px] text-[#00C087]">
                    Net {formatUsd(item.netUsd, true)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Confluence Checklist */}
          <div>
            <span className="mb-1.5 block text-[11px] font-medium uppercase text-[#848E9C]">
              Confluence Checklist ({confluences.length}/{CONFLUENCE_ITEMS.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {CONFLUENCE_ITEMS.map((item) => {
                const checked = confluences.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleConfluence(item)}
                    className={`min-h-[38px] rounded-lg border px-2.5 text-xs transition ${
                      checked
                        ? 'border-[#00C087]/50 bg-[#00C087]/15 text-[#00C087]'
                        : 'border-[#2B3139] bg-[#0B0E11] text-[#848E9C]'
                    }`}
                  >
                    {checked ? '✓ ' : '+ '}
                    {item}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-[11px] text-[#848E9C]">Catatan Trading</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Alasan entry, area invalidasi, manajemen risiko..."
              className="w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] p-2.5 text-xs text-[#EAECEF] placeholder-[#5E6673] focus:border-[#F0B90B] focus:outline-none"
            />
          </div>
        </div>

        {/* Right: Live Fee-Adjusted Risk Output & Visualizer */}
        <div className="cp-card flex flex-col justify-between p-4 xl:col-span-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#2B3139] pb-3">
              <h3 className="text-sm font-semibold text-[#EAECEF]">
                Kalkulasi Risk &amp; Sizing Pro
              </h3>
              <span className="font-mono tabular-nums rounded bg-[#0B0E11] px-2 py-0.5 text-xs font-bold text-[#F0B90B]">
                {coin.baseAsset} {leverage}x
              </span>
            </div>

            {/* Critical Validation / Liquidation Guard */}
            {metrics.validationMessage && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#F6465D]/60 bg-[#F6465D]/12 p-3 text-xs text-[#F6465D]">
                <span>{metrics.validationMessage}</span>
                {metrics.isLiquidationBeforeSl && (
                  <button
                    type="button"
                    onClick={() => setLeverage(metrics.maxSafeLeverage)}
                    className="min-h-[36px] rounded-lg bg-[#F6465D] px-2.5 text-[11px] font-bold text-white"
                  >
                    Set Leverage Aman ({metrics.maxSafeLeverage}x)
                  </button>
                )}
              </div>
            )}

            {/* Secondary Risk Warnings */}
            {metrics.riskWarnings.length > 0 && (
              <div className="space-y-1 rounded-xl border border-[#F0B90B]/40 bg-[#F0B90B]/8 p-2.5 text-[11px] text-[#F0B90B]">
                {metrics.riskWarnings.map((w) => (
                  <p key={w} className="flex items-start gap-1.5">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{w}</span>
                  </p>
                ))}
              </div>
            )}

            {/* Visual Trade Price Ladder */}
            {ladderBounds && metrics.isValidSl && (
              <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
                <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-[#848E9C]">
                  <span>Visualisasi Zona Harga</span>
                  <span className="font-mono tabular-nums text-[#EAECEF]">
                    SL {metrics.stopDistancePercent.toFixed(2)}% · Liq{' '}
                    {metrics.liquidationDistancePercent.toFixed(2)}%
                  </span>
                </div>
                <div className="relative h-3 w-full rounded-full bg-[#1E2329]">
                  {/* Risk zone (SL to Entry) */}
                  <div
                    className="absolute top-0 h-full rounded-full bg-[#F6465D]/50"
                    style={{
                      left: `${Math.min(ladderBounds.sl, ladderBounds.entry)}%`,
                      width: `${Math.abs(ladderBounds.entry - ladderBounds.sl)}%`,
                    }}
                  />
                  {/* Reward zone (Entry to TP3) */}
                  <div
                    className="absolute top-0 h-full rounded-full bg-[#00C087]/50"
                    style={{
                      left: `${Math.min(ladderBounds.entry, ladderBounds.tp3)}%`,
                      width: `${Math.abs(ladderBounds.tp3 - ladderBounds.entry)}%`,
                    }}
                  />
                  {/* Markers */}
                  <span
                    title={`Likuidasi: ${formatPrice(metrics.estimatedLiquidation)}`}
                    className="absolute -top-0.5 h-4 w-1 -translate-x-1/2 rounded bg-[#F6465D]"
                    style={{ left: `${ladderBounds.liq}%` }}
                  />
                  <span
                    title={`Stop Loss: ${formatPrice(stopLoss)}`}
                    className="absolute -top-0.5 h-4 w-1.5 -translate-x-1/2 rounded bg-[#F6465D]"
                    style={{ left: `${ladderBounds.sl}%` }}
                  />
                  <span
                    title={`Avg Entry: ${formatPrice(metrics.avgEntry)}`}
                    className="absolute -top-0.5 h-4 w-1.5 -translate-x-1/2 rounded bg-[#F0B90B]"
                    style={{ left: `${ladderBounds.entry}%` }}
                  />
                  <span
                    title={`TP2: ${formatPrice(tp2)}`}
                    className="absolute -top-0.5 h-4 w-1.5 -translate-x-1/2 rounded bg-[#00C087]"
                    style={{ left: `${ladderBounds.tp2}%` }}
                  />
                </div>
                <div className="font-mono tabular-nums mt-1.5 flex items-center justify-between text-[10px]">
                  <span className="text-[#F6465D]">SL {formatPrice(stopLoss)}</span>
                  <span className="text-[#F0B90B]">Entry {formatPrice(metrics.avgEntry)}</span>
                  <span className="text-[#00C087]">TP2 {formatPrice(tp2)}</span>
                </div>
              </div>
            )}

            {/* Core Sizing Cards */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
                <span className="text-[11px] text-[#848E9C]">Risk Net (+Fee 0.1%)</span>
                <p className="font-mono tabular-nums mt-1 text-lg font-bold text-[#F6465D]">
                  {formatUsd(metrics.netRiskWithFeeUsdt)}
                </p>
                <span className="font-mono tabular-nums text-[10px] text-[#5E6673]">
                  Risk {formatUsd(metrics.riskAmountUsdt)} + Fee {formatUsd(metrics.estimatedFeeUsdt)}
                </span>
              </div>

              <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
                <span className="text-[11px] text-[#848E9C]">Position Size</span>
                <p className="font-mono tabular-nums mt-1 text-lg font-bold text-[#EAECEF]">
                  {formatUsd(metrics.positionSizeUsdt)}
                </p>
                <span className="font-mono tabular-nums text-[10px] text-[#5E6673]">
                  {formatQty(metrics.positionQty)} {coin.baseAsset}
                </span>
              </div>

              <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
                <span className="text-[11px] text-[#848E9C]">Margin Dibutuhkan</span>
                <p className="font-mono tabular-nums mt-1 text-base font-bold text-[#F0B90B]">
                  {formatUsd(metrics.marginRequiredUsdt)}
                </p>
                <span className="font-mono tabular-nums text-[10px] text-[#5E6673]">
                  SL Dist {metrics.stopDistancePercent.toFixed(2)}%
                </span>
              </div>

              <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
                <span className="text-[11px] text-[#848E9C]">Estimasi Likuidasi</span>
                <p
                  className={`font-mono tabular-nums mt-1 text-base font-bold ${
                    metrics.isLiquidationBeforeSl ? 'text-[#F6465D]' : 'text-[#EAECEF]'
                  }`}
                >
                  {formatPrice(metrics.estimatedLiquidation)}
                </p>
                <span className="font-mono tabular-nums text-[10px] text-[#5E6673]">
                  Jarak {metrics.liquidationDistancePercent.toFixed(2)}% (Max Aman {metrics.maxSafeLeverage}x)
                </span>
              </div>
            </div>

            {/* Fee-Adjusted Net R:R & Breakeven Win Rate */}
            <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-1 text-xs">
                <span className="text-[#848E9C]">Net R:R (Setelah Fee)</span>
                <span className="font-mono tabular-nums font-bold text-[#00C087]">
                  Blended 1 : {metrics.blendedNetRR.toFixed(2)} ({formatUsd(metrics.blendedNetRewardUsdt, true)})
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: 'TP1', rr: metrics.netRrTp1, pct: tpAlloc[0], usd: metrics.netRewardTp1Usdt },
                  { label: 'TP2', rr: metrics.netRrTp2, pct: tpAlloc[1], usd: metrics.netRewardTp2Usdt },
                  { label: 'TP3', rr: metrics.netRrTp3, pct: tpAlloc[2], usd: metrics.netRewardTp3Usdt },
                ].map((r) => (
                  <div key={r.label} className="rounded-lg bg-[#161A1E] p-2">
                    <span className="block text-[10px] text-[#848E9C]">
                      {r.label} ({r.pct}%)
                    </span>
                    <span className="font-mono tabular-nums block text-sm font-bold text-[#00C087]">
                      1:{r.rr.toFixed(2)}
                    </span>
                    <span className="font-mono tabular-nums block text-[10px] text-[#EAECEF]">
                      {formatUsd(r.usd, true)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-[#2B3139] pt-2 text-[11px]">
                <span className="text-[#848E9C]">Min. Win Rate Impas (Breakeven):</span>
                <span className="font-mono tabular-nums font-bold text-[#F0B90B]">
                  ≥ {metrics.breakevenWinRatePercent.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              id="btn-save-futures-setup"
              type="button"
              onClick={() => void handleSave()}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#F0B90B] px-4 text-xs font-bold text-[#0B0E11] transition hover:bg-[#F0B90B]/90"
            >
              <Save className="h-4 w-4" />
              Simpan ke Jurnal
            </button>
            <button
              type="button"
              onClick={() => void handleSendTelegramNow()}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#2B3139] bg-[#1E2329] px-4 text-xs font-semibold text-[#EAECEF] transition hover:border-[#F0B90B]/60 hover:text-[#F0B90B]"
            >
              <Send className="h-4 w-4" />
              Kirim Telegram
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
