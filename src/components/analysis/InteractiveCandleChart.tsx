import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle, TechnicalSummary, Timeframe } from '../../types';
import { calculateEMA, calculateRSI } from '../../services/indicators';
import { formatRawPrice } from '../../utils/format';

interface InteractiveCandleChartProps {
  symbol: string;
  timeframe: Timeframe;
  onChangeTimeframe: (tf: Timeframe) => void;
  candles: Candle[];
  summary: TechnicalSummary;
  isLoading: boolean;
  isFallback: boolean;
}

const TIMEFRAMES: Array<{ id: Timeframe; label: string }> = [
  { id: '5m', label: '5m' },
  { id: '15m', label: '15m' },
  { id: '1h', label: '1H' },
  { id: '4h', label: '4H' },
  { id: '1d', label: '1D' },
  { id: '1w', label: '1W' },
];

export function InteractiveCandleChart({
  symbol,
  timeframe,
  onChangeTimeframe,
  candles,
  summary,
  isLoading,
  isFallback,
}: InteractiveCandleChartProps) {
  const mainContainerRef = useRef<HTMLDivElement | null>(null);
  const rsiContainerRef = useRef<HTMLDivElement | null>(null);

  const [showEma20, setShowEma20] = useState(true);
  const [showEma50, setShowEma50] = useState(true);
  const [showEma200, setShowEma200] = useState(false);
  const [showSR, setShowSR] = useState(true);

  const indicatorData = useMemo(() => {
    return {
      ema20: calculateEMA(candles, 20),
      ema50: calculateEMA(candles, 50),
      ema200: calculateEMA(candles, 200),
      rsi14: calculateRSI(candles, 14),
    };
  }, [candles]);

  useEffect(() => {
    const mainEl = mainContainerRef.current;
    const rsiEl = rsiContainerRef.current;
    if (!mainEl || !rsiEl || candles.length === 0) return;

    const lastPrice = candles[candles.length - 1]?.close ?? 1;
    const precision = lastPrice >= 100 ? 2 : lastPrice >= 1 ? 4 : lastPrice >= 0.01 ? 5 : 8;
    const minMove = Number((10 ** -precision).toFixed(precision));

    const mainChart: IChartApi = createChart(mainEl, {
      width: mainEl.clientWidth,
      height: 360,
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
      crosshair: {
        vertLine: { color: '#474D57', style: LineStyle.Dashed },
        horzLine: { color: '#474D57', style: LineStyle.Dashed },
      },
      rightPriceScale: {
        borderColor: '#2B3139',
      },
      timeScale: {
        borderColor: '#2B3139',
        timeVisible: timeframe !== '1d' && timeframe !== '1w',
        secondsVisible: false,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: '#00C087',
      downColor: '#F6465D',
      borderVisible: false,
      wickUpColor: '#00C087',
      wickDownColor: '#F6465D',
      priceFormat: { type: 'price', precision, minMove },
    });

    candleSeries.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    if (showEma20 && indicatorData.ema20.length > 0) {
      const ema20Series = mainChart.addSeries(LineSeries, {
        color: '#F0B90B',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      ema20Series.setData(
        indicatorData.ema20.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
    }

    if (showEma50 && indicatorData.ema50.length > 0) {
      const ema50Series = mainChart.addSeries(LineSeries, {
        color: '#38BDF8',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      ema50Series.setData(
        indicatorData.ema50.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
    }

    if (showEma200 && indicatorData.ema200.length > 0) {
      const ema200Series = mainChart.addSeries(LineSeries, {
        color: '#E2E8F0',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      ema200Series.setData(
        indicatorData.ema200.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
    }

    if (showSR) {
      summary.resistances.slice(0, 2).forEach((res, idx) => {
        candleSeries.createPriceLine({
          price: res,
          color: '#F6465D',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `R${idx + 1}`,
        });
      });

      summary.supports.slice(0, 2).forEach((sup, idx) => {
        candleSeries.createPriceLine({
          price: sup,
          color: '#00C087',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `S${idx + 1}`,
        });
      });
    }

    // Sub-pane RSI (14) Chart
    const rsiChart: IChartApi = createChart(rsiEl, {
      width: rsiEl.clientWidth,
      height: 118,
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
      rightPriceScale: {
        borderColor: '#2B3139',
      },
      timeScale: {
        borderColor: '#2B3139',
        timeVisible: timeframe !== '1d' && timeframe !== '1w',
        secondsVisible: false,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    const rsiSeries = rsiChart.addSeries(LineSeries, {
      color: '#F0B90B',
      lineWidth: 2,
      priceLineVisible: false,
      autoscaleInfoProvider: () => ({
        priceRange: { minValue: 10, maxValue: 90 },
      }),
    });

    rsiSeries.setData(
      indicatorData.rsi14.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
    );

    rsiSeries.createPriceLine({
      price: 70,
      color: '#F6465D',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: true,
      title: 'OB',
    });
    rsiSeries.createPriceLine({
      price: 30,
      color: '#00C087',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: true,
      title: 'OS',
    });

    // Show comfortable zoom window (~110 latest candles)
    const totalBars = candles.length;
    if (totalBars > 100) {
      const range = { from: totalBars - 105, to: totalBars + 4 };
      mainChart.timeScale().setVisibleLogicalRange(range);
      rsiChart.timeScale().setVisibleLogicalRange(range);
    } else {
      mainChart.timeScale().fitContent();
      rsiChart.timeScale().fitContent();
    }

    // Sync timeScale between main candlestick chart and RSI sub-pane
    let syncing = false;
    const syncMainToRsi = () => {
      if (syncing) return;
      const range = mainChart.timeScale().getVisibleLogicalRange();
      if (!range) return;
      syncing = true;
      rsiChart.timeScale().setVisibleLogicalRange(range);
      syncing = false;
    };
    const syncRsiToMain = () => {
      if (syncing) return;
      const range = rsiChart.timeScale().getVisibleLogicalRange();
      if (!range) return;
      syncing = true;
      mainChart.timeScale().setVisibleLogicalRange(range);
      syncing = false;
    };

    mainChart.timeScale().subscribeVisibleLogicalRangeChange(syncMainToRsi);
    rsiChart.timeScale().subscribeVisibleLogicalRangeChange(syncRsiToMain);

    const resizeObserver = new ResizeObserver(() => {
      if (mainEl.clientWidth > 0) {
        mainChart.applyOptions({ width: mainEl.clientWidth });
      }
      if (rsiEl.clientWidth > 0) {
        rsiChart.applyOptions({ width: rsiEl.clientWidth });
      }
    });
    resizeObserver.observe(mainEl);
    resizeObserver.observe(rsiEl);

    return () => {
      resizeObserver.disconnect();
      mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(syncMainToRsi);
      rsiChart.timeScale().unsubscribeVisibleLogicalRangeChange(syncRsiToMain);
      mainChart.remove();
      rsiChart.remove();
    };
  }, [candles, timeframe, showEma20, showEma50, showEma200, showSR, indicatorData, summary.resistances, summary.supports]);

  return (
    <section aria-label="Grafik Candlestick Interaktif" className="cp-card p-3.5 sm:p-4">
      {/* Chart Toolbar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {TIMEFRAMES.map((tf) => {
            const active = timeframe === tf.id;
            return (
              <button
                key={tf.id}
                type="button"
                onClick={() => onChangeTimeframe(tf.id)}
                className={`font-mono tabular-nums min-h-[40px] min-w-[42px] rounded-lg px-2.5 text-xs font-semibold transition ${
                  active
                    ? 'bg-[#F0B90B] text-[#0B0E11]'
                    : 'border border-[#2B3139] bg-[#0B0E11] text-[#848E9C] hover:text-[#EAECEF]'
                }`}
              >
                {tf.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowEma20((v) => !v)}
            className={`min-h-[40px] rounded-lg border px-2.5 text-xs font-medium transition ${
              showEma20
                ? 'border-[#F0B90B]/60 bg-[#F0B90B]/15 text-[#F0B90B]'
                : 'border-[#2B3139] bg-[#0B0E11] text-[#5E6673]'
            }`}
          >
            EMA 20
          </button>
          <button
            type="button"
            onClick={() => setShowEma50((v) => !v)}
            className={`min-h-[40px] rounded-lg border px-2.5 text-xs font-medium transition ${
              showEma50
                ? 'border-[#38BDF8]/60 bg-[#38BDF8]/15 text-[#38BDF8]'
                : 'border-[#2B3139] bg-[#0B0E11] text-[#5E6673]'
            }`}
          >
            EMA 50
          </button>
          <button
            type="button"
            onClick={() => setShowEma200((v) => !v)}
            className={`min-h-[40px] rounded-lg border px-2.5 text-xs font-medium transition ${
              showEma200
                ? 'border-[#E2E8F0]/50 bg-[#E2E8F0]/15 text-[#EAECEF]'
                : 'border-[#2B3139] bg-[#0B0E11] text-[#5E6673]'
            }`}
          >
            EMA 200
          </button>
          <button
            type="button"
            onClick={() => setShowSR((v) => !v)}
            className={`min-h-[40px] rounded-lg border px-2.5 text-xs font-medium transition ${
              showSR
                ? 'border-[#00C087]/50 bg-[#00C087]/15 text-[#00C087]'
                : 'border-[#2B3139] bg-[#0B0E11] text-[#5E6673]'
            }`}
          >
            Auto S/R
          </button>
        </div>
      </div>

      {/* Live EMA Readout Strip */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono tabular-nums text-[#F0B90B]">
            EMA20: {formatRawPrice(summary.ema20)}
          </span>
          <span className="font-mono tabular-nums text-[#38BDF8]">
            EMA50: {formatRawPrice(summary.ema50)}
          </span>
          <span className="font-mono tabular-nums text-[#EAECEF]">
            EMA200: {formatRawPrice(summary.ema200)}
          </span>
        </div>
        <span className="text-[#5E6673]">
          {symbol} · {isFallback ? 'Simulated OHLCV' : 'Binance Live Klines'}
        </span>
      </div>

      {/* Main Candlestick Pane */}
      <div className="relative overflow-hidden rounded-xl border border-[#2B3139] bg-[#0B0E11]">
        {isLoading && candles.length === 0 ? (
          <div className="flex h-[360px] items-center justify-center text-xs text-[#848E9C]">
            Memuat data candle {symbol}...
          </div>
        ) : (
          <div ref={mainContainerRef} className="w-full" />
        )}
      </div>

      {/* RSI (14) Sub-Pane */}
      <div className="mt-2 overflow-hidden rounded-xl border border-[#2B3139] bg-[#0B0E11]">
        <div className="flex items-center justify-between border-b border-[#1E2329] px-3 py-1.5 text-[11px]">
          <span className="font-semibold text-[#848E9C]">RSI (14)</span>
          <span
            className={`font-mono tabular-nums font-bold ${
              summary.rsi14 < 30
                ? 'text-[#00C087]'
                : summary.rsi14 > 70
                  ? 'text-[#F6465D]'
                  : 'text-[#F0B90B]'
            }`}
          >
            {summary.rsi14.toFixed(2)}
          </span>
        </div>
        <div ref={rsiContainerRef} className="w-full" />
      </div>
    </section>
  );
}
