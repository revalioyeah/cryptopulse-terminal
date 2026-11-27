import { Activity, Coins, Gauge, Globe } from 'lucide-react';
import type { FearGreedData, GlobalMarketData } from '../../types';
import { formatCompactUsd, formatPercent } from '../../utils/format';

interface GlobalKpiCardsProps {
  globalData: GlobalMarketData;
  fearGreed: FearGreedData;
  isLoading: boolean;
}

function getFearGreedColor(val: number): string {
  if (val <= 25) return '#F6465D';
  if (val <= 45) return '#F97316';
  if (val <= 55) return '#F0B90B';
  if (val <= 75) return '#00C087';
  return '#10B981';
}

function FearGreedGauge({ value }: { value: number }) {
  const clamped = Math.min(100, Math.max(0, value));
  // Semicircle from 180 deg to 0 deg
  const angleRad = Math.PI - (clamped / 100) * Math.PI;
  const cx = 60;
  const cy = 54;
  const r = 42;
  const nx = cx + r * 0.78 * Math.cos(angleRad);
  const ny = cy - r * 0.78 * Math.sin(angleRad);
  const color = getFearGreedColor(clamped);

  return (
    <svg viewBox="0 0 120 66" className="h-14 w-28 shrink-0" aria-hidden="true">
      {/* Background track */}
      <path
        d="M 18 54 A 42 42 0 0 1 102 54"
        fill="none"
        stroke="#2B3139"
        strokeWidth="8"
        strokeLinecap="round"
      />
      {/* Colored arc segments */}
      <path
        d="M 18 54 A 42 42 0 0 1 40 18"
        fill="none"
        stroke="#F6465D"
        strokeWidth="8"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M 43 16 A 42 42 0 0 1 77 16"
        fill="none"
        stroke="#F0B90B"
        strokeWidth="8"
        opacity="0.85"
      />
      <path
        d="M 80 18 A 42 42 0 0 1 102 54"
        fill="none"
        stroke="#00C087"
        strokeWidth="8"
        strokeLinecap="round"
        opacity="0.85"
      />
      {/* Needle */}
      <line
        x1={cx}
        y1={cy}
        x2={nx}
        y2={ny}
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r="4" fill={color} />
    </svg>
  );
}

export function GlobalKpiCards({ globalData, fearGreed, isLoading }: GlobalKpiCardsProps) {
  const mcapPositive = globalData.marketCapChangePercent24h >= 0;
  const fgColor = getFearGreedColor(fearGreed.value);
  const fgDelta =
    fearGreed.previousValue !== undefined ? fearGreed.value - fearGreed.previousValue : null;

  return (
    <section aria-label="KPI Pasar Global" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {/* KPI 1: Total Market Cap + Global Volume 24h */}
      <div className="cp-card flex flex-col justify-between p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-[#848E9C]">
            <Globe className="h-3.5 w-3.5 text-[#F0B90B]" />
            Total Market Cap
          </span>
          <span
            className={`font-mono tabular-nums rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
              mcapPositive
                ? 'bg-[#00C087]/15 text-[#00C087]'
                : 'bg-[#F6465D]/15 text-[#F6465D]'
            }`}
          >
            {formatPercent(globalData.marketCapChangePercent24h)}
          </span>
        </div>

        <div className="mt-2.5">
          {isLoading ? (
            <div className="h-7 w-32 animate-pulse rounded bg-[#1E2329]" />
          ) : (
            <p className="font-mono tabular-nums text-2xl font-bold tracking-tight text-[#EAECEF]">
              {formatCompactUsd(globalData.totalMarketCapUsd)}
            </p>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-[#2B3139] pt-2.5 text-xs">
          <span className="text-[#848E9C]">Global Vol 24h</span>
          <span className="font-mono tabular-nums font-semibold text-[#EAECEF]">
            {formatCompactUsd(globalData.totalVolume24hUsd)}
          </span>
        </div>
      </div>

      {/* KPI 2: BTC Dominance */}
      <div className="cp-card flex flex-col justify-between p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-[#848E9C]">
            <Coins className="h-3.5 w-3.5 text-[#F0B90B]" />
            BTC Dominance (BTC.D)
          </span>
          <span className="rounded bg-[#1E2329] px-1.5 py-0.5 text-[10px] font-medium text-[#848E9C]">
            {globalData.isFallback ? 'Cache' : 'CoinGecko'}
          </span>
        </div>

        <div className="mt-2.5 flex items-baseline gap-2">
          <p className="font-mono tabular-nums text-2xl font-bold tracking-tight text-[#EAECEF]">
            {globalData.btcDominance.toFixed(2)}%
          </p>
          <span className="font-mono tabular-nums text-xs text-[#848E9C]">
            ETH {globalData.ethDominance.toFixed(1)}%
          </span>
        </div>

        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#0B0E11]">
            <div
              className="h-full rounded-full bg-[#F0B90B]"
              style={{ width: `${Math.min(100, globalData.btcDominance)}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-[#848E9C]">
            {globalData.btcDominance >= 56
              ? 'Aliran modal dominan di BTC; selektif di altcoin.'
              : 'Ruang rotasi likuiditas ke altcoin terbuka.'}
          </p>
        </div>
      </div>

      {/* KPI 3: USDT Dominance */}
      <div className="cp-card flex flex-col justify-between p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-[#848E9C]">
            <Activity className="h-3.5 w-3.5 text-[#00C087]" />
            USDT Dominance (USDT.D)
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
              globalData.usdtDominance <= 4.5
                ? 'bg-[#00C087]/15 text-[#00C087]'
                : 'bg-[#F6465D]/15 text-[#F6465D]'
            }`}
          >
            {globalData.usdtDominance <= 4.5 ? 'Risk-On' : 'Defensive'}
          </span>
        </div>

        <div className="mt-2.5 flex items-baseline gap-2">
          <p className="font-mono tabular-nums text-2xl font-bold tracking-tight text-[#EAECEF]">
            {globalData.usdtDominance.toFixed(2)}%
          </p>
          <span className="text-xs text-[#848E9C]">Dry Powder</span>
        </div>

        <div className="mt-3 border-t border-[#2B3139] pt-2.5 text-[11px] text-[#848E9C]">
          USDT.D turun menandakan modal stablecoin masuk ke aset kripto.
        </div>
      </div>

      {/* KPI 4: Fear & Greed Index with Gauge */}
      <div className="cp-card flex flex-col justify-between p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-[#848E9C]">
            <Gauge className="h-3.5 w-3.5 text-[#F0B90B]" />
            Fear &amp; Greed Index
          </span>
          <span className="rounded bg-[#1E2329] px-1.5 py-0.5 text-[10px] font-medium text-[#848E9C]">
            {fearGreed.isFallback ? 'Cache' : 'Alt.me'}
          </span>
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span
                className="font-mono tabular-nums text-2xl font-bold"
                style={{ color: fgColor }}
              >
                {fearGreed.value}
              </span>
              <span className="font-mono tabular-nums text-xs text-[#848E9C]">/100</span>
            </div>
            <p className="truncate text-xs font-semibold" style={{ color: fgColor }}>
              {fearGreed.classification}
            </p>
            {fgDelta !== null && (
              <p className="font-mono tabular-nums mt-0.5 text-[11px] text-[#848E9C]">
                vs kemarin: {fgDelta >= 0 ? `+${fgDelta}` : fgDelta}
              </p>
            )}
          </div>
          <FearGreedGauge value={fearGreed.value} />
        </div>
      </div>
    </section>
  );
}
