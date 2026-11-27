import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Save, Send, ShieldAlert } from 'lucide-react';
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
import { sendTelegramHtmlMessage } from '../../services/adapters/telegramAdapter';
import { useAppStore } from '../../store/useAppStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTradingStore } from '../../store/useTradingStore';
import { formatPrice, formatQty, formatRawPrice, formatUsd, generateId } from '../../utils/format';
import { calculateFuturesRisk, evaluateBtcBetaAlignment } from '../../utils/riskCalc';
import { formatFuturesSetupTelegram } from '../../utils/telegramFormatters';

const CONFLUENCE_ITEMS = [
  'Struktur HTF Searah',
  'Harga di Key Support / Resistance',
  'Konfirmasi EMA 20/50',
  'Volume Spike / Orderflow Kuat',
  'RSI Tidak Overextended',
  'Funding Rate Sehat',
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

  const [direction, setDirection] = useState<TradeDirection>('LONG');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [entryMode, setEntryMode] = useState<EntryMode>('SINGLE');
  const [accountEquity, setAccountEquity] = useState<number>(10000);
  const [riskPercent, setRiskPercent] = useState<number>(1.0);
  const [leverage, setLeverage] = useState<number>(10);

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

  // Re-initialize default prices cleanly when selected coin changes
  useEffect(() => {
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
      `Backtest ${appliedBacktest.params.strategy} (${appliedBacktest.params.timeframe.toUpperCase()}) · Grade ${appliedBacktest.grade} · WR ${appliedBacktest.winRate}% · PF ${appliedBacktest.profitFactor}`,
    );
    onClearApplied();
  }, [appliedBacktest, onClearApplied]);

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
      }),
    [direction, entries, stopLoss, takeProfits, accountEquity, riskPercent, leverage],
  );

  const btcBeta = useMemo(
    () => evaluateBtcBetaAlignment(coin.symbol, direction, btcCoin?.priceChangePercent24h ?? 0),
    [coin.symbol, direction, btcCoin?.priceChangePercent24h],
  );

  const handleDirectionSwitch = (nextDir: TradeDirection) => {
    setDirection(nextDir);
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
    rrTp1: metrics.rrTp1,
    rrTp2: metrics.rrTp2,
    rrTp3: metrics.rrTp3,
    btcBetaAligned: btcBeta.aligned,
    confluenceChecks: confluences,
    notes: notes.trim(),
    status: 'Waiting',
    source,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const handleSave = async () => {
    if (!metrics.isValidSl) {
      pushToast('Stop Loss Tidak Valid', metrics.validationMessage, 'error');
      return;
    }
    const record = buildSetupRecord();
    addFuturesSetup(record);
    pushToast(
      `Setup ${record.direction} ${record.baseAsset} Disimpan`,
      `Risk ${formatUsd(record.riskAmountUsdt)} · R:R TP2 1:${record.rrTp2.toFixed(2)}`,
      'success',
    );

    if (telegramConfig.enabled && telegramConfig.autoSendFutures && telegramConfig.botToken && telegramConfig.chatId) {
      const res = await sendTelegramHtmlMessage(telegramConfig, formatFuturesSetupTelegram(record));
      if (res.ok) {
        pushToast('Terkirim ke Telegram', `Setup ${record.symbol} diteruskan otomatis.`, 'info');
      }
    }
  };

  const handleSendTelegramNow = async () => {
    if (!metrics.isValidSl) {
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
            </div>
            <p className="mt-0.5 text-xs text-[#848E9C]">
              {cooldownActive
                ? 'Batas kerugian harian tercapai! Hindari revenge trading atau turunkan risiko ke 0.5%.'
                : 'Disiplin risiko terjaga. Ubah batas maksimal Hit SL harian sesuai aturan akun Anda.'}
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
              pushToast('Risk Diturunkan ke 0.5%', 'Mode proteksi modal aktif pada kalkulator.', 'warning');
            }}
            className="min-h-[40px] rounded-lg border border-[#F0B90B]/60 bg-[#F0B90B]/15 px-3 text-xs font-semibold text-[#F0B90B] transition hover:bg-[#F0B90B] hover:text-[#0B0E11]"
          >
            1-Klik Risk 0.5%
          </button>
        </div>
      </div>

      {/* BTC Beta Check */}
      <div
        className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs ${
          btcBeta.aligned
            ? 'border-[#00C087]/40 bg-[#00C087]/8 text-[#EAECEF]'
            : 'border-[#F0B90B]/50 bg-[#F0B90B]/10 text-[#EAECEF]'
        }`}
      >
        {btcBeta.aligned ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#00C087]" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#F0B90B]" />
        )}
        <div>
          <span className="font-semibold">BTC Beta Check — {btcBeta.label}: </span>
          <span className="text-[#848E9C]">{btcBeta.detail}</span>
        </div>
      </div>

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
              <label htmlFor="fut-tf" className="mb-1 block text-[11px] font-medium uppercase text-[#848E9C]">
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
              <label className="mb-1 block text-[11px] text-[#848E9C]">Leverage (x)</label>
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value) || 1)}
                className="font-mono tabular-nums min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-sm font-semibold text-[#EAECEF]"
              />
            </div>
          </div>

          {/* Entry & Stop Loss */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] text-[#848E9C]">
                {entryMode === 'SINGLE' ? 'Harga Entry' : 'Entry 1 (40%)'}
              </label>
              <input
                type="number"
                step="any"
                value={entry1}
                onChange={(e) => setEntry1(Number(e.target.value) || 0)}
                className="font-mono tabular-nums min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-sm font-semibold text-[#EAECEF]"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-[#F6465D]">Stop Loss (SL)</label>
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
                <label className="mb-1 block text-[11px] text-[#848E9C]">Entry 2 (35%)</label>
                <input
                  type="number"
                  step="any"
                  value={entry2}
                  onChange={(e) => setEntry2(Number(e.target.value) || 0)}
                  className="font-mono tabular-nums min-h-[40px] w-full rounded-lg border border-[#2B3139] bg-[#161A1E] px-3 text-xs font-semibold text-[#EAECEF]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-[#848E9C]">Entry 3 (25%)</label>
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

          {/* Split TP1 - TP3 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: 'TP1', val: tp1, set: setTp1, allocIdx: 0 as const },
              { label: 'TP2', val: tp2, set: setTp2, allocIdx: 1 as const },
              { label: 'TP3', val: tp3, set: setTp3, allocIdx: 2 as const },
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
              </div>
            ))}
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

        {/* Right: Live Risk Output Panel */}
        <div className="cp-card flex flex-col justify-between p-4 xl:col-span-5">
          <div>
            <div className="flex items-center justify-between border-b border-[#2B3139] pb-3">
              <h3 className="text-sm font-semibold text-[#EAECEF]">Kalkulasi Risk &amp; Sizing Live</h3>
              <span className="font-mono tabular-nums rounded bg-[#0B0E11] px-2 py-0.5 text-xs font-bold text-[#F0B90B]">
                {coin.baseAsset} {leverage}x
              </span>
            </div>

            {metrics.validationMessage && (
              <div className="mt-3 rounded-xl border border-[#F6465D]/40 bg-[#F6465D]/10 p-2.5 text-xs text-[#F6465D]">
                {metrics.validationMessage}
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
                <span className="text-[11px] text-[#848E9C]">Risk Amount</span>
                <p className="font-mono tabular-nums mt-1 text-lg font-bold text-[#F6465D]">
                  {formatUsd(metrics.riskAmountUsdt)}
                </p>
                <span className="font-mono tabular-nums text-[10px] text-[#5E6673]">
                  SL Dist: {metrics.stopDistancePercent.toFixed(2)}%
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
                  Avg Entry {formatPrice(metrics.avgEntry)}
                </span>
              </div>

              <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
                <span className="text-[11px] text-[#848E9C]">Estimasi Likuidasi</span>
                <p className="font-mono tabular-nums mt-1 text-base font-bold text-[#F6465D]">
                  {formatPrice(metrics.estimatedLiquidation)}
                </p>
                <span className="text-[10px] text-[#5E6673]">Isolated Est.</span>
              </div>
            </div>

            {/* R:R Breakdown */}
            <div className="mt-3 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-[#848E9C]">Risk : Reward Breakdown</span>
                <span className="font-mono tabular-nums font-bold text-[#00C087]">
                  Blended 1 : {metrics.blendedRR.toFixed(2)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: 'TP1', rr: metrics.rrTp1, pct: tpAlloc[0] },
                  { label: 'TP2', rr: metrics.rrTp2, pct: tpAlloc[1] },
                  { label: 'TP3', rr: metrics.rrTp3, pct: tpAlloc[2] },
                ].map((r) => (
                  <div key={r.label} className="rounded-lg bg-[#161A1E] p-2">
                    <span className="block text-[10px] text-[#848E9C]">
                      {r.label} ({r.pct}%)
                    </span>
                    <span className="font-mono tabular-nums text-sm font-bold text-[#00C087]">
                      1:{r.rr.toFixed(2)}
                    </span>
                  </div>
                ))}
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
