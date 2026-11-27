import { useEffect, useRef } from 'react';
import { AreaSeries, ColorType, createChart, type UTCTimestamp } from 'lightweight-charts';
import type { PortfolioSnapshot } from '../../types';

export function PortfolioPerfChart({ snapshots }: { snapshots: PortfolioSnapshot[] }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || snapshots.length === 0) return;

    const deduped: PortfolioSnapshot[] = [];
    for (const s of snapshots) {
      const prev = deduped[deduped.length - 1];
      if (!prev || s.time > prev.time) deduped.push(s);
      else deduped[deduped.length - 1] = s;
    }

    const first = deduped[0]?.totalValueUsdt ?? 0;
    const last = deduped[deduped.length - 1]?.totalValueUsdt ?? 0;
    const positive = last >= first;

    const chart = createChart(el, {
      width: el.clientWidth,
      height: 210,
      layout: {
        background: { type: ColorType.Solid, color: '#0B0E11' },
        textColor: '#848E9C',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1E2329' },
        horzLines: { color: '#1E2329' },
      },
      rightPriceScale: { borderColor: '#2B3139' },
      timeScale: { borderColor: '#2B3139', timeVisible: true, secondsVisible: false },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: positive ? '#00C087' : '#F6465D',
      topColor: positive ? 'rgba(0, 192, 135, 0.25)' : 'rgba(246, 70, 93, 0.25)',
      bottomColor: 'rgba(11, 14, 17, 0)',
      lineWidth: 2,
    });

    series.setData(
      deduped.map((s) => ({
        time: s.time as UTCTimestamp,
        value: s.totalValueUsdt,
      })),
    );

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0) chart.applyOptions({ width: el.clientWidth });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [snapshots]);

  if (snapshots.length === 0) {
    return (
      <div className="flex h-[210px] items-center justify-center rounded-xl border border-dashed border-[#2B3139] bg-[#0B0E11] px-4 text-center">
        <p className="max-w-xs text-xs leading-relaxed text-[#848E9C]">
          Grafik kinerja historis otomatis mulai terekam setelah Anda mengisi saldo{' '}
          <span className="font-semibold text-[#F0B90B]">Kas USDT</span> atau mencatat transaksi{' '}
          <span className="font-semibold text-[#EAECEF]">Beli / DCA Spot</span> pertama.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#2B3139] bg-[#0B0E11]">
      <div ref={ref} className="w-full" />
    </div>
  );
}
