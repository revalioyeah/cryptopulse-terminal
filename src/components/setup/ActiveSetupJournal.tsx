import { useMemo, useState } from 'react';
import { BookOpen, BrainCircuit, Send, Trash2 } from 'lucide-react';
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

  const addActivityLog = usePortfolioStore((s) => s.addActivityLog);
  const telegramConfig = useSettingsStore((s) => s.telegramConfig);
  const pushToast = useAppStore((s) => s.pushToast);
  const openSettingsModal = useAppStore((s) => s.openSettingsModal);

  const [journalTab, setJournalTab] = useState<'FUTURES' | 'SPOT'>('FUTURES');
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'FUTURES' | 'SPOT'; id: string; label: string } | null>(null);

  // Summary statistics + AI Journal Reviewer
  const stats = useMemo(() => {
    const closed = futuresSetups.filter((s) => s.status === 'Hit TP' || s.status === 'Hit SL');
    const wins = closed.filter((s) => s.status === 'Hit TP');
    const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
    const activeRiskUsdt = futuresSetups
      .filter((s) => s.status === 'Waiting' || s.status === 'Running')
      .reduce((acc, s) => acc + s.riskAmountUsdt, 0);

    const longs = closed.filter((s) => s.direction === 'LONG');
    const shorts = closed.filter((s) => s.direction === 'SHORT');
    const longWr = longs.length > 0 ? (longs.filter((s) => s.status === 'Hit TP').length / longs.length) * 100 : 0;
    const shortWr = shorts.length > 0 ? (shorts.filter((s) => s.status === 'Hit TP').length / shorts.length) * 100 : 0;
    const longPnl = longs.reduce((acc, s) => acc + (s.realizedPnlUsdt ?? 0), 0);
    const shortPnl = shorts.reduce((acc, s) => acc + (s.realizedPnlUsdt ?? 0), 0);
    const counterTrendLosses = closed.filter((s) => !s.btcBetaAligned && s.status === 'Hit SL').length;

    let recommendation = 'Catat minimal 3–5 trade selesai agar AI Journal Reviewer memberi diagnosa presisi.';
    if (closed.length >= 2) {
      if (counterTrendLosses > 0) {
        recommendation = `Terdeteksi ${counterTrendLosses} SL pada posisi melawan trend BTC. Prioritaskan setup searah BTC Beta untuk meningkatkan Win Rate.`;
      } else if (longWr > shortWr + 15) {
        recommendation = `Performa LONG (${longWr.toFixed(0)}% WR) jauh mengungguli SHORT (${shortWr.toFixed(0)}% WR). Fokuskan ukuran posisi utama pada setup LONG searah trend.`;
      } else if (shortWr > longWr + 15) {
        recommendation = `Eksekusi SHORT Anda lebih presisi (${shortWr.toFixed(0)}% WR). Pertimbangkan memperketat kriteria konfirmasi untuk setup LONG.`;
      } else {
        recommendation = `Keseimbangan Long/Short solid (WR total ${winRate.toFixed(0)}%). Pertahankan disiplin split TP1–TP3 dan Daily Drawdown Guardrail.`;
      }
    }

    return {
      totalCount: futuresSetups.length + spotSetups.length,
      winRate,
      activeRiskUsdt,
      longCount: longs.length,
      shortCount: shorts.length,
      longWr,
      shortWr,
      longPnl,
      shortPnl,
      recommendation,
    };
  }, [futuresSetups, spotSetups]);

  const handleFuturesStatusChange = (setup: TradeSetup, nextStatus: SetupStatus) => {
    const prev = setup.status;
    updateFuturesSetupStatus(setup.id, nextStatus);

    if ((nextStatus === 'Hit TP' || nextStatus === 'Hit SL') && prev !== nextStatus) {
      const pnl =
        nextStatus === 'Hit TP'
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
        note: `Futures ${setup.direction} ${setup.symbol} ${nextStatus} (${pnl >= 0 ? '+' : ''}${formatUsd(pnl)})`,
        timestamp: Date.now(),
      });

      pushToast(
        `${setup.baseAsset} ditandai ${nextStatus}`,
        `Hasil PnL ${formatUsd(pnl, true)} tercatat otomatis di Rekap Historis.`,
        nextStatus === 'Hit TP' ? 'success' : 'warning',
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
        <div className="grid grid-cols-3 gap-2.5 xl:col-span-5">
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
            <span className="text-[10px] text-[#5E6673]">Closed Futures</span>
          </div>
          <div className="cp-card p-3.5">
            <span className="text-[11px] text-[#848E9C]">Active Risk</span>
            <p className="font-mono tabular-nums mt-1 text-xl font-bold text-[#F0B90B]">
              {formatUsd(stats.activeRiskUsdt)}
            </p>
            <span className="text-[10px] text-[#5E6673]">Waiting + Running</span>
          </div>
        </div>

        <div className="cp-card p-4 xl:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-[#F0B90B]" />
              <h3 className="text-sm font-semibold text-[#EAECEF]">AI Journal Reviewer</h3>
            </div>
            <div className="flex items-center gap-3 text-xs">
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

      {/* Journal Table/Cards */}
      <div className="cp-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[#F0B90B]" />
            <h2 className="text-sm font-semibold text-[#EAECEF]">Active Setup Tracker &amp; Mini Journal</h2>
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
              {futuresSetups.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3.5 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-bold text-[#EAECEF]">{item.baseAsset}/USDT</span>
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
                      <span className="font-mono tabular-nums text-[10px] text-[#5E6673]">
                        {formatDateTime(item.createdAt)}
                      </span>
                    </div>

                    <div className="font-mono tabular-nums flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <span className="text-[#EAECEF]">Entry: {formatPrice(item.avgEntry)}</span>
                      <span className="text-[#F6465D]">SL: {formatPrice(item.stopLoss)}</span>
                      <span className="text-[#00C087]">
                        TP2: {formatPrice(item.takeProfits[1]?.price ?? 0)} (1:{item.rrTp2.toFixed(2)})
                      </span>
                      <span className="text-[#F0B90B]">Risk: {formatUsd(item.riskAmountUsdt)}</span>
                      {item.realizedPnlUsdt !== undefined && (
                        <span
                          className={
                            item.realizedPnlUsdt >= 0 ? 'font-bold text-[#00C087]' : 'font-bold text-[#F6465D]'
                          }
                        >
                          PnL: {formatUsd(item.realizedPnlUsdt, true)}
                        </span>
                      )}
                    </div>
                    {item.notes && <p className="text-[11px] text-[#848E9C]">{item.notes}</p>}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`Status setup ${item.symbol}`}
                      value={item.status}
                      onChange={(e) => handleFuturesStatusChange(item, e.target.value as SetupStatus)}
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
              ))}
            </div>
          )
        ) : spotSetups.length === 0 ? (
          <p className="py-6 text-center text-xs text-[#5E6673]">
            Belum ada setup Spot DCA tersimpan. Beralih ke mode Spot (DCA &amp; Moonbag) untuk membuat rencana.
          </p>
        ) : (
          <div className="space-y-2.5">
            {spotSetups.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3.5 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-bold text-[#EAECEF]">{item.baseAsset}/USDT</span>
                    <span className="rounded bg-[#F0B90B]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#F0B90B]">
                      Spot {item.tier} ({item.qualityScore}/100)
                    </span>
                    <span className="font-mono tabular-nums text-[10px] text-[#5E6673]">
                      {formatDateTime(item.createdAt)}
                    </span>
                  </div>
                  <div className="font-mono tabular-nums flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span className="text-[#EAECEF]">Budget: {formatUsd(item.budgetUsdt)}</span>
                    <span className="text-[#00C087]">Avg: {formatPrice(item.projectedAvgEntry)}</span>
                    <span className="text-[#00C087]">
                      TP2: {formatPrice(item.tp2)} ({formatPercent(item.roiTp2Percent, 0)})
                    </span>
                    <span className="text-[#F0B90B]">
                      Moonbag @TP3: {formatUsd(item.moonbagValueAtTp3Usdt)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={item.status}
                    onChange={(e) => updateSpotSetupStatus(item.id, e.target.value as SetupStatus)}
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
            ))}
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
