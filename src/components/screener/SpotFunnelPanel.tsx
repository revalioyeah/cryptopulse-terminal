import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookmarkPlus,
  CandlestickChart,
  CheckCircle2,
  Filter,
  ShieldCheck,
  Star,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import type { SpotFunnelCandidate, SpotFunnelReport, SpotFunnelStage } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { useTradingStore } from '../../store/useTradingStore';
import { formatCompactUsd, formatPercent, formatPrice } from '../../utils/format';

interface SpotFunnelPanelProps {
  report: SpotFunnelReport | null;
  isScanning: boolean;
  onRunFunnel: () => void;
  onSaveSpotDca: (candidate: SpotFunnelCandidate) => void;
}

type FunnelFilterTab = SpotFunnelStage;

export function SpotFunnelPanel({
  report,
  isScanning,
  onRunFunnel,
  onSaveSpotDca,
}: SpotFunnelPanelProps) {
  const [activeStage, setActiveStage] = useState<FunnelFilterTab>('WATCHLIST_READY');
  const watchlist = useTradingStore((s) => s.watchlist);
  const toggleWatchlist = useTradingStore((s) => s.toggleWatchlist);
  const addToWatchlistBatch = useTradingStore((s) => s.addToWatchlistBatch);
  const openAnalysis = useAppStore((s) => s.openAnalysis);
  const openSetupForCoin = useAppStore((s) => s.openSetupForCoin);
  const pushToast = useAppStore((s) => s.pushToast);

  const watchSet = useMemo(() => new Set(watchlist), [watchlist]);

  const stageCounts = useMemo(() => {
    if (!report) {
      return {
        WATCHLIST_READY: 0,
        FAILED_TREND: 0,
        FAILED_TOKENOMICS: 0,
        FAILED_OUTPERFORMANCE: 0,
      };
    }
    const counts = {
      WATCHLIST_READY: 0,
      FAILED_TREND: 0,
      FAILED_TOKENOMICS: 0,
      FAILED_OUTPERFORMANCE: 0,
    };
    for (const c of report.candidates) {
      counts[c.stageReached] += 1;
    }
    return counts;
  }, [report]);

  const visibleList = useMemo(() => {
    if (!report) return [];
    return report.candidates.filter((c) => c.stageReached === activeStage).slice(0, 25);
  }, [report, activeStage]);

  const handleToggleStar = (cand: SpotFunnelCandidate) => {
    const added = toggleWatchlist(cand.symbol);
    pushToast(
      added ? `${cand.baseAsset} masuk Watchlist` : `${cand.baseAsset} dihapus dari Watchlist`,
      undefined,
      added ? 'success' : 'info',
    );
  };

  const handleAddAllWatchlist = () => {
    if (!report) return;
    const readySymbols = report.candidates
      .filter((c) => c.stageReached === 'WATCHLIST_READY')
      .map((c) => c.symbol);
    if (readySymbols.length === 0) return;
    const addedCount = addToWatchlistBatch(readySymbols);
    pushToast(
      addedCount > 0
        ? `${addedCount} Coin Ditambahkan ke Watchlist`
        : 'Semua Coin Lolos Sudah di Watchlist',
      `${readySymbols.length} kandidat Spot terbaik siap dipantau.`,
      addedCount > 0 ? 'success' : 'info',
    );
  };

  if (!report) {
    return (
      <div className="mt-4 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-xs font-semibold text-[#EAECEF]">
              <Filter className="h-4 w-4 text-[#F0B90B]" />
              Spot Funnel 100 Coin (Outperformance → Tokenomic → Trend → Layak Watchlist)
            </h3>
            <p className="mt-1 text-xs text-[#848E9C]">
              Menyaring Top 100 koin Binance Spot USDT secara bertahap: kekuatan relatif vs BTC
              (24h/7D/30D), kesehatan float MCap/FDV &amp; unlock, lalu struktur trend 1D + 4H real
              sebelum masuk Watchlist &amp; 3-Layer DCA.
            </p>
          </div>
          <button
            type="button"
            disabled={isScanning}
            onClick={onRunFunnel}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[#F0B90B] px-3.5 text-xs font-semibold text-[#0B0E11] transition hover:bg-[#F0B90B]/90 disabled:opacity-60"
          >
            <TrendingUp className="h-3.5 w-3.5" />
            <span>{isScanning ? 'Menyaring 100 Coin...' : 'Jalankan Funnel 100 Coin'}</span>
          </button>
        </div>
      </div>
    );
  }

  const funnelSteps = [
    {
      step: 'Universe',
      label: 'Top Market Cap',
      count: report.initialCount,
      accent: 'text-[#EAECEF]',
      border: 'border-[#2B3139]',
    },
    {
      step: 'Tahap 1',
      label: 'Outperformance vs BTC',
      count: report.afterOutperformance,
      accent: 'text-[#F0B90B]',
      border: 'border-[#F0B90B]/30',
    },
    {
      step: 'Tahap 2',
      label: 'Tokenomic (Float/FDV)',
      count: report.afterTokenomics,
      accent: 'text-[#38BDF8]',
      border: 'border-[#38BDF8]/30',
    },
    {
      step: 'Tahap 3',
      label: 'Trend 1D & 4H Real',
      count: report.afterTrend,
      accent: 'text-[#A78BFA]',
      border: 'border-[#A78BFA]/30',
    },
    {
      step: 'Tahap 4',
      label: 'Layak Watchlist',
      count: report.watchlistReady,
      accent: 'text-[#00C087]',
      border: 'border-[#00C087]/50 bg-[#00C087]/5',
    },
  ];

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3.5">
      {/* Funnel Header & BTC Benchmark */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-[#EAECEF]">
              <Filter className="h-3.5 w-3.5 text-[#F0B90B]" />
              Hasil Saringan Spot Funnel ({report.initialCount} Coin)
            </h3>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                report.isTokenomicsFallback
                  ? 'bg-[#F0B90B]/15 text-[#F0B90B]'
                  : 'bg-[#00C087]/15 text-[#00C087]'
              }`}
            >
              {report.isTokenomicsFallback
                ? 'Tokenomic Estimasi Fallback'
                : 'CoinGecko MCap/FDV + Binance 1D/4H Live'}
            </span>
          </div>
          <p className="font-mono tabular-nums mt-0.5 text-[11px] text-[#848E9C]">
            Benchmark BTC: 24h {formatPercent(report.btcBench24h)} · 7D{' '}
            {formatPercent(report.btcBench7d)} · 30D {formatPercent(report.btcBench30d)}
          </p>
        </div>

        {report.watchlistReady > 0 && (
          <button
            type="button"
            onClick={handleAddAllWatchlist}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#00C087]/50 bg-[#00C087]/10 px-3 text-xs font-semibold text-[#00C087] transition hover:bg-[#00C087] hover:text-[#0B0E11]"
          >
            <Star className="h-3.5 w-3.5" />
            <span>Tambah Semua ({report.watchlistReady}) ke Watchlist</span>
          </button>
        )}
      </div>

      {/* 4-Stage Visual Pipeline Strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {funnelSteps.map((s, idx) => (
          <div
            key={s.step}
            className={`relative rounded-xl border bg-[#161A1E] p-2.5 ${s.border}`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#848E9C]">
                {s.step}
              </span>
              {idx < funnelSteps.length - 1 && (
                <ArrowRight className="hidden h-3 w-3 text-[#5E6673] lg:block" />
              )}
            </div>
            <p className={`font-mono tabular-nums mt-1 text-lg font-bold ${s.accent}`}>
              {s.count}
              <span className="ml-1 text-[10px] font-normal text-[#5E6673]">coin</span>
            </p>
            <p className="truncate text-[11px] text-[#848E9C]">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Stage Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-[#2B3139] pt-2.5">
        {(
          [
            {
              id: 'WATCHLIST_READY' as FunnelFilterTab,
              label: `★ Layak Watchlist (${stageCounts.WATCHLIST_READY})`,
            },
            {
              id: 'FAILED_TREND' as FunnelFilterTab,
              label: `Gagal Trend (${stageCounts.FAILED_TREND})`,
            },
            {
              id: 'FAILED_TOKENOMICS' as FunnelFilterTab,
              label: `Gagal Tokenomic (${stageCounts.FAILED_TOKENOMICS})`,
            },
            {
              id: 'FAILED_OUTPERFORMANCE' as FunnelFilterTab,
              label: `Underperform BTC (${stageCounts.FAILED_OUTPERFORMANCE})`,
            },
          ]
        ).map((tab) => {
          const active = activeStage === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveStage(tab.id)}
              className={`min-h-[38px] rounded-lg border px-2.5 text-[11px] font-semibold transition ${
                active
                  ? tab.id === 'WATCHLIST_READY'
                    ? 'border-[#00C087] bg-[#00C087]/15 text-[#00C087]'
                    : 'border-[#F0B90B] bg-[#F0B90B]/15 text-[#F0B90B]'
                  : 'border-[#2B3139] bg-[#161A1E] text-[#848E9C] hover:text-[#EAECEF]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Candidates List */}
      {visibleList.length === 0 ? (
        <p className="py-5 text-center text-xs text-[#848E9C]">
          {activeStage === 'WATCHLIST_READY'
            ? 'Belum ada coin yang lolos ke-4 tahap ketat saat ini (market sedang lemah / di bawah EMA 1D). Cek tab "Gagal Trend" untuk melihat kandidat terdekat.'
            : 'Tidak ada coin pada kategori tahap ini.'}
        </p>
      ) : (
        <div className="cp-scrollbar max-h-96 space-y-2 overflow-y-auto pr-1">
          {visibleList.map((cand) => {
            const isStarred = watchSet.has(cand.symbol);
            const isReady = cand.stageReached === 'WATCHLIST_READY';

            return (
              <div
                key={cand.symbol}
                className={`rounded-xl border p-3 ${
                  isReady
                    ? 'border-[#00C087]/35 bg-[#161A1E]'
                    : 'border-[#2B3139] bg-[#161A1E]/75'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono tabular-nums rounded bg-[#0B0E11] px-1.5 py-0.5 text-[10px] text-[#848E9C]">
                        #{cand.marketCapRank}
                      </span>
                      <span className="text-sm font-bold text-[#EAECEF]">{cand.baseAsset}</span>
                      <span className="rounded bg-[#0B0E11] px-1.5 py-0.5 text-[10px] text-[#848E9C]">
                        {cand.sector}
                      </span>
                      {cand.tier && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            cand.tier === 'Core'
                              ? 'bg-[#00C087]/15 text-[#00C087]'
                              : cand.tier === 'Growth'
                                ? 'bg-[#F0B90B]/15 text-[#F0B90B]'
                                : 'bg-[#F6465D]/15 text-[#F6465D]'
                          }`}
                        >
                          {cand.tier}
                        </span>
                      )}
                      <span className="font-mono tabular-nums rounded bg-[#0B0E11] px-1.5 py-0.5 text-[10px] font-semibold text-[#F0B90B]">
                        Skor {cand.finalScore}/100
                      </span>
                    </div>

                    {/* 3 Stage Telemetry Pills */}
                    <div className="mt-2 grid grid-cols-1 gap-1.5 text-[11px] sm:grid-cols-3">
                      <div className="rounded-lg bg-[#0B0E11] px-2.5 py-1.5">
                        <span className="block text-[10px] text-[#5E6673]">
                          1. Outperformance vs BTC
                        </span>
                        <span
                          className={`font-mono tabular-nums font-semibold ${
                            cand.passedOutperformance ? 'text-[#00C087]' : 'text-[#F6465D]'
                          }`}
                        >
                          7D {formatPercent(cand.rsVsBtc7d, 1)} · 30D{' '}
                          {formatPercent(cand.rsVsBtc30d, 1)}
                        </span>
                      </div>

                      <div className="rounded-lg bg-[#0B0E11] px-2.5 py-1.5">
                        <span className="block text-[10px] text-[#5E6673]">
                          2. Tokenomic (MCap/FDV)
                        </span>
                        <span
                          className={`font-mono tabular-nums font-semibold ${
                            cand.passedTokenomics ? 'text-[#38BDF8]' : 'text-[#F6465D]'
                          }`}
                        >
                          Float {Math.round(cand.mcapFdvRatio * 100)}% · Vol{' '}
                          {formatCompactUsd(cand.quoteVolume24h)}
                        </span>
                      </div>

                      <div className="rounded-lg bg-[#0B0E11] px-2.5 py-1.5">
                        <span className="block text-[10px] text-[#5E6673]">
                          3. Trend 1D / 4H Real
                        </span>
                        {cand.trend1d ? (
                          <span
                            className={`font-mono tabular-nums font-semibold ${
                              cand.passedTrend ? 'text-[#00C087]' : 'text-[#F6465D]'
                            }`}
                          >
                            {cand.passedTrend && cand.highlights[2]
                              ? cand.highlights[2]
                              : `1D ${cand.trend1d} · 4H ${cand.trend4h} · RSI ${cand.rsi1d}`}
                          </span>
                        ) : (
                          <span className="text-[#5E6673]">Belum mencapai Tahap 3</span>
                        )}
                      </div>
                    </div>

                    {/* DCA Plan or Rejection Reason */}
                    {isReady && cand.projectedAvgEntry ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#848E9C]">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#00C087]" />
                        <span className="font-mono tabular-nums text-[#EAECEF]">
                          3-Layer DCA Avg {formatPrice(cand.projectedAvgEntry)}
                        </span>
                        <span className="font-mono tabular-nums">
                          · TP2 {formatPrice(cand.tp2 ?? cand.price)} (jual{' '}
                          {cand.sellPercentAtTp2?.toFixed(0)}% balik modal)
                        </span>
                      </div>
                    ) : cand.rejectReason ? (
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#F6465D]">
                        <XCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>{cand.rejectReason}</span>
                      </div>
                    ) : null}
                  </div>

                  {/* Price & Quick Actions */}
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <div className="text-right">
                      <p className="font-mono tabular-nums text-sm font-bold text-[#EAECEF]">
                        {formatPrice(cand.price)}
                      </p>
                      <span
                        className={`font-mono tabular-nums text-[11px] font-semibold ${
                          cand.change24h >= 0 ? 'text-[#00C087]' : 'text-[#F6465D]'
                        }`}
                      >
                        24h {formatPercent(cand.change24h)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleStar(cand)}
                        className={`inline-flex min-h-[40px] items-center gap-1 rounded-lg border px-2.5 text-[11px] font-semibold transition ${
                          isStarred
                            ? 'border-[#F0B90B]/60 bg-[#F0B90B]/15 text-[#F0B90B]'
                            : 'border-[#2B3139] bg-[#0B0E11] text-[#EAECEF] hover:border-[#F0B90B]/60'
                        }`}
                      >
                        <Star className={`h-3.5 w-3.5 ${isStarred ? 'fill-[#F0B90B]' : ''}`} />
                        <span>{isStarred ? 'Watchlist' : '+ Watch'}</span>
                      </button>

                      {isReady && (
                        <button
                          type="button"
                          onClick={() => onSaveSpotDca(cand)}
                          className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-[#00C087]/50 bg-[#00C087]/10 px-2.5 text-[11px] font-semibold text-[#00C087] transition hover:bg-[#00C087] hover:text-[#0B0E11]"
                        >
                          <BookmarkPlus className="h-3.5 w-3.5" />
                          <span>DCA</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => openAnalysis(cand.symbol)}
                        aria-label={`Analisa ${cand.baseAsset}`}
                        className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-[#2B3139] bg-[#0B0E11] px-2.5 text-[11px] font-medium text-[#EAECEF] transition hover:border-[#F0B90B]/60 hover:text-[#F0B90B]"
                      >
                        <CandlestickChart className="h-3.5 w-3.5" />
                        <span>Chart</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openSetupForCoin(cand.symbol, 'SPOT')}
                        aria-label={`Setup Spot ${cand.baseAsset}`}
                        className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-[#F0B90B]/15 px-2.5 text-[11px] font-semibold text-[#F0B90B] transition hover:bg-[#F0B90B] hover:text-[#0B0E11]"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>Setup</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
