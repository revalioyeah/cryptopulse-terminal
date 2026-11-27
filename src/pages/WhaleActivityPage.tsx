import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CandlestickChart,
  Flame,
  Pause,
  Play,
  RefreshCw,
  Waves,
} from 'lucide-react';
import type { WhaleTxType } from '../types';
import { useWhaleStream } from '../hooks/useWhaleStream';
import { MONITORED_WHALE_PAIRS } from '../services/adapters/whaleAdapter';
import { useAppStore } from '../store/useAppStore';
import { formatCompactUsd, formatPrice, formatQty, formatShortTime } from '../utils/format';

type MinUsdFilter = 25_000 | 50_000 | 100_000 | 250_000 | 500_000;

const MIN_FILTERS: Array<{ value: MinUsdFilter; label: string }> = [
  { value: 25_000, label: '≥$25K' },
  { value: 50_000, label: '≥$50K' },
  { value: 100_000, label: '≥$100K' },
  { value: 250_000, label: '≥$250K' },
  { value: 500_000, label: '≥$500K' },
];

const TYPE_FILTERS: Array<{ value: WhaleTxType | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'Semua Arah' },
  { value: 'WHALE_BUY', label: 'Taker Buy (Akumulasi)' },
  { value: 'WHALE_SELL', label: 'Taker Sell (Distribusi)' },
];

