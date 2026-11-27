import { useEffect, useRef } from 'react';
import {
  AreaSeries,
  ColorType,
  LineStyle,
  createChart,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { EquityPoint } from '../../types';

interface EquityCurveChartProps {
  points: EquityPoint[];
  height?: number;
}

export function EquityCurveChart({ points, height = 160 }: EquityCurveChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || points.length === 0) return;

    // Ensure strictly ascending unique timestamps for lightweight-charts
    const uniquePoints: EquityPoint[] = [];
    for (const pt of points) {
      const prev = uniquePoints[uniquePoints.length - 1];
      if (!prev || pt.time > prev.time) {
        uniquePoints.push(pt);
      } else {
        uniquePoints[uniquePoints.length - 1] = pt;
      }
    }

    const lastVal = uniquePoints[uniquePoints.length - 1]?.equity ?? 100;
    const isPositive = lastVal >= 100;
    const lineColor = isPositive ? '#00C087' : '#F6465D';

    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#0B0E11' },
        textColor: '#848E9C',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: '#1E2329' },
        horzLines: { color: '#1E2329' },
      },
      rightPriceScale: { borderColor: '#2B3139' },
      timeScale: { borderColor: '#2B3139', timeVisible: true, secondsVisible: false },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor,
      topColor: isPositive ? 'rgba(0, 192, 135, 0.28)' : 'rgba(246, 70, 93, 0.28)',
      bottomColor: 'rgba(11, 14, 17, 0.0)',
      lineWidth: 2,
    });

    series.setData(
      uniquePoints.map((p) => ({
        time: p.time as UTCTimestamp,
        value: p.equity,
      })),
    );

    series.createPriceLine({
      price: 100,
      color: '#5E6673',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
      title: 'Base 100',
    });

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0) {
        chart.applyOptions({ width: el.clientWidth });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [points, height]);

  return (
    <div className="overflow-hidden rounded-xl border border-[#2B3139] bg-[#0B0E11]">
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
