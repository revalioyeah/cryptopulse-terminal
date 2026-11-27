import { useState } from 'react';
import { formatUsd } from '../../utils/format';

export interface AllocationSegment {
  label: string;
  valueUsd: number;
  percent: number;
  color: string;
}

interface AllocationDonutChartProps {
  items: AllocationSegment[];
  totalUsd: number;
}

export function AllocationDonutChart({ items, totalUsd }: AllocationDonutChartProps) {
  const [activeLabel, setActiveLabel] = useState<string | null>(null);

  const visibleItems = items.filter((seg) => seg.valueUsd > 0 && seg.percent > 0);
  const activeSeg = visibleItems.find((seg) => seg.label === activeLabel) ?? null;

  const size = 180;
  const center = size / 2;
  const radius = 66;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * radius;

  // Build cumulative arc offsets
  let cumulativePercent = 0;
  const arcs = visibleItems.map((seg) => {
    const startPercent = cumulativePercent;
    cumulativePercent += seg.percent;
    const isSingleFull = visibleItems.length === 1 || seg.percent >= 99.95;
    const gap = isSingleFull ? 0 : Math.min(2.5, (seg.percent / 100) * circumference * 0.25);
    const dashLen = Math.max(1, (seg.percent / 100) * circumference - gap);
    const dashOffset = -(startPercent / 100) * circumference;

    return {
      ...seg,
      dashLen,
      dashOffset,
    };
  });

  return (
    <div className="space-y-4">
      {/* Donut + Center Total Readout */}
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <div className="relative flex h-[172px] w-[172px] shrink-0 items-center justify-center">
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="h-full w-full -rotate-90"
            role="img"
            aria-label="Grafik Donat Alokasi Portofolio"
          >
            {/* Base track ring */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="#0B0E11"
              strokeWidth={strokeWidth}
            />
            {visibleItems.length === 0 ? (
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke="#2B3139"
                strokeWidth={strokeWidth}
              />
            ) : (
              arcs.map((arc) => {
                const isHighlighted = activeLabel === null || activeLabel === arc.label;
                return (
                  <circle
                    key={arc.label}
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke={arc.color}
                    strokeWidth={activeLabel === arc.label ? strokeWidth + 3 : strokeWidth}
                    strokeDasharray={`${arc.dashLen} ${circumference}`}
                    strokeDashoffset={arc.dashOffset}
                    opacity={isHighlighted ? 1 : 0.35}
                    className="cursor-pointer transition-all duration-200"
                    onMouseEnter={() => setActiveLabel(arc.label)}
                    onMouseLeave={() => setActiveLabel(null)}
                    onClick={() =>
                      setActiveLabel((prev) => (prev === arc.label ? null : arc.label))
                    }
                  />
                );
              })
            )}
          </svg>

          {/* Center Label */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
            {activeSeg ? (
              <>
                <span className="max-w-[96px] truncate text-[11px] font-semibold text-[#848E9C]">
                  {activeSeg.label}
                </span>
                <span
                  className="font-mono tabular-nums mt-0.5 text-lg font-bold"
                  style={{ color: activeSeg.color }}
                >
                  {activeSeg.percent.toFixed(1)}%
                </span>
                <span className="font-mono tabular-nums text-[11px] text-[#EAECEF]">
                  {formatUsd(activeSeg.valueUsd)}
                </span>
              </>
            ) : (
              <>
                <span className="text-[11px] font-medium text-[#848E9C]">Total Porto</span>
                <span className="font-mono tabular-nums mt-0.5 text-sm font-bold text-[#EAECEF]">
                  {formatUsd(totalUsd)}
                </span>
                <span className="font-mono tabular-nums mt-0.5 text-[10px] text-[#5E6673]">
                  {visibleItems.length} komponen
                </span>
              </>
            )}
          </div>
        </div>

        {/* Interactive Legend Breakdown */}
        <div className="w-full min-w-0 flex-1 space-y-1.5">
          {items.length === 0 || totalUsd <= 0 ? (
            <div className="rounded-xl border border-dashed border-[#2B3139] bg-[#0B0E11] px-3 py-4 text-center text-xs text-[#5E6673]">
              Portofolio kosong ($0.00). Deposit USDT atau catat pembelian Spot.
            </div>
          ) : (
            items.map((seg) => {
              const isSelected = activeLabel === seg.label;
              return (
                <button
                  key={seg.label}
                  type="button"
                  onMouseEnter={() => setActiveLabel(seg.label)}
                  onMouseLeave={() => setActiveLabel(null)}
                  onClick={() =>
                    setActiveLabel((prev) => (prev === seg.label ? null : seg.label))
                  }
                  className={`flex min-h-[38px] w-full items-center justify-between rounded-lg border px-3 py-1.5 text-left text-xs transition ${
                    isSelected
                      ? 'border-[#F0B90B]/60 bg-[#1E2329]'
                      : 'border-transparent bg-[#0B0E11] hover:border-[#2B3139]'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="truncate font-semibold text-[#EAECEF]">{seg.label}</span>
                  </div>
                  <div className="font-mono tabular-nums flex shrink-0 items-center gap-2.5">
                    <span className="text-[#848E9C]">{formatUsd(seg.valueUsd)}</span>
                    <span className="w-12 text-right font-bold text-[#EAECEF]">
                      {seg.percent.toFixed(1)}%
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Horizontal Stacked Allocation Bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-[#0B0E11]">
        {visibleItems.map((seg) => (
          <div
            key={seg.label}
            style={{
              width: `${Math.max(1, seg.percent)}%`,
              backgroundColor: seg.color,
              opacity: activeLabel === null || activeLabel === seg.label ? 1 : 0.35,
            }}
            className="transition-opacity duration-200"
            title={`${seg.label}: ${seg.percent.toFixed(1)}%`}
          />
        ))}
      </div>
    </div>
  );
}
