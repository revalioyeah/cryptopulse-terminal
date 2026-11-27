import { useEffect, useState } from 'react';
import { Activity, Crosshair, Layers, Zap } from 'lucide-react';
import type {
  DerivativesSnapshot,
  LiquidationCluster,
  MtfTrendItem,
  TechnicalSummary,
} from '../../types';
import { formatCompactUsd, formatCountdown, formatPercent, formatPrice } from '../../utils/format';

export function TechnicalSummaryCard({ summary }: { summary: TechnicalSummary }) {
  const biasStyles = {
    'Strong Buy': 'bg-[#00C087]/20 text-[#00C087] border-[#00C087]/40',
    Buy: 'bg-[#00C087]/12 text-[#00C087] border-[#00C087]/30',
    Neutral: 'bg-[#F0B90B]/15 text-[#F0B90B] border-[#F0B90B]/30',
    Sell: 'bg-[#F6465D]/12 text-[#F6465D] border-[#F6465D]/30',
    'Strong Sell': 'bg-[#F6465D]/20 text-[#F6465D] border-[#F6465D]/40',
  }[summary.bias];

  const gaugePct = Math.round(((summary.score + 100) / 200) * 100);

  return (
    <div className="cp-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#F0B90B]" />
          <h2 className="text-sm font-semibold text-[#EAECEF]">Automated Technical Summary</h2>
        </div>
        <span className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${biasStyles}`}>
          {summary.bias}
        </span>
      </div>

      {/* Bias Spectrum Bar */}
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[11px] text-[#848E9C]">
          <span>Strong Sell</span>
          <span className="font-mono tabular-nums font-semibold text-[#EAECEF]">
            Skor: {summary.score >= 0 ? `+${summary.score}` : summary.score}
          </span>
          <span>Strong Buy</span>
        </div>
        <div className="relative h-2 w-full rounded-full bg-gradient-to-r from-[#F6465D] via-[#F0B90B] to-[#00C087]">
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0B0E11] bg-[#EAECEF] shadow"
            style={{ left: `${gaugePct}%` }}
          />
        </div>
      </div>

      {/* Patterns */}
      <div className="mt-4">
        <span className="text-[11px] font-medium uppercase tracking-wider text-[#848E9C]">
          Pola &amp; Struktur Terdeteksi
        </span>
        <ul className="mt-1.5 space-y-1.5">
          {summary.patterns.map((pat) => (
            <li
              key={pat}
              className="rounded-lg border border-[#2B3139] bg-[#0B0E11] px-2.5 py-2 text-xs text-[#EAECEF]"
            >
              {pat}
            </li>
          ))}
        </ul>
      </div>

      {/* Key S/R Levels */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#00C087]">
            Key Supports
          </span>
          <div className="mt-1.5 space-y-1">
            {summary.supports.slice(0, 3).map((s, idx) => (
              <div key={`sup-${idx}`} className="flex justify-between text-xs">
                <span className="text-[#848E9C]">S{idx + 1}</span>
                <span className="font-mono tabular-nums font-semibold text-[#00C087]">
                  {formatPrice(s)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#F6465D]">
            Key Resistances
          </span>
          <div className="mt-1.5 space-y-1">
            {summary.resistances.slice(0, 3).map((r, idx) => (
              <div key={`res-${idx}`} className="flex justify-between text-xs">
                <span className="text-[#848E9C]">R{idx + 1}</span>
                <span className="font-mono tabular-nums font-semibold text-[#F6465D]">
                  {formatPrice(r)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DerivativesSnapshotCard({ data }: { data: DerivativesSnapshot }) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const fundingPos = data.fundingRate8h >= 0;
  const oiPos = data.openInterestChange24h >= 0;

  return (
    <div className="cp-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-[#F0B90B]" />
          <h2 className="text-sm font-semibold text-[#EAECEF]">Derivatives Snapshot</h2>
        </div>
        <span className="rounded bg-[#1E2329] px-1.5 py-0.5 text-[10px] text-[#848E9C]">
          {data.isMock ? 'Adapter Est.' : 'Coinglass'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
          <span className="text-[11px] text-[#848E9C]">Funding Rate (8h)</span>
          <p
            className={`font-mono tabular-nums mt-1 text-lg font-bold ${
              fundingPos ? 'text-[#00C087]' : 'text-[#F6465D]'
            }`}
          >
            {fundingPos ? '+' : ''}
            {data.fundingRate8h.toFixed(4)}%
          </p>
          <p className="font-mono tabular-nums mt-0.5 text-[10px] text-[#5E6673]">
            Next: {formatCountdown(data.nextFundingTime, nowMs)}
          </p>
        </div>

        <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
          <span className="text-[11px] text-[#848E9C]">Open Interest</span>
          <p className="font-mono tabular-nums mt-1 text-lg font-bold text-[#EAECEF]">
            {formatCompactUsd(data.openInterestUsd)}
          </p>
          <p
            className={`font-mono tabular-nums mt-0.5 text-[11px] font-semibold ${
              oiPos ? 'text-[#00C087]' : 'text-[#F6465D]'
            }`}
          >
            {formatPercent(data.openInterestChange24h)} (24h)
          </p>
        </div>
      </div>

      {/* Long / Short Ratio Bar */}
      <div className="mt-3.5 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="font-mono tabular-nums font-semibold text-[#00C087]">
            Long {data.longRatioPercent.toFixed(1)}%
          </span>
          <span className="text-[11px] text-[#848E9C]">Long / Short Ratio</span>
          <span className="font-mono tabular-nums font-semibold text-[#F6465D]">
            Short {data.shortRatioPercent.toFixed(1)}%
          </span>
        </div>
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[#1E2329]">
          <div
            className="h-full bg-[#00C087]"
            style={{ width: `${data.longRatioPercent}%` }}
          />
          <div
            className="h-full bg-[#F6465D]"
            style={{ width: `${data.shortRatioPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function MtfTrendMatrixCard({ items }: { items: MtfTrendItem[] }) {
  const bullCount = items.filter((i) => i.trend === 'Bullish').length;
  const bearCount = items.filter((i) => i.trend === 'Bearish').length;

  const confluence =
    bullCount >= 3
      ? { label: `Konfluensi Bullish (${bullCount}/4 TF)`, style: 'bg-[#00C087]/15 text-[#00C087]' }
      : bearCount >= 3
        ? { label: `Konfluensi Bearish (${bearCount}/4 TF)`, style: 'bg-[#F6465D]/15 text-[#F6465D]' }
        : { label: 'Konfluensi Campuran / Transisi', style: 'bg-[#F0B90B]/15 text-[#F0B90B]' };

  return (
    <div className="cp-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-[#F0B90B]" />
          <h2 className="text-sm font-semibold text-[#EAECEF]">Multi-Timeframe (MTF) Trend Matrix</h2>
        </div>
        <span className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${confluence.style}`}>
          {confluence.label}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {items.map((item) => {
          const trendColor =
            item.trend === 'Bullish'
              ? 'text-[#00C087] bg-[#00C087]/15'
              : item.trend === 'Bearish'
                ? 'text-[#F6465D] bg-[#F6465D]/15'
                : 'text-[#F0B90B] bg-[#F0B90B]/15';

          return (
            <div
              key={item.timeframe}
              className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono tabular-nums text-xs font-bold uppercase text-[#EAECEF]">
                  {item.timeframe}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${trendColor}`}>
                  {item.trend}
                </span>
              </div>
              <p className="font-mono tabular-nums mt-2 text-xs text-[#EAECEF]">
                RSI: <strong>{item.rsi.toFixed(1)}</strong>
              </p>
              <p className="mt-1 truncate text-[11px] text-[#848E9C]">{item.emaAlignment}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LiquidationClustersCard({ clusters }: { clusters: LiquidationCluster[] }) {
  return (
    <div className="cp-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-[#F0B90B]" />
          <h2 className="text-sm font-semibold text-[#EAECEF]">
            Liquidation Clusters (Stop-Hunt Zones)
          </h2>
        </div>
        <span className="text-[11px] text-[#848E9C]">Estimasi 25x &amp; 50x</span>
      </div>

      <div className="mt-3 space-y-2">
        {clusters.map((c) => {
          const isShortLiq = c.side === 'SHORT_LIQ';
          return (
            <div
              key={`${c.side}-${c.leverage}`}
              className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-2.5"
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono tabular-nums text-[10px] font-bold ${
                      isShortLiq
                        ? 'bg-[#F6465D]/15 text-[#F6465D]'
                        : 'bg-[#00C087]/15 text-[#00C087]'
                    }`}
                  >
                    {isShortLiq ? `SHORT LIQ ${c.leverage}` : `LONG LIQ ${c.leverage}`}
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-[#EAECEF]">
                    {formatPrice(c.price)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono tabular-nums text-[11px] ${
                      isShortLiq ? 'text-[#F6465D]' : 'text-[#00C087]'
                    }`}
                  >
                    {formatPercent(c.distancePercent)}
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-[#F0B90B]">
                    {formatCompactUsd(c.estimatedVolumeUsd)}
                  </span>
                </div>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#1E2329]">
                <div
                  className={`h-full rounded-full ${isShortLiq ? 'bg-[#F6465D]' : 'bg-[#00C087]'}`}
                  style={{ width: `${c.intensity}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
