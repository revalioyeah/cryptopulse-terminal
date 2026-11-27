import { useMemo, useState } from 'react';
import {
  BookOpen,
  BrainCircuit,
  CandlestickChart,
  Send,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import type { SetupStatus, SpotSetup, TradeSetup } from '../../types';
import { sendTelegramHtmlMessage } from '../../services/adapters/telegramAdapter';
import { useAppStore } from '../../store/useAppStore';
import { usePortfolioStore } from '../../store/usePortfolioStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTradingStore } from '../../store/useTradingStore';
import { formatDateTime, formatPercent, formatPrice, formatUsd } from '../../utils/format';
import { formatFuturesSetupTelegram, formatSpotSetupTelegram } from '../../utils/telegramFormatters';
import { ConfirmModal } from '../ui/ConfirmModal';

const STATUS_OPTIONS: SetupStatus[] = ['Waiting', 'Running', 'Hit TP', 'Hit SL'];

export function ActiveSetupJournal() {
  const futuresSetups = useTradingStore((s) => s.futuresSetups);
  const spotSetups = useTradingStore((s) => s.spotSetups);
  const updateFuturesSetupStatus = useTradingStore((s) => s.updateFuturesSetupStatus);
  const deleteFuturesSetup = useTradingStore((s) => s.deleteFuturesSetup);
  const updateSpotSetupStatus = useTradingStore((s) => s.updateSpotSetupStatus);
  const deleteSpotSetup = useTradingStore((s) => s.deleteSpotSetup);

  const coinsMap = useAppStore((s) => s.coinsMap);
  const openAnalysis = useAppStore((s) => s.openAnalysis);
  const openSetupForCoin = useAppStore((s) => s.openSetupForCoin);
  const pushToast = useAppStore((s) => s.pushToast);
  const openSettingsModal = useAppStore((s) => s.openSettingsModal);

  const addActivityLog = usePortfolioStore((s) => s.addActivityLog);
  const telegramConfig = useSettingsStore((s) => s.telegramConfig);

  const [journalTab, setJournalTab] = useState<'FUTURES' | 'SPOT'>('FUTURES');
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'FUTURES' | 'SPOT';
    id: string;
    label: string;
  } | null>(null);

  // Upgraded Summary Statistics + AI Journal Reviewer (Profit Factor, Expectancy R, Long vs Short)
  const stats = useMemo(() => {
    const closed = futuresSetups.filter((s) => s.status === 'Hit TP' || s.status === 'Hit SL');
    const wins = closed.filter((s) => (s.realizedPnlUsdt ?? 0) > 0);
    const losses = closed.filter((s) => (s.realizedPnlUsdt ?? 0) < 0);
    const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
    const activeRiskUsdt = futuresSetups
      .filter((s) => s.status === 'Waiting' || s.status === 'Running')
      .reduce((acc, s) => acc + s.riskAmountUsdt, 0);

    const grossProfit = wins.reduce((acc, s) => acc + (s.realizedPnlUsdt ?? 0), 0);
    const grossLoss = Math.abs(losses.reduce((acc, s) => acc + (s.realizedPnlUsdt ?? 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 3.5 : 0;
    const totalRealizedPnl = closed.reduce((acc, s) => acc + (s.realizedPnlUsdt ?? 0), 0);

    const totalR = closed.reduce((acc, s) => {
      const r = s.riskAmountUsdt > 0 ? (s.realizedPnlUsdt ?? 0) / s.riskAmountUsdt : 0;
      return acc + r;
    }, 0);
    const expectancyR = closed.length > 0 ? totalR / closed.length : 0;

    const longs = closed.filter((s) => s.direction === 'LONG');
    const shorts = closed.filter((s) => s.direction === 'SHORT');
    const longWr =
      longs.length > 0
        ? (longs.filter((s) => (s.realizedPnlUsdt ?? 0) > 0).length / longs.length) * 100
        : 0;
    const shortWr =
      shorts.length > 0
        ? (shorts.filter((s) => (s.realizedPnlUsdt ?? 0) > 0).length / shorts.length) * 100
        : 0;
    const longPnl = longs.reduce((acc, s) => acc + (s.realizedPnlUsdt ?? 0), 0);
    const shortPnl = shorts.reduce((acc, s) => acc + (s.realizedPnlUsdt ?? 0), 0);
    const counterTrendLosses = closed.filter(
      (s) => !s.btcBetaAligned && (s.realizedPnlUsdt ?? 0) < 0,
    ).length;

    let recommendation =
      'Catat minimal 3–5 trade selesai agar AI Journal Reviewer menghitung Expectancy & pola edge Anda.';
    if (closed.length >= 2) {
      if (counterTrendLosses > 0) {
        recommendation = `Terdeteksi ${counterTrendLosses} kerugian pada setup melawan HTF BTC. Aktifkan filter Wajib Searah BTC & disiplin pakai Smart Setup untuk mendongkrak Profit Factor (${profitFactor.toFixed(2)}).`;
      } else if (expectancyR < 0) {
        recommendation = `Expectancy saat ini ${expectancyR.toFixed(2)}R (negatif). Perketat minimal Net R:R ≥ 1:1.8 dan hindari entry di area Overextended RSI.`;
      } else if (longWr > shortWr + 15) {
        recommendation = `Edge LONG (${longWr.toFixed(0)}% WR, ${formatUsd(longPnl, true)}) unggul signifikan atas SHORT (${shortWr.toFixed(0)}% WR). Alokasikan ukuran risiko utama pada setup LONG searah HTF.`;
      } else if (shortWr > longWr + 15) {
        recommendation = `Eksekusi SHORT (${shortWr.toFixed(0)}% WR, ${formatUsd(shortPnl, true)}) lebih tajam. Perketat konfirmasi EMA/VWAP sebelum masuk LONG.`;
      } else {
        recommendation = `Konsistensi solid (PF ${profitFactor.toFixed(2)} · Expectancy ${expectancyR >= 0 ? '+' : ''}${expectancyR.toFixed(2)}R). Pertahankan disiplin split TP1–TP3 dan Daily Drawdown Guardrail.`;
      }
    }

    return {
      totalCount: futuresSetups.length + spotSetups.length,
      winRate,
      profitFactor,
      expectancyR,
      totalRealizedPnl,
      activeRiskUsdt,
      longWr,
      shortWr,
      longPnl,
      shortPnl,
      recommendation,
    };
  }, [futuresSetups, spotSetups]);

  const closeFuturesWithOutcome = (
    setup: TradeSetup,
    nextStatus: SetupStatus,
    customPnlUsdt?: number,
    outcomeLabel?: string,
  ) => {
    const prev = setup.status;
    updateFuturesSetupStatus(setup.id, nextStatus, customPnlUsdt);

    if ((nextStatus === 'Hit TP' || nextStatus === 'Hit SL') && (prev !== nextStatus || customPnlUsdt !== undefined)) {
      const pnl =
        customPnlUsdt !== undefined
          ? customPnlUsdt
          : nextStatus === 'Hit TP'
            ? Number((setup.riskAmountUsdt * setup.rrTp2).toFixed(2))
            : -setup.riskAmountUsdt;

      addActivityLog({
        category: 'FUTURES',
        action: nextStatus === 'Hit TP' ? 'FUTURES_HIT_TP' : 'FUTURES_HIT_SL',
        symbol: setup.symbol,
        baseAsset: setup.baseAsset,
        price: nextStatus === 'Hit TP' ? setup.takeProfits[1]?.price : setup.stopLoss,
        amountUsdt: setup.positionSizeUsdt,
        pnlUsdt: pnl,
        note: `Futures ${setup.direction} ${setup.symbol} ${outcomeLabel ?? nextStatus} (${pnl >= 0 ? '+' : ''}${formatUsd(pnl)})`,
        timestamp: Date.now(),
      });

      pushToast(
        `${setup.baseAsset} ditutup (${outcomeLabel ?? nextStatus})`,
        `Hasil PnL ${formatUsd(pnl, true)} tercatat otomatis di Rekap Historis.`,
        pnl >= 0 ? 'success' : 'warning',
      );
    }
  };

  const handleSendTelegram = async (item: TradeSetup | SpotSetup, type: 'FUTURES' | 'SPOT') => {
    if (!telegramConfig.botToken || !telegramConfig.chatId) {
      pushToast('Telegram Belum Diatur', 'Isi Bot Token & Chat ID di Settings & Backup.', 'warning');
      openSettingsModal();
      return;
    }
    const html =
      type === 'FUTURES'
        ? formatFuturesSetupTelegram(item as TradeSetup)
        : formatSpotSetupTelegram(item as SpotSetup);
    const res = await sendTelegramHtmlMessage(telegramConfig, html);
    pushToast(
      res.ok ? 'Terkirim ke Telegram' : 'Gagal Kirim Telegram',
      res.message,
      res.ok ? 'success' : 'error',
    );
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'FUTURES') {
      deleteFuturesSetup(deleteTarget.id);
    } else {
      deleteSpotSetup(deleteTarget.id);
    }
    pushToast('Setup Dihapus', `${deleteTarget.label} dihapus dari jurnal.`, 'info');
    setDeleteTarget(null);
  };

  return (
    <section aria-label="Active Setup Tracker dan Mini Journal" className="space-y-4">
      {/* KPI + AI Journal Reviewer */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:col-span-6">
          <div className="cp-card p-3.5">
            <span className="text-[11px] text-[#848E9C]">Total Setup</span>
            <p className="font-mono tabular-nums mt-1 text-xl font-bold text-[#EAECEF]">
              {stats.totalCount}
            </p>
            <span className="font-mono tabular-nums text-[10px] text-[#5E6673]">
              {futuresSetups.length} Fut · {spotSetups.length} Spot
            </span>
          </div>
          <div className="cp-card p-3.5">
            <span className="text-[11px] text-[#848E9C]">Win Rate</span>
            <p className="font-mono tabular-nums mt-1 text-xl font-bold text-[#00C087]">
              {stats.winRate.toFixed(1)}%
            </p>
            <span className="font-mono tabular-nums text-[10px] text-[#5E6673]">
              PF {stats.profitFactor.toFixed(2)}
            </span>
          </div>
          <div className="cp-card p-3.5">
            <span className="text-[11px] text-[#848E9C]">Expectancy</span>
            <p
              className={`font-mono tabular-nums mt-1 text-xl font-bold ${
                stats.expectancyR >= 0 ? 'text-[#00C087]' : 'text-[#F6465D]'
              }`}
            >
              {stats.expectancyR >= 0 ? '+' : ''}
              {stats.expectancyR.toFixed(2)}R
            </p>
            <span className="font-mono tabular-nums text-[10px] text-[#5E6673]">
              Net {formatUsd(stats.totalRealizedPnl, true)}
            </span>
          </div>
          <div className="cp-card p-3.5">
            <span className="text-[11px] text-[#848E9C]">Active Risk</span>
            <p className="font-mono tabular-nums mt-1 text-xl font-bold text-[#F0B90B]">
              {formatUsd(stats.activeRiskUsdt)}
            </p>
            <span className="text-[10px] text-[#5E6673]">Waiting + Running</span>
          </div>
        </div>

        <div className="cp-card p-4 xl:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-[#F0B90B]" />
              <h3 className="text-sm font-semibold text-[#EAECEF]">AI Journal Reviewer</h3>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="font-mono tabular-nums text-[#00C087]">
                LONG: {stats.longWr.toFixed(0)}% ({formatUsd(stats.longPnl, true)})
              </span>
              <span className="font-mono tabular-nums text-[#F6465D]">
                SHORT: {stats.shortWr.toFixed(0)}% ({formatUsd(stats.shortPnl, true)})
              </span>
            </div>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[#848E9C]">{stats.recommendation}</p>
        </div>
      </div>

      {/* Journal List */}
      <div className="cp-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[#F0B90B]" />
            <h2 className="text-sm font-semibold text-[#EAECEF]">
              Active Setup Tracker &amp; Mini Journal
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-1">
            <button
              type="button"
              onClick={() => setJournalTab('FUTURES')}
              className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold transition ${
                journalTab === 'FUTURES' ? 'bg-[#F0B90B] text-[#0B0E11]' : 'text-[#848E9C]'
              }`}
            >
              Futures ({futuresSetups.length})
            </button>
            <button
              type="button"
              onClick={() => setJournalTab('SPOT')}
              className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold transition ${
                journalTab === 'SPOT' ? 'bg-[#F0B90B] text-[#0B0E11]' : 'text-[#848E9C]'
              }`}
            >
              Spot DCA ({spotSetups.length})
            </button>
          </div>
        </div>

        {journalTab === 'FUTURES' ? (
          futuresSetups.length === 0 ? (
            <p className="py-6 text-center text-xs text-[#5E6673]">
              Belum ada setup Futures tersimpan.
            </p>
          ) : (
            <div className="space-y-2.5">
              {futuresSetups.map((item) => {
                const livePrice = coinsMap[item.symbol]?.price;
                const isOpen = item.status === 'Waiting' || item.status === 'Running';
                const livePnlUsdt =
                  livePrice && item.positionQty > 0
                    ? item.direction === 'LONG'
                      ? (livePrice - item.avgEntry) * item.positionQty
                      : (item.avgEntry - livePrice) * item.positionQty
                    : null;
                const liveR =
                  livePnlUsdt !== null && item.riskAmountUsdt > 0
                    ? livePnlUsdt / item.riskAmountUsdt
                    : null;
                const distToEntryPct =
                  livePrice && item.avgEntry > 0
                    ? ((livePrice - item.avgEntry) / item.avgEntry) * 100
                    : null;

                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3.5 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-bold text-[#EAECEF]">
                          {item.baseAsset}/USDT
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            item.direction === 'LONG'
                              ? 'bg-[#00C087]/15 text-[#00C087]'
                              : 'bg-[#F6465D]/15 text-[#F6465D]'
                          }`}
                        >
                          {item.direction} {item.leverage}x
                        </span>
                        <span className="rounded bg-[#1E2329] px-1.5 py-0.5 text-[10px] text-[#848E9C]">
                          {item.timeframe.toUpperCase()} · {item.source}
                        </span>
                        {livePrice && isOpen && (
                          <span className="font-mono tabular-nums rounded bg-[#161A1E] px-1.5 py-0.5 text-[10px] text-[#EAECEF]">
                            Live {formatPrice(livePrice)}
                          </span>
                        )}
                        {item.status === 'Running' && livePnlUsdt !== null && liveR !== null && (
                          <span
                            className={`font-mono tabular-nums rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              livePnlUsdt >= 0
                                ? 'bg-[#00C087]/15 text-[#00C087]'
                                : 'bg-[#F6465D]/15 text-[#F6465D]'
                            }`}
                          >
                            Unrealized {formatUsd(livePnlUsdt, true)} ({liveR >= 0 ? '+' : ''}
                            {liveR.toFixed(2)}R)
                          </span>
                        )}
                        {item.status === 'Waiting' && distToEntryPct !== null && (
                          <span className="font-mono tabular-nums rounded bg-[#F0B90B]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#F0B90B]">
                            Jarak Entry {formatPercent(distToEntryPct, 1)}
                          </span>
                        )}
                        <span className="font-mono tabular-nums text-[10px] text-[#5E6673]">
                          {formatDateTime(item.createdAt)}
                        </span>
                      </div>

                      <div className="font-mono tabular-nums flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        <span className="text-[#EAECEF]">Entry: {formatPrice(item.avgEntry)}</span>
                        <span className="text-[#F6465D]">SL: {formatPrice(item.stopLoss)}</span>
                        <span className="text-[#00C087]">
                          TP2: {formatPrice(item.takeProfits[1]?.price ?? 0)} (1:
                          {item.rrTp2.toFixed(2)})
                        </span>
                        <span className="text-[#F0B90B]">
                          Risk: {formatUsd(item.riskAmountUsdt)}
                        </span>
                        {item.realizedPnlUsdt !== undefined && (
                          <span
                            className={
                              item.realizedPnlUsdt >= 0
                                ? 'font-bold text-[#00C087]'
                                : 'font-bold text-[#F6465D]'
                            }
                          >
                            Realized: {formatUsd(item.realizedPnlUsdt, true)}
                          </span>
                        )}
                      </div>

                      {/* Quick Exact-Outcome Buttons when Running */}
                      {item.status === 'Running' && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[10px] text-[#848E9C]">Tutup cepat:</span>
                          <button
                            type="button"
                            onClick={() =>
                              closeFuturesWithOutcome(
                                item,
                                'Hit TP',
                                Number((item.riskAmountUsdt * item.rrTp1).toFixed(2)),
                                'Hit TP1',
                              )
                            }
                            className="font-mono tabular-nums min-h-[30px] rounded-md border border-[#00C087]/40 bg-[#00C087]/10 px-2 text-[10px] font-semibold text-[#00C087] hover:bg-[#00C087] hover:text-[#0B0E11]"
                          >
                            TP1 (+{item.rrTp1.toFixed(1)}R)
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              closeFuturesWithOutcome(
                                item,
                                'Hit TP',
                                Number((item.riskAmountUsdt * item.rrTp2).toFixed(2)),
                                'Hit TP2',
                              )
                            }
                            className="font-mono tabular-nums min-h-[30px] rounded-md border border-[#00C087]/40 bg-[#00C087]/10 px-2 text-[10px] font-semibold text-[#00C087] hover:bg-[#00C087] hover:text-[#0B0E11]"
                          >
                            TP2 (+{item.rrTp2.toFixed(1)}R)
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              closeFuturesWithOutcome(
                                item,
                                'Hit TP',
                                Number((item.riskAmountUsdt * item.rrTp3).toFixed(2)),
                                'Hit TP3',
                              )
                            }
                            className="font-mono tabular-nums min-h-[30px] rounded-md border border-[#00C087]/40 bg-[#00C087]/10 px-2 text-[10px] font-semibold text-[#00C087] hover:bg-[#00C087] hover:text-[#0B0E11]"
                          >
                            TP3 (+{item.rrTp3.toFixed(1)}R)
                          </button>
                          <button
                            type="button"
                            onClick={() => closeFuturesWithOutcome(item, 'Hit TP', 0, 'Breakeven')}
                            className="font-mono tabular-nums min-h-[30px] rounded-md border border-[#2B3139] bg-[#161A1E] px-2 text-[10px] font-semibold text-[#EAECEF] hover:border-[#F0B90B]"
                          >
                            BE (0R)
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              closeFuturesWithOutcome(item, 'Hit SL', -item.riskAmountUsdt, 'Hit SL')
                            }
                            className="font-mono tabular-nums min-h-[30px] rounded-md border border-[#F6465D]/40 bg-[#F6465D]/10 px-2 text-[10px] font-semibold text-[#F6465D] hover:bg-[#F6465D] hover:text-white"
                          >
                            SL (-1R)
                          </button>
                        </div>
                      )}

                      {item.notes && <p className="text-[11px] text-[#848E9C]">{item.notes}</p>}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <select
                        aria-label={`Status setup ${item.symbol}`}
                        value={item.status}
                        onChange={(e) =>
                          closeFuturesWithOutcome(item, e.target.value as SetupStatus)
                        }
                        className="min-h-[40px] rounded-lg border border-[#2B3139] bg-[#161A1E] px-2.5 text-xs font-semibold text-[#EAECEF]"
                      >
                        {STATUS_OPTIONS.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => openAnalysis(item.symbol)}
                        aria-label="Buka Chart"
                        title="Buka Chart Analisa"
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#2B3139] bg-[#161A1E] text-[#EAECEF] hover:border-[#F0B90B]/60 hover:text-[#F0B90B]"
                      >
                        <CandlestickChart className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          openSetupForCoin(item.symbol, 'FUTURES', {
                            direction: item.direction,
                            timeframe: item.timeframe,
                            entryPrice: item.avgEntry,
                            stopLoss: item.stopLoss,
                            tp1: item.takeProfits[0]?.price,
                            tp2: item.takeProfits[1]?.price,
                            tp3: item.takeProfits[2]?.price,
                            notes: item.notes,
                          })
                        }
                        aria-label="Muat ke Kalkulator"
                        title="Muat ke Kalkulator"
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#2B3139] bg-[#161A1E] text-[#EAECEF] hover:border-[#00C087]/60 hover:text-[#00C087]"
                      >
                        <SlidersHorizontal className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleSendTelegram(item, 'FUTURES')}
                        aria-label="Kirim ke Telegram"
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#2B3139] bg-[#161A1E] text-[#F0B90B] hover:border-[#F0B90B]/60"
                      >
                        <Send className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setDeleteTarget({
                            type: 'FUTURES',
                            id: item.id,
                            label: `Futures ${item.direction} ${item.symbol}`,
                          })
                        }
                        aria-label="Hapus setup"
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#2B3139] bg-[#161A1E] text-[#848E9C] hover:border-[#F6465D]/60 hover:text-[#F6465D]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : spotSetups.length === 0 ? (
          <p className="py-6 text-center text-xs text-[#5E6673]">
            Belum ada setup Spot DCA tersimpan. Beralih ke mode Spot (DCA &amp; Moonbag) untuk membuat rencana.
          </p>
        ) : (
          <div className="space-y-2.5">
            {spotSetups.map((item) => {
              const livePrice = coinsMap[item.symbol]?.price;
              const liveRoiPct =
                livePrice && item.projectedAvgEntry > 0
                  ? ((livePrice - item.projectedAvgEntry) / item.projectedAvgEntry) * 100
                  : null;
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3.5 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-bold text-[#EAECEF]">
                        {item.baseAsset}/USDT
                      </span>
                      <span className="rounded bg-[#F0B90B]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#F0B90B]">
                        Spot {item.tier} ({item.qualityScore}/100)
                      </span>
                      {livePrice && liveRoiPct !== null && (
                        <span
                          className={`font-mono tabular-nums rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            liveRoiPct >= 0
                              ? 'bg-[#00C087]/15 text-[#00C087]'
                              : 'bg-[#1E2329] text-[#EAECEF]'
                          }`}
                        >
                          Live {formatPrice(livePrice)} ({formatPercent(liveRoiPct, 1)} vs Avg)
                        </span>
                      )}
                      <span className="font-mono tabular-nums text-[10px] text-[#5E6673]">
                        {formatDateTime(item.createdAt)}
                      </span>
                    </div>
                    <div className="font-mono tabular-nums flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <span className="text-[#EAECEF]">Budget: {formatUsd(item.budgetUsdt)}</span>
                      <span className="text-[#00C087]">
                        Avg: {formatPrice(item.projectedAvgEntry)}
                      </span>
                      <span className="text-[#00C087]">
                        TP2: {formatPrice(item.tp2)} ({formatPercent(item.roiTp2Percent, 0)})
                      </span>
                      <span className="text-[#F0B90B]">
                        Moonbag @TP3: {formatUsd(item.moonbagValueAtTp3Usdt)}
                      </span>
                    </div>
                    {item.notes && <p className="text-[11px] text-[#848E9C]">{item.notes}</p>}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <select
                      value={item.status}
                      onChange={(e) =>
                        updateSpotSetupStatus(item.id, e.target.value as SetupStatus)
                      }
                      className="min-h-[40px] rounded-lg border border-[#2B3139] bg-[#161A1E] px-2.5 text-xs font-semibold text-[#EAECEF]"
                    >
                      {STATUS_OPTIONS.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => openAnalysis(item.symbol)}
                      aria-label="Buka Chart"
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#2B3139] bg-[#161A1E] text-[#EAECEF] hover:border-[#F0B90B]/60 hover:text-[#F0B90B]"
                    >
                      <CandlestickChart className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleSendTelegram(item, 'SPOT')}
                      aria-label="Kirim ke Telegram"
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#2B3139] bg-[#161A1E] text-[#F0B90B]"
                    >
                      <Send className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setDeleteTarget({
                          type: 'SPOT',
                          id: item.id,
                          label: `Spot DCA ${item.symbol}`,
                        })
                      }
                      aria-label="Hapus setup spot"
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#2B3139] bg-[#161A1E] text-[#848E9C] hover:text-[#F6465D]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Hapus Setup dari Jurnal?"
        description={`Anda yakin ingin menghapus ${deleteTarget?.label ?? ''}? Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
