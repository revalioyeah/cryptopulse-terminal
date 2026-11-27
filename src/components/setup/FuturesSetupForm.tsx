import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Crosshair,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
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
import type { PoiZone } from '../../services/indicators';
import {
  type EntryExecutionStyle,
  analyzeFuturesSetupReadiness,
  buildSmartFuturesLevels,
  getHigherTimeframeForSetup,
} from '../../services/setupAdvisor';
import { useAppStore } from '../../store/useAppStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTradingStore } from '../../store/useTradingStore';
import {
  formatPercent,
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
  const [entryStyle, setEntryStyle] = useState<EntryExecutionStyle>('POI_LIMIT');
  const [entryMode, setEntryMode] = useState<EntryMode>('LAYERING');
  const [activePoiLabel, setActivePoiLabel] = useState<string>('Menunggu kalkulasi POI...');
  const [accountEquity, setAccountEquity] = useState<number>(10000);
  const [riskPercent, setRiskPercent] = useState<number>(1.0);
  const [leverage, setLeverage] = useState<number>(5);

  const [entry1, setEntry1] = useState<number>(() => Number((coin.price * 0.988).toPrecision(6)));
  const [entry2, setEntry2] = useState<number>(() => Number((coin.price * 0.982).toPrecision(6)));
  const [entry3, setEntry3] = useState<number>(() => Number((coin.price * 0.976).toPrecision(6)));
  const [stopLoss, setStopLoss] = useState<number>(() => Number((coin.price * 0.964).toPrecision(6)));
  const [tp1, setTp1] = useState<number>(() => Number((coin.price * 1.022).toPrecision(6)));
  const [tp2, setTp2] = useState<number>(() => Number((coin.price * 1.048).toPrecision(6)));
  const [tp3, setTp3] = useState<number>(() => Number((coin.price * 1.08).toPrecision(6)));
  const [tpAlloc, setTpAlloc] = useState<[number, number, number]>([40, 35, 25]);
  const [confluences, setConfluences] = useState<string[]>([
    'Struktur HTF Searah',
    'Konfirmasi EMA 20/50',
  ]);
  const [notes, setNotes] = useState('');
  const [source, setSource] = useState<'Manual' | 'Backtest'>('Manual');

  // Real multi-timeframe Binance Klines via TanStack Query for Live SMC POI + Dual-Bias Audit
  const htfTf = getHigherTimeframeForSetup(timeframe);
  const primaryKlinesQuery = useBinanceKlinesQuery(coin.symbol, timeframe, 240, coin.price);
  const htfKlinesQuery = useBinanceKlinesQuery(coin.symbol, htfTf, 120, coin.price);
  const btcHtfKlinesQuery = useBinanceKlinesQuery('BTCUSDT', htfTf, 120, btcCoin?.price);

  const primaryCandles = primaryKlinesQuery.data?.candles ?? [];
  const htfCandles = htfKlinesQuery.data?.candles ?? [];
  const btcHtfCandles = btcHtfKlinesQuery.data?.candles ?? [];

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

  // Live Dual-Bias (LONG & SHORT) Setup Readiness & SMC POI Analysis
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

  // Real HTF BTC Beta Check
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

  const applySmartPoiSetup = (
    targetDir: TradeDirection,
    styleOverride?: EntryExecutionStyle,
    customPoi?: PoiZone,
    silent = false,
  ) => {
    const useStyle = styleOverride ?? entryStyle;
    const closed = primaryCandles.length > 60 ? primaryCandles.slice(0, -1) : primaryCandles;
    const smart = buildSmartFuturesLevels(closed, coin.price, targetDir, 1.5, useStyle, customPoi);

    setDirection(targetDir);
    setEntryStyle(useStyle);
    setEntryMode(smart.recommendedEntryMode);
    setActivePoiLabel(
      useStyle === 'POI_LIMIT'
        ? `Limit Pullback · ${smart.poiLabel} (${smart.poiDistancePercent >= 0 ? '+' : ''}${smart.poiDistancePercent}% dari Live)`
        : 'Eksekusi Market / Breakout Langsung',
    );
    setEntry1(Number(formatRawPrice(smart.entry1)));
    setEntry2(Number(formatRawPrice(smart.entry2)));
    setEntry3(Number(formatRawPrice(smart.entry3)));
    setStopLoss(Number(formatRawPrice(smart.stopLoss)));
    setTp1(Number(formatRawPrice(smart.tp1)));
    setTp2(Number(formatRawPrice(smart.tp2)));
    setTp3(Number(formatRawPrice(smart.tp3)));
    setLeverage(smart.recommendedLeverage);

    const dirChecklist =
      targetDir === 'LONG'
        ? readiness.longReadiness.autoChecklist
        : readiness.shortReadiness.autoChecklist;
    if (dirChecklist.length > 0) {
      setConfluences(dirChecklist);
    }

    setNotes(
      `${useStyle === 'POI_LIMIT' ? 'Limit POI' : 'Market'} ${targetDir} (${timeframe.toUpperCase()} / HTF ${htfTf.toUpperCase()} ${readiness.htfTrend}) · ${smart.poiLabel} · SL ${smart.slBasisLabel}`,
    );

    if (!silent) {
      pushToast(
        `${useStyle === 'POI_LIMIT' ? 'Limit POI' : 'Market'} ${targetDir} ${coin.baseAsset} Diterapkan`,
        `${smart.poiLabel} @ ${formatPrice(smart.entry1)} · SL ${formatPrice(smart.stopLoss)} · Safe Lev ${smart.recommendedLeverage}x`,
        'success',
      );
    }
  };

  // Auto-apply clean Limit POI setup when switching coin or when candles first load (respecting pending draft)
  useEffect(() => {
    if (pendingSetupDraft && pendingSetupDraft.symbol === coin.symbol && pendingSetupDraft.mode === 'FUTURES') {
      return;
    }
    if (primaryCandles.length > 40) {
      applySmartPoiSetup(readiness.recommendedDirection, 'POI_LIMIT', undefined, true);
      setSource('Manual');
    }
  }, [coin.symbol, primaryCandles.length > 40]); // eslint-disable-line react-hooks/exhaustive-deps

  // Consume optional draft forwarded from Scanner Pro or Active Journal
  useEffect(() => {
    if (!pendingSetupDraft || pendingSetupDraft.mode !== 'FUTURES' || pendingSetupDraft.symbol !== coin.symbol) {
      return;
    }
    const nextDir = pendingSetupDraft.direction ?? direction;
    setDirection(nextDir);
    if (pendingSetupDraft.timeframe) setTimeframe(pendingSetupDraft.timeframe);

    // If draft came from Audit POI shortcut (only symbol + dir + poi), build full smart Limit POI
    if (!pendingSetupDraft.stopLoss && primaryCandles.length > 40) {
      applySmartPoiSetup(nextDir, 'POI_LIMIT', undefined, true);
      clearPendingSetupDraft();
      return;
    }

    const e1 = pendingSetupDraft.entryPrice ?? coin.price;
    const mode = pendingSetupDraft.entryMode ?? (pendingSetupDraft.entry2 ? 'LAYERING' : 'SINGLE');
    setEntryMode(mode);
    setEntryStyle(pendingSetupDraft.poiLabel ? 'POI_LIMIT' : 'MARKET');
    setActivePoiLabel(
      pendingSetupDraft.poiLabel
        ? `Limit Pullback · ${pendingSetupDraft.poiLabel}`
        : 'Draft dari Scanner / Jurnal',
    );
    setEntry1(Number(formatRawPrice(e1)));
    if (pendingSetupDraft.entry2) setEntry2(Number(formatRawPrice(pendingSetupDraft.entry2)));
    if (pendingSetupDraft.entry3) setEntry3(Number(formatRawPrice(pendingSetupDraft.entry3)));

    if (pendingSetupDraft.stopLoss) {
      const sl = pendingSetupDraft.stopLoss;
      const dist = Math.abs(e1 - sl);
      setStopLoss(Number(formatRawPrice(sl)));
      setTp1(
        Number(
          formatRawPrice(
            pendingSetupDraft.tp1 ?? (nextDir === 'LONG' ? e1 + dist * 1.6 : e1 - dist * 1.6),
          ),
        ),
      );
      setTp2(
        Number(
          formatRawPrice(
            pendingSetupDraft.tp2 ?? (nextDir === 'LONG' ? e1 + dist * 2.5 : e1 - dist * 2.5),
          ),
        ),
      );
      setTp3(
        Number(
          formatRawPrice(
            pendingSetupDraft.tp3 ?? (nextDir === 'LONG' ? e1 + dist * 3.8 : e1 - dist * 3.8),
          ),
        ),
      );
    }
    if (pendingSetupDraft.notes) setNotes(pendingSetupDraft.notes);
    clearPendingSetupDraft();
  }, [pendingSetupDraft, coin.symbol, primaryCandles.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply 1-Click Backtest suggestion — automatically aligns to Limit POI when in POI_LIMIT mode!
  useEffect(() => {
    if (!appliedBacktest) return;
    setTimeframe(appliedBacktest.params.timeframe);
    setSource('Backtest');

    if (entryStyle === 'POI_LIMIT' && primaryCandles.length > 40) {
      const closed = primaryCandles.slice(0, -1);
      const smart = buildSmartFuturesLevels(
        closed,
        coin.price,
        appliedBacktest.suggestedDirection,
        appliedBacktest.params.atrMultiplier,
        'POI_LIMIT',
      );
      setDirection(appliedBacktest.suggestedDirection);
      setEntryMode('LAYERING');
      setActivePoiLabel(
        `Backtest + Limit POI · ${smart.poiLabel} (${smart.poiDistancePercent >= 0 ? '+' : ''}${smart.poiDistancePercent}% dari Live)`,
      );
      setEntry1(Number(formatRawPrice(smart.entry1)));
      setEntry2(Number(formatRawPrice(smart.entry2)));
      setEntry3(Number(formatRawPrice(smart.entry3)));
      setStopLoss(Number(formatRawPrice(smart.stopLoss)));
      setTp1(Number(formatRawPrice(smart.tp1)));
      setTp2(Number(formatRawPrice(smart.tp2)));
      setTp3(Number(formatRawPrice(smart.tp3)));
      setLeverage(smart.recommendedLeverage);
      setNotes(
        `Backtest ${appliedBacktest.params.strategy} (${appliedBacktest.params.timeframe.toUpperCase()} · Grade ${appliedBacktest.grade} · PF ${appliedBacktest.profitFactor}) + Limit ${smart.poiLabel}`,
      );
    } else {
      setDirection(appliedBacktest.suggestedDirection);
      setEntryMode('SINGLE');
      setActivePoiLabel('Backtest Market Execution');
      setEntry1(Number(formatRawPrice(appliedBacktest.suggestedEntry)));
      setStopLoss(Number(formatRawPrice(appliedBacktest.suggestedStopLoss)));
      setTp1(Number(formatRawPrice(appliedBacktest.suggestedTp1)));
      setTp2(Number(formatRawPrice(appliedBacktest.suggestedTp2)));
      setTp3(Number(formatRawPrice(appliedBacktest.suggestedTp3)));
      setNotes(
        `Backtest ${appliedBacktest.params.strategy} (${appliedBacktest.params.timeframe.toUpperCase()}) · Grade ${appliedBacktest.grade} · WR ${appliedBacktest.winRate}% · PF ${appliedBacktest.profitFactor}`,
      );
    }
    onClearApplied();
  }, [appliedBacktest, onClearApplied, entryStyle, primaryCandles, coin.price]);

  const handleDirectionSwitch = (nextDir: TradeDirection) => {
    setDirection(nextDir);
    if (primaryCandles.length > 40) {
      applySmartPoiSetup(nextDir, entryStyle, undefined, true);
      return;
    }
    const p = coin.price;
    setEntry1(Number(formatRawPrice(nextDir === 'LONG' ? p * 0.99 : p * 1.01)));
    setStopLoss(Number(formatRawPrice(nextDir === 'LONG' ? p * 0.97 : p * 1.03)));
    setTp1(Number(formatRawPrice(nextDir === 'LONG' ? p * 1.03 : p * 0.97)));
    setTp2(Number(formatRawPrice(nextDir === 'LONG' ? p * 1.06 : p * 0.94)));
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
    notes: notes.trim() || activePoiLabel,
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
      `${activePoiLabel} · Risk ${formatUsd(record.riskAmountUsdt)} · Net R:R TP2 1:${record.rrTp2.toFixed(2)}`,
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
      live: pct(coin.price),
      tp1: pct(tp1),
      tp2: pct(tp2),
      tp3: pct(tp3),
    };
  }, [metrics.estimatedLiquidation, stopLoss, metrics.avgEntry, coin.price, tp1, tp2, tp3]);

  const gradeBadgeStyle = (grade: string) =>
    grade === 'A+' || grade === 'A'
      ? 'border-[#00C087]/50 bg-[#00C087]/15 text-[#00C087]'
      : grade === 'B'
        ? 'border-[#F0B90B]/50 bg-[#F0B90B]/15 text-[#F0B90B]'
        : 'border-[#F6465D]/50 bg-[#F6465D]/15 text-[#F6465D]';

  const entryDistFromLivePct =
    coin.price > 0 && metrics.avgEntry > 0
      ? ((metrics.avgEntry - coin.price) / coin.price) * 100
      : 0;

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

      {/* Dual-Bias LONG vs SHORT Audit + Institutional SMC POI Zones (OB / FVG / OTE) */}
      <section aria-label="Audit Kesiapan Setup Live" className="cp-card space-y-3.5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2B3139] pb-3">
          <div className="flex items-start gap-2.5">
            <Cpu className="mt-0.5 h-5 w-5 shrink-0 text-[#F0B90B]" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-[#EAECEF]">
                  Audit Dual-Bias &amp; Zona POI SMC ({coin.baseAsset} · {timeframe.toUpperCase()})
                </h2>
                <span
                  className={`font-mono tabular-nums rounded-md border px-2 py-0.5 text-xs font-bold ${gradeBadgeStyle(
                    readiness.readinessGrade,
                  )}`}
                >
                  {direction}: Skor {readiness.readinessScore}/100 ({readiness.readinessGrade})
                </span>
                {readiness.poiAnalysis.liquiditySweep !== 'NONE' && (
                  <span className="rounded bg-[#38BDF8]/15 px-2 py-0.5 text-[10px] font-bold text-[#38BDF8]">
                    {readiness.poiAnalysis.liquiditySweep === 'BULLISH_SWEEP'
                      ? '⚡ Bullish Liquidity Sweep'
                      : '⚡ Bearish Liquidity Sweep'}
                  </span>
                )}
              </div>
              <p className="font-mono tabular-nums mt-0.5 text-[11px] text-[#848E9C]">
                HTF {htfTf.toUpperCase()}: {readiness.htfTrend} · BTC HTF: {readiness.btcHtfTrend} ·
                RSI {readiness.rsi14} · ADX {readiness.adx14} · Vol {readiness.volumeRatio}x ·{' '}
                {readiness.structureLabel}
                {readiness.divergence !== 'NONE' ? ` · ${readiness.divergence} RSI DIV` : ''}
              </p>
            </div>
          </div>

          {/* Entry Execution Mode Toggle: Limit Pullback POI vs Market */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-1">
              <button
                id="btn-style-poi"
                type="button"
                onClick={() => applySmartPoiSetup(direction, 'POI_LIMIT')}
                className={`min-h-[36px] rounded-lg px-2.5 text-[11px] font-semibold transition ${
                  entryStyle === 'POI_LIMIT'
                    ? 'bg-[#38BDF8] text-[#0B0E11]'
                    : 'text-[#848E9C] hover:text-[#EAECEF]'
                }`}
              >
                Limit Pullback (POI)
              </button>
              <button
                id="btn-style-market"
                type="button"
                onClick={() => applySmartPoiSetup(direction, 'MARKET')}
                className={`min-h-[36px] rounded-lg px-2.5 text-[11px] font-semibold transition ${
                  entryStyle === 'MARKET'
                    ? 'bg-[#F0B90B] text-[#0B0E11]'
                    : 'text-[#848E9C] hover:text-[#EAECEF]'
                }`}
              >
                Market / Breakout
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setConfluences(readiness.autoChecklist);
                pushToast(
                  'Checklist Disinkronkan',
                  `${readiness.autoChecklist.length}/6 konfluensi terdeteksi otomatis.`,
                  'info',
                );
              }}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#2B3139] bg-[#1E2329] px-3 text-xs font-medium text-[#EAECEF] transition hover:border-[#00C087]/60 hover:text-[#00C087]"
            >
              <Sparkles className="h-3.5 w-3.5 text-[#00C087]" />
              <span>Sync</span>
            </button>
          </div>
        </div>

        {/* Dual-Bias LONG vs SHORT Side-by-Side Comparison Cards */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {/* LONG Bias + Bullish POI Card */}
          <div
            className={`rounded-xl border p-3 ${
              readiness.recommendedDirection === 'LONG'
                ? 'border-[#00C087]/50 bg-[#00C087]/5'
                : 'border-[#2B3139] bg-[#0B0E11]'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#00C087]" />
                <span className="text-xs font-bold text-[#EAECEF]">Skenario LONG (Demand POI)</span>
                {readiness.recommendedDirection === 'LONG' && (
                  <span className="rounded bg-[#00C087]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#00C087]">
                    BIAS UTAMA
                  </span>
                )}
              </div>
              <span
                className={`font-mono tabular-nums rounded border px-1.5 py-0.5 text-[11px] font-bold ${gradeBadgeStyle(
                  readiness.longReadiness.grade,
                )}`}
              >
                {readiness.longReadiness.score}/100 ({readiness.longReadiness.grade})
              </span>
            </div>

            <div className="mt-2 space-y-1.5">
              {readiness.poiAnalysis.bullishZones.slice(0, 3).map((z) => (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => applySmartPoiSetup('LONG', 'POI_LIMIT', z)}
                  className="flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg border border-[#2B3139] bg-[#161A1E] px-2.5 py-1.5 text-left transition hover:border-[#00C087]/60"
                >
                  <div className="min-w-0">
                    <span className="block truncate text-[11px] font-semibold text-[#00C087]">
                      {z.kind}: {z.label}
                    </span>
                    <span className="font-mono tabular-nums block text-[10px] text-[#848E9C]">
                      Zona {formatPrice(z.zoneLow)} – {formatPrice(z.zoneHigh)} · SL &lt;{' '}
                      {formatPrice(z.invalidationPrice)}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="font-mono tabular-nums block text-[11px] font-bold text-[#EAECEF]">
                      {formatPrice(z.entryPrice)}
                    </span>
                    <span className="font-mono tabular-nums text-[10px] text-[#00C087]">
                      {formatPercent(z.distancePercent, 1)}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <button
              id="btn-smart-setup-long"
              type="button"
              onClick={() => applySmartPoiSetup('LONG', 'POI_LIMIT')}
              className="mt-2.5 inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-lg bg-[#00C087] px-3 text-xs font-bold text-[#0B0E11] transition hover:bg-[#00C087]/90"
            >
              <Crosshair className="h-3.5 w-3.5" />
              <span>Terapkan Limit LONG ({readiness.poiAnalysis.bestLongPoi.kind})</span>
            </button>
          </div>

          {/* SHORT Bias + Bearish POI Card */}
          <div
            className={`rounded-xl border p-3 ${
              readiness.recommendedDirection === 'SHORT'
                ? 'border-[#F6465D]/50 bg-[#F6465D]/5'
                : 'border-[#2B3139] bg-[#0B0E11]'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-[#F6465D]" />
                <span className="text-xs font-bold text-[#EAECEF]">Skenario SHORT (Supply POI)</span>
                {readiness.recommendedDirection === 'SHORT' && (
                  <span className="rounded bg-[#F6465D]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#F6465D]">
                    BIAS UTAMA
                  </span>
                )}
              </div>
              <span
                className={`font-mono tabular-nums rounded border px-1.5 py-0.5 text-[11px] font-bold ${gradeBadgeStyle(
                  readiness.shortReadiness.grade,
                )}`}
              >
                {readiness.shortReadiness.score}/100 ({readiness.shortReadiness.grade})
              </span>
            </div>

            <div className="mt-2 space-y-1.5">
              {readiness.poiAnalysis.bearishZones.slice(0, 3).map((z) => (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => applySmartPoiSetup('SHORT', 'POI_LIMIT', z)}
                  className="flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg border border-[#2B3139] bg-[#161A1E] px-2.5 py-1.5 text-left transition hover:border-[#F6465D]/60"
                >
                  <div className="min-w-0">
                    <span className="block truncate text-[11px] font-semibold text-[#F6465D]">
                      {z.kind}: {z.label}
                    </span>
                    <span className="font-mono tabular-nums block text-[10px] text-[#848E9C]">
                      Zona {formatPrice(z.zoneLow)} – {formatPrice(z.zoneHigh)} · SL &gt;{' '}
                      {formatPrice(z.invalidationPrice)}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="font-mono tabular-nums block text-[11px] font-bold text-[#EAECEF]">
                      {formatPrice(z.entryPrice)}
                    </span>
                    <span className="font-mono tabular-nums text-[10px] text-[#F6465D]">
                      {formatPercent(z.distancePercent, 1)}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <button
              id="btn-smart-setup-short"
              type="button"
              onClick={() => applySmartPoiSetup('SHORT', 'POI_LIMIT')}
              className="mt-2.5 inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-lg bg-[#F6465D] px-3 text-xs font-bold text-white transition hover:bg-[#F6465D]/90"
            >
              <Crosshair className="h-3.5 w-3.5" />
              <span>Terapkan Limit SHORT ({readiness.poiAnalysis.bestShortPoi.kind})</span>
            </button>
          </div>
        </div>

        {/* Active Direction Strengths & Warnings + Real HTF BTC Beta */}
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          <div className="space-y-1.5 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#00C087]">
              Konfluensi {direction} Aktif ({readiness.strengths.length})
            </span>
            {readiness.strengths.length === 0 ? (
              <p className="text-xs text-[#5E6673]">
                Belum ada konfluensi kuat untuk {direction}. Gunakan tombol Limit{' '}
                {readiness.recommendedDirection} di atas untuk edge terbaik.
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
                <span>
                  {btcBeta.label} — tidak ada bendera merah teknikal pada TF {timeframe.toUpperCase()}.
                </span>
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
          {/* Active POI Order Mode Banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#38BDF8]/35 bg-[#38BDF8]/8 px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <Crosshair className="h-4 w-4 shrink-0 text-[#38BDF8]" />
              <span className="font-semibold text-[#EAECEF]">{activePoiLabel}</span>
            </div>
            <span className="font-mono tabular-nums text-[11px] font-semibold text-[#38BDF8]">
              Avg Entry {formatPercent(entryDistFromLivePct, 2)} dari Live ({formatPrice(coin.price)})
            </span>
          </div>

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
                  {entryMode === 'SINGLE'
                    ? 'Limit Entry'
                    : 'Limit Entry 1 (40% · Tepi POI)'}
                </span>
                <button
                  type="button"
                  onClick={() => applySmartPoiSetup(direction, 'POI_LIMIT')}
                  className="font-mono tabular-nums text-[10px] font-semibold text-[#38BDF8] hover:underline"
                >
                  Reset ke POI
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
                <span className="text-[#F6465D]">Stop Loss (Invalidasi POI)</span>
                <button
                  type="button"
                  onClick={() => applySmartPoiSetup(direction, entryStyle)}
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
                  Limit Entry 2 (35% · Mid / 50% POI)
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
                  Limit Entry 3 (25% · Deep POI / OB Edge)
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
              placeholder="Alasan entry POI/OB, area invalidasi, manajemen risiko..."
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

            {/* Visual Trade Price Ladder (including Live Price marker vs Limit Entry) */}
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
                  <div
                    className="absolute top-0 h-full rounded-full bg-[#F6465D]/50"
                    style={{
                      left: `${Math.min(ladderBounds.sl, ladderBounds.entry)}%`,
                      width: `${Math.abs(ladderBounds.entry - ladderBounds.sl)}%`,
                    }}
                  />
                  <div
                    className="absolute top-0 h-full rounded-full bg-[#00C087]/50"
                    style={{
                      left: `${Math.min(ladderBounds.entry, ladderBounds.tp3)}%`,
                      width: `${Math.abs(ladderBounds.tp3 - ladderBounds.entry)}%`,
                    }}
                  />
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
                    title={`Avg Limit Entry: ${formatPrice(metrics.avgEntry)}`}
                    className="absolute -top-0.5 h-4 w-1.5 -translate-x-1/2 rounded bg-[#38BDF8]"
                    style={{ left: `${ladderBounds.entry}%` }}
                  />
                  <span
                    title={`Harga Live: ${formatPrice(coin.price)}`}
                    className="absolute -top-0.5 h-4 w-1 -translate-x-1/2 rounded bg-[#F0B90B]"
                    style={{ left: `${ladderBounds.live}%` }}
                  />
                  <span
                    title={`TP2: ${formatPrice(tp2)}`}
                    className="absolute -top-0.5 h-4 w-1.5 -translate-x-1/2 rounded bg-[#00C087]"
                    style={{ left: `${ladderBounds.tp2}%` }}
                  />
                </div>
                <div className="font-mono tabular-nums mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[10px]">
                  <span className="text-[#F6465D]">SL {formatPrice(stopLoss)}</span>
                  <span className="text-[#38BDF8]">Avg Limit {formatPrice(metrics.avgEntry)}</span>
                  <span className="text-[#F0B90B]">Live {formatPrice(coin.price)}</span>
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
                  Jarak {metrics.liquidationDistancePercent.toFixed(2)}% (Max Aman{' '}
                  {metrics.maxSafeLeverage}x)
                </span>
              </div>
            </div>

            {/* Fee-Adjusted Net R:R & Breakeven Win Rate */}
            <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-1 text-xs">
                <span className="text-[#848E9C]">Net R:R (Setelah Fee)</span>
                <span className="font-mono tabular-nums font-bold text-[#00C087]">
                  Blended 1 : {metrics.blendedNetRR.toFixed(2)} (
                  {formatUsd(metrics.blendedNetRewardUsdt, true)})
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
