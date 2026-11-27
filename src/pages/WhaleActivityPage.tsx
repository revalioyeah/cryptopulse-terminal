import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CandlestickChart,
  Pause,
  Play,
  Waves,
} from 'lucide-react';
import type { WhaleTxType } from '../types';
import { useWhaleStream } from '../hooks/useWhaleStream';
import { useAppStore } from '../store/useAppStore';
import { formatCompactUsd, formatQty, formatShortTime } from '../utils/format';

type MinUsdFilter = 0 | 500_000 | 1_000_000 | 5_000_000;

const MIN_FILTERS: Array<{ value: MinUsdFilter; label: string }> = [
  { value: 0, label: 'Semua' },
  { value: 500_000, label: '>$500K' },
  { value: 1_000_000, label: '>$1M' },
  { value: 5_000_000, label: '>$5M' },
];

const TYPE_FILTERS: Array<{ value: WhaleTxType | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'Semua Jenis' },
  { value: 'EXCHANGE_OUTFLOW', label: 'Exchange Outflow' },
  { value: 'EXCHANGE_INFLOW', label: 'Exchange Inflow' },
  { value: 'WALLET_TRANSFER', label: 'Wallet Transfer' },
];

export function WhaleActivityPage() {
  const { transactions, paused, togglePause } = useWhaleStream();
  const openAnalysis = useAppStore((s) => s.openAnalysis);

  const [minUsd, setMinUsd] = useState<MinUsdFilter>(500_000);
  const [typeFilter, setTypeFilter] = useState<WhaleTxType | 'ALL'>('ALL');

  const { topAccumulation, topDistribution } = useMemo(() => {
    const accMap = new Map<string, { symbol: string; baseAsset: string; usd: number; count: number }>();
    const distMap = new Map<string, { symbol: string; baseAsset: string; usd: number; count: number }>();

    for (const tx of transactions) {
      if (tx.type === 'EXCHANGE_OUTFLOW') {
        const cur = accMap.get(tx.symbol) ?? { symbol: tx.symbol, baseAsset: tx.baseAsset, usd: 0, count: 0 };
        cur.usd += tx.amountUsd;
        cur.count += 1;
        accMap.set(tx.symbol, cur);
      } else if (tx.type === 'EXCHANGE_INFLOW') {
        const cur = distMap.get(tx.symbol) ?? { symbol: tx.symbol, baseAsset: tx.baseAsset, usd: 0, count: 0 };
        cur.usd += tx.amountUsd;
        cur.count += 1;
        distMap.set(tx.symbol, cur);
      }
    }

    return {
      topAccumulation: Array.from(accMap.values())
        .sort((a, b) => b.usd - a.usd)
        .slice(0, 5),
      topDistribution: Array.from(distMap.values())
        .sort((a, b) => b.usd - a.usd)
        .slice(0, 5),
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
          <h1 className="text-xl font-bold tracking-tight text-[#EAECEF] sm:text-2xl">
            Whale Activity Tracker
          </h1>
          <p className="mt-0.5 text-xs text-[#848E9C]">
            Pantau aliran dana on-chain bernilai besar (Outflow Akumulasi vs Inflow Distribusi).
          </p>
        </div>

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
          <span>{paused ? 'Lanjutkan Live Feed' : 'Jeda Live Feed'}</span>
        </button>
      </div>

      {/* Top 5 Accumulation vs Top 5 Distribution (24h) */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="cp-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-[#00C087]" />
              <h2 className="text-sm font-semibold text-[#EAECEF]">
                Top 5 Akumulasi (Exchange Outflow · 24h)
              </h2>
            </div>
            <span className="rounded bg-[#00C087]/15 px-2 py-0.5 text-[10px] font-bold text-[#00C087]">
              BULLISH FLOW
            </span>
          </div>

          <div className="space-y-2">
            {topAccumulation.map((row, idx) => (
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
                    {row.count} tx
                  </span>
                </div>
                <span className="font-mono tabular-nums text-sm font-bold text-[#00C087]">
                  +{formatCompactUsd(row.usd)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="cp-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowDownLeft className="h-4 w-4 text-[#F6465D]" />
              <h2 className="text-sm font-semibold text-[#EAECEF]">
                Top 5 Distribusi (Exchange Inflow · 24h)
              </h2>
            </div>
            <span className="rounded bg-[#F6465D]/15 px-2 py-0.5 text-[10px] font-bold text-[#F6465D]">
              SELL PRESSURE
            </span>
          </div>

          <div className="space-y-2">
            {topDistribution.map((row, idx) => (
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
                    {row.count} tx
                  </span>
                </div>
                <span className="font-mono tabular-nums text-sm font-bold text-[#F6465D]">
                  -{formatCompactUsd(row.usd)}
                </span>
              </button>
            ))}
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

      {/* Live Whale Feed */}
      <section aria-label="Live Whale Transactions" className="cp-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Waves className="h-4 w-4 text-[#F0B90B]" />
            <h2 className="text-sm font-semibold text-[#EAECEF]">Live On-Chain Whale Feed</h2>
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                paused ? 'bg-[#1E2329] text-[#848E9C]' : 'bg-[#00C087]/15 text-[#00C087]'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${paused ? 'bg-[#848E9C]' : 'bg-[#00C087]'}`}
              />
              {paused ? 'DIJEDA' : 'STREAMING'}
            </span>
          </div>
          <span className="font-mono tabular-nums text-xs text-[#848E9C]">
            {filteredTx.length} transaksi
          </span>
        </div>

        <div className="space-y-2">
          {filteredTx.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#5E6673]">
              Tidak ada transaksi whale yang cocok dengan filter saat ini.
            </p>
          ) : (
            filteredTx.map((tx) => {
              const badge =
                tx.type === 'EXCHANGE_OUTFLOW'
                  ? { label: 'Outflow (Akumulasi)', style: 'bg-[#00C087]/15 text-[#00C087]', Icon: ArrowUpRight }
                  : tx.type === 'EXCHANGE_INFLOW'
                    ? { label: 'Inflow (Distribusi)', style: 'bg-[#F6465D]/15 text-[#F6465D]', Icon: ArrowDownLeft }
                    : { label: 'Wallet Transfer', style: 'bg-[#F0B90B]/15 text-[#F0B90B]', Icon: ArrowLeftRight };
              const Icon = badge.Icon;

              return (
                <div
                  key={tx.id}
                  className="flex flex-col gap-2.5 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-[#EAECEF]">{tx.baseAsset}</span>
                      <span
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold ${badge.style}`}
                      >
                        <Icon className="h-3 w-3" />
                        {badge.label}
                      </span>
                      <span className="rounded bg-[#1E2329] px-1.5 py-0.5 text-[10px] text-[#848E9C]">
                        {tx.blockchain}
                      </span>
                      <span className="font-mono tabular-nums text-[10px] text-[#5E6673]">
                        {formatShortTime(tx.timestamp)}
                      </span>
                    </div>

                    <p className="mt-1.5 text-xs text-[#848E9C]">
                      <span className="text-[#EAECEF]">{tx.fromLabel}</span> →{' '}
                      <span className="text-[#EAECEF]">{tx.toLabel}</span>
                      <span className="font-mono ml-2 text-[10px] text-[#5E6673]">{tx.txHash}</span>
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <div className="text-left sm:text-right">
                      <p className="font-mono tabular-nums text-base font-bold text-[#F0B90B]">
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