export function WhaleActivityPage() {
  const { transactions, loading, streamStatus, paused, refreshSnapshot, togglePause } = useWhaleStream();
  const openAnalysis = useAppStore((s) => s.openAnalysis);

  const [minUsd, setMinUsd] = useState<MinUsdFilter>(25_000);
  const [typeFilter, setTypeFilter] = useState<WhaleTxType | 'ALL'>('ALL');

  const {
    topAccumulation,
    topDistribution,
    totalBuyUsd,
    totalSellUsd,
    netFlowUsd,
    buyPressurePct,
    megaBlockCount,
  } = useMemo(() => {
    const accMap = new Map<string, { symbol: string; baseAsset: string; usd: number; count: number }>();
    const distMap = new Map<string, { symbol: string; baseAsset: string; usd: number; count: number }>();
    let buySum = 0;
    let sellSum = 0;
    let megaCount = 0;

    for (const tx of transactions) {
      if (tx.isMegaBlock) megaCount += 1;
      if (tx.type === 'WHALE_BUY') {
        buySum += tx.amountUsd;
        const cur = accMap.get(tx.symbol) ?? { symbol: tx.symbol, baseAsset: tx.baseAsset, usd: 0, count: 0 };
        cur.usd += tx.amountUsd;
        cur.count += 1;
        accMap.set(tx.symbol, cur);
      } else {
        sellSum += tx.amountUsd;
        const cur = distMap.get(tx.symbol) ?? { symbol: tx.symbol, baseAsset: tx.baseAsset, usd: 0, count: 0 };
        cur.usd += tx.amountUsd;
        cur.count += 1;
        distMap.set(tx.symbol, cur);
      }
    }

    const total = buySum + sellSum;
    return {
      topAccumulation: Array.from(accMap.values())
        .sort((a, b) => b.usd - a.usd)
        .slice(0, 5),
      topDistribution: Array.from(distMap.values())
        .sort((a, b) => b.usd - a.usd)
        .slice(0, 5),
      totalBuyUsd: buySum,
      totalSellUsd: sellSum,
      netFlowUsd: buySum - sellSum,
      buyPressurePct: total > 0 ? (buySum / total) * 100 : 50,
      megaBlockCount: megaCount,
    };
  }, [transactions]);

  const filteredTx = useMemo(() => {
    return transactions.filter((tx) => {
      if (tx.amountUsd < minUsd) return false;
      if (typeFilter !== 'ALL' && tx.type !== typeFilter) return false;
      return true;
    });
  }, [transactions, minUsd, typeFilter]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[#EAECEF] sm:text-2xl">
              Whale Orderflow Tracker
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-[#00C087]/15 px-2 py-0.5 text-[10px] font-bold text-[#00C087]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00C087]" />
              BINANCE AGGTRADE LIVE
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[#848E9C]">
            Eksekusi block order besar real-time (≥$25K) langsung dari tape {MONITORED_WHALE_PAIRS.length} pair utama Binance Spot — 100% data aktual tanpa simulasi.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void refreshSnapshot()}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-[#2B3139] bg-[#161A1E] px-3.5 text-xs font-semibold text-[#EAECEF] transition hover:border-[#F0B90B]/60 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-[#F0B90B]' : ''}`} />
            <span>Muat Ulang</span>
          </button>

          <button
            id="btn-whale-pause"
            type="button"
            onClick={togglePause}
            className={`inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 text-xs font-semibold transition ${
              paused
                ? 'bg-[#00C087] text-[#0B0E11] hover:bg-[#00C087]/90'
                : 'border border-[#F0B90B]/60 bg-[#F0B90B]/15 text-[#F0B90B] hover:bg-[#F0B90B]/25'
            }`}
          >
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            <span>{paused ? 'Lanjutkan Stream' : 'Jeda Stream'}</span>
          </button>
        </div>
      </div>

      {/* Live Tape Flow Summary Strip */}
      <section className="cp-card p-4">
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
            <span className="text-[11px] text-[#848E9C]">Taker Buy Flow (Akumulasi)</span>
            <p className="font-mono tabular-nums mt-1 text-lg font-bold text-[#00C087]">
              +{formatCompactUsd(totalBuyUsd)}
            </p>
          </div>
          <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
            <span className="text-[11px] text-[#848E9C]">Taker Sell Flow (Distribusi)</span>
            <p className="font-mono tabular-nums mt-1 text-lg font-bold text-[#F6465D]">
              -{formatCompactUsd(totalSellUsd)}
            </p>
          </div>
          <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
            <span className="text-[11px] text-[#848E9C]">Net Whale Delta</span>
            <p
              className={`font-mono tabular-nums mt-1 text-lg font-bold ${
                netFlowUsd >= 0 ? 'text-[#00C087]' : 'text-[#F6465D]'
              }`}
            >
              {netFlowUsd >= 0 ? '+' : '-'}
              {formatCompactUsd(Math.abs(netFlowUsd))}
            </p>
          </div>
          <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
            <span className="text-[11px] text-[#848E9C]">Mega Block (≥$250K)</span>
            <p className="font-mono tabular-nums mt-1 text-lg font-bold text-[#F0B90B]">
              {megaBlockCount} order
            </p>
          </div>
        </div>

        {/* Dominance Bar */}
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="font-mono tabular-nums font-semibold text-[#00C087]">
              Buy Pressure {buyPressurePct.toFixed(1)}%
            </span>
            <span className="text-[#848E9C]">Dominasi Tape Real-Time</span>
            <span className="font-mono tabular-nums font-semibold text-[#F6465D]">
              Sell Pressure {(100 - buyPressurePct).toFixed(1)}%
            </span>
          </div>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#1E2329]">
            <div className="h-full bg-[#00C087] transition-all" style={{ width: `${buyPressurePct}%` }} />
            <div
              className="h-full bg-[#F6465D] transition-all"
              style={{ width: `${100 - buyPressurePct}%` }}
            />
          </div>
        </div>
      </section>

      {/* Top 5 Accumulation vs Top 5 Distribution */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="cp-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-[#00C087]" />
              <h2 className="text-sm font-semibold text-[#EAECEF]">
                Top 5 Akumulasi (Aggressive Taker Buy)
              </h2>
            </div>
            <span className="rounded bg-[#00C087]/15 px-2 py-0.5 text-[10px] font-bold text-[#00C087]">
              BULLISH FLOW
            </span>
          </div>

          <div className="space-y-2">
            {topAccumulation.length === 0 ? (
              <p className="py-5 text-center text-xs text-[#5E6673]">
                {loading ? 'Memuat eksekusi block buy dari Binance...' : 'Belum ada block buy tertangkap.'}
              </p>
            ) : (
              topAccumulation.map((row, idx) => (
                <button
                  key={row.symbol}
                  type="button"
                  onClick={() => openAnalysis(row.symbol)}
                  className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 py-2 text-left transition hover:border-[#00C087]/50"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono tabular-nums w-4 text-xs text-[#5E6673]">
                      {idx + 1}
                    </span>
                    <span className="text-sm font-bold text-[#EAECEF]">{row.baseAsset}</span>
                    <span className="font-mono tabular-nums text-[11px] text-[#848E9C]">
                      {row.count} order
                    </span>
                  </div>
                  <span className="font-mono tabular-nums text-sm font-bold text-[#00C087]">
                    +{formatCompactUsd(row.usd)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="cp-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowDownLeft className="h-4 w-4 text-[#F6465D]" />
              <h2 className="text-sm font-semibold text-[#EAECEF]">
                Top 5 Distribusi (Aggressive Taker Sell)
              </h2>
            </div>
            <span className="rounded bg-[#F6465D]/15 px-2 py-0.5 text-[10px] font-bold text-[#F6465D]">
              SELL PRESSURE
            </span>
          </div>

          <div className="space-y-2">
            {topDistribution.length === 0 ? (
              <p className="py-5 text-center text-xs text-[#5E6673]">
                {loading ? 'Memuat eksekusi block sell dari Binance...' : 'Belum ada block sell tertangkap.'}
              </p>
            ) : (
              topDistribution.map((row, idx) => (
                <button
                  key={row.symbol}
                  type="button"
                  onClick={() => openAnalysis(row.symbol)}
                  className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 py-2 text-left transition hover:border-[#F6465D]/50"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono tabular-nums w-4 text-xs text-[#5E6673]">
                      {idx + 1}
                    </span>
                    <span className="text-sm font-bold text-[#EAECEF]">{row.baseAsset}</span>
                    <span className="font-mono tabular-nums text-[11px] text-[#848E9C]">
                      {row.count} order
                    </span>
                  </div>
                  <span className="font-mono tabular-nums text-sm font-bold text-[#F6465D]">
                    -{formatCompactUsd(row.usd)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="cp-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-medium uppercase text-[#848E9C]">Nominal:</span>
          {MIN_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setMinUsd(f.value)}
              className={`font-mono tabular-nums min-h-[40px] rounded-lg px-3 text-xs font-semibold transition ${
                minUsd === f.value
                  ? 'bg-[#F0B90B] text-[#0B0E11]'
                  : 'border border-[#2B3139] bg-[#0B0E11] text-[#848E9C] hover:text-[#EAECEF]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setTypeFilter(f.value)}
              className={`min-h-[40px] rounded-lg border px-3 text-xs font-medium transition ${
                typeFilter === f.value
                  ? 'border-[#F0B90B] bg-[#F0B90B]/15 text-[#F0B90B]'
                  : 'border-[#2B3139] bg-[#0B0E11] text-[#848E9C] hover:text-[#EAECEF]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {/* Live Whale Block Trades Feed */}
      <section aria-label="Live Whale Transactions" className="cp-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Waves className="h-4 w-4 text-[#F0B90B]" />
            <h2 className="text-sm font-semibold text-[#EAECEF]">Live Binance Institutional Tape</h2>
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                paused
                  ? 'bg-[#1E2329] text-[#848E9C]'
                  : streamStatus === 'connected'
                    ? 'bg-[#00C087]/15 text-[#00C087]'
                    : 'bg-[#F0B90B]/15 text-[#F0B90B]'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  paused
                    ? 'bg-[#848E9C]'
                    : streamStatus === 'connected'
                      ? 'animate-pulse bg-[#00C087]'
                      : 'bg-[#F0B90B]'
                }`}
              />
              {paused
                ? 'DIJEDA'
                : streamStatus === 'connected'
                  ? 'WS STREAMING'
                  : 'MENYAMBUNG...'}
            </span>
          </div>
          <span className="font-mono tabular-nums text-xs text-[#848E9C]">
            {filteredTx.length} eksekusi real
          </span>
        </div>

        <div className="space-y-2">
          {loading && filteredTx.length === 0 ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-xl border border-[#2B3139] bg-[#0B0E11]"
                />
              ))}
            </div>
          ) : filteredTx.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#5E6673]">
              Belum ada block trade yang memenuhi filter nominal ≥{formatCompactUsd(minUsd)}. Coba turunkan filter ke ≥$25K atau tunggu order besar berikutnya masuk.
            </p>
          ) : (
            filteredTx.map((tx) => {
              const isBuy = tx.type === 'WHALE_BUY';
              const Icon = isBuy ? ArrowUpRight : ArrowDownLeft;

              return (
                <div
                  key={tx.id}
                  className={`flex flex-col gap-2.5 rounded-xl border bg-[#0B0E11] p-3.5 sm:flex-row sm:items-center sm:justify-between ${
                    tx.isMegaBlock ? 'border-[#F0B90B]/45' : 'border-[#2B3139]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-[#EAECEF]">{tx.baseAsset}/USDT</span>
                      <span
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold ${
                          isBuy
                            ? 'bg-[#00C087]/15 text-[#00C087]'
                            : 'bg-[#F6465D]/15 text-[#F6465D]'
                        }`}
                      >
                        <Icon className="h-3 w-3" />
                        {isBuy ? 'Taker Buy (Akumulasi)' : 'Taker Sell (Distribusi)'}
                      </span>
                      {tx.isMegaBlock && (
                        <span className="inline-flex items-center gap-1 rounded bg-[#F0B90B]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#F0B90B]">
                          <Flame className="h-3 w-3" />
                          MEGA BLOCK
                        </span>
                      )}
                      <span className="rounded bg-[#1E2329] px-1.5 py-0.5 text-[10px] text-[#848E9C]">
                        {tx.blockchain}
                      </span>
                      <span className="font-mono tabular-nums text-[10px] text-[#5E6673]">
                        {formatShortTime(tx.timestamp)}
                      </span>
                    </div>

                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#848E9C]">
                      <span>
                        Harga Eksekusi:{' '}
                        <strong className="font-mono tabular-nums text-[#EAECEF]">
                          {formatPrice(tx.price)}
                        </strong>
                      </span>
                      <span className="text-[#5E6673]">·</span>
                      <span>
                        {tx.fromLabel} → <span className="text-[#EAECEF]">{tx.toLabel}</span>
                      </span>
                      <span className="font-mono text-[10px] text-[#5E6673]">{tx.txHash}</span>
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <div className="text-left sm:text-right">
                      <p
                        className={`font-mono tabular-nums text-base font-bold ${
                          isBuy ? 'text-[#00C087]' : 'text-[#F6465D]'
                        }`}
                      >
                        {formatCompactUsd(tx.amountUsd)}
                      </p>
                      <p className="font-mono tabular-nums text-[11px] text-[#848E9C]">
                        {formatQty(tx.amount)} {tx.baseAsset}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => openAnalysis(tx.symbol)}
                      aria-label={`Analisa ${tx.baseAsset}`}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#2B3139] bg-[#161A1E] text-[#EAECEF] transition hover:border-[#F0B90B]/60 hover:text-[#F0B90B]"
                    >
                      <CandlestickChart className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
