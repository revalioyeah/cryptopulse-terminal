import { useMemo, useState } from 'react';
import { FlaskConical, Sparkles } from 'lucide-react';
import type { BacktestResult, BacktestStrategyId, Coin, Timeframe } from '../../types';
import { useBinanceKlinesQuery } from '../../hooks/useMarketQueries';
import { runBacktest } from '../../services/backtestEngine';
import { formatPercent, formatPrice } from '../../utils/format';
import { EquityCurveChart } from './EquityCurveChart';

interface BacktestPanelProps {
  coin: Coin;
  onApplyToSetup: (result: BacktestResult) => void;
}

const STRATEGIES: Array<{ id: BacktestStrategyId; label: string; desc: string }> = [
  {
    id: 'ema_pullback',
    label: 'EMA 20/50 Pullback',
    desc: 'Ikuti trend EMA 20/50 saat retest dinamis di area nilai.',
  },
  {
    id: 'breakout_volume',
    label: 'Breakout + Volume Spike',
    desc: 'Breakout high/low 20-bar dengan konfirmasi lonjakan volume.',
  },
  {
    id: 'rsi_reversal',
    label: 'RSI Reversal',
    desc: 'Pembalikan arah saat RSI keluar dari zona jenuh (<33 / >67).',
  },
];

const TF_OPTIONS: Array<{ id: Timeframe; label: string }> = [
  { id: '15m', label: '15m' },
  { id: '1h', label: '1H' },
  { id: '4h', label: '4H' },
  { id: '1d', label: '1D' },
];

export function BacktestPanel({ coin, onApplyToSetup }: BacktestPanelProps) {
  const [strategy, setStrategy] = useState<BacktestStrategyId>('ema_pullback');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [targetRR, setTargetRR] = useState<number>(2.0);
  const [atrMultiplier, setAtrMultiplier] = useState<number>(1.5);

  const klinesQuery = useBinanceKlinesQuery(coin.symbol, timeframe, 500, coin.price);
  const candles = klinesQuery.data?.candles ?? [];

  const result = useMemo<BacktestResult | null>(() => {
    if (candles.length < 80) return null;
    return runBacktest(candles, {
      symbol: coin.symbol,
      strategy,
      timeframe,
      targetRR,
      atrMultiplier,
      feeRate: 0.001, // 0.1% fee deduction
    });
  }, [candles, coin.symbol, strategy, timeframe, targetRR, atrMultiplier]);

  const gradeBadge = (grade: BacktestResult['grade']) => {
    if (grade === 'A+' || grade === 'A') return 'bg-[#00C087]/20 text-[#00C087] border-[#00C087]/40';
    if (grade === 'B+' || grade === 'B') return 'bg-[#F0B90B]/15 text-[#F0B90B] border-[#F0B90B]/40';
    return 'bg-[#F6465D]/15 text-[#F6465D] border-[#F6465D]/40';
  };

  return (
    <section aria-label="Backtest-First Strategy Engine" className="cp-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2B3139] pb-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-[#F0B90B]" />
          <div>
            <h2 className="text-sm font-semibold text-[#EAECEF]">
              Backtest-First Strategy Engine ({coin.baseAsset}/USDT)
            </h2>
            <p className="text-[11px] text-[#848E9C]">
              Anti look-ahead bias (entry di open bar berikut) · Fee 0.1% · {candles.length} candle historis
            </p>
          </div>
        </div>

        {result && (
          <button
            id="btn-apply-backtest"
            type="button"
            onClick={() => onApplyToSetup(result)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#F0B90B] px-3.5 text-xs font-semibold text-[#0B0E11] transition hover:bg-[#F0B90B]/90"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>1-Klik Terapkan ke Setup</span>
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label
            htmlFor="bt-strategy"
            className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#848E9C]"
          >
            Preset Strategi
          </label>
          <select
            id="bt-strategy"
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as BacktestStrategyId)}
            className="min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-xs font-medium text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
          >
            {STRATEGIES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#848E9C]">
            Timeframe
          </span>
          <div className="grid grid-cols-4 gap-1 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-1">
            {TF_OPTIONS.map((tf) => (
              <button
                key={tf.id}
                type="button"
                onClick={() => setTimeframe(tf.id)}
                className={`font-mono tabular-nums min-h-[34px] rounded-lg text-xs font-semibold transition ${
                  timeframe === tf.id
                    ? 'bg-[#F0B90B] text-[#0B0E11]'
                    : 'text-[#848E9C] hover:text-[#EAECEF]'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="bt-rr"
            className="mb-1 flex justify-between text-[11px] font-medium uppercase tracking-wide text-[#848E9C]"
          >
            <span>Target R:R</span>
            <span className="font-mono tabular-nums text-[#EAECEF]">1 : {targetRR.toFixed(1)}</span>
          </label>
          <input
            id="bt-rr"
            type="range"
            min={1.2}
            max={4.0}
            step={0.1}
            value={targetRR}
            onChange={(e) => setTargetRR(Number(e.target.value))}
            className="mt-2 h-2 w-full cursor-pointer accent-[#F0B90B]"
          />
        </div>

        <div>
          <label
            htmlFor="bt-atr"
            className="mb-1 flex justify-between text-[11px] font-medium uppercase tracking-wide text-[#848E9C]"
          >
            <span>ATR Multiplier (SL)</span>
            <span className="font-mono tabular-nums text-[#EAECEF]">{atrMultiplier.toFixed(1)}x</span>
          </label>
          <input
            id="bt-atr"
            type="range"
            min={0.8}
            max={3.0}
            step={0.1}
            value={atrMultiplier}
            onChange={(e) => setAtrMultiplier(Number(e.target.value))}
            className="mt-2 h-2 w-full cursor-pointer accent-[#F0B90B]"
          />
        </div>
      </div>

      {/* Results Summary */}
      {result ? (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
              <span className="text-[10px] uppercase tracking-wider text-[#848E9C]">Grade</span>
              <div className="mt-1">
                <span
                  className={`font-mono tabular-nums inline-block rounded-lg border px-2.5 py-0.5 text-base font-bold ${gradeBadge(
                    result.grade,
                  )}`}
                >
                  {result.grade}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
              <span className="text-[10px] uppercase tracking-wider text-[#848E9C]">Win Rate</span>
              <p className="font-mono tabular-nums mt-1 text-base font-bold text-[#EAECEF]">
                {result.winRate.toFixed(1)}%
              </p>
              <p className="font-mono tabular-nums text-[10px] text-[#5E6673]">
                {result.wins}W / {result.losses}L ({result.totalTrades})
              </p>
            </div>

            <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
              <span className="text-[10px] uppercase tracking-wider text-[#848E9C]">
                Profit Factor
              </span>
              <p
                className={`font-mono tabular-nums mt-1 text-base font-bold ${
                  result.profitFactor >= 1.3 ? 'text-[#00C087]' : 'text-[#F0B90B]'
                }`}
              >
                {result.profitFactor.toFixed(2)}
              </p>
            </div>

            <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
              <span className="text-[10px] uppercase tracking-wider text-[#848E9C]">Net PnL</span>
              <p
                className={`font-mono tabular-nums mt-1 text-base font-bold ${
                  result.netPnlPercent >= 0 ? 'text-[#00C087]' : 'text-[#F6465D]'
                }`}
              >
                {formatPercent(result.netPnlPercent)}
              </p>
            </div>

            <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
              <span className="text-[10px] uppercase tracking-wider text-[#848E9C]">Max DD</span>
              <p className="font-mono tabular-nums mt-1 text-base font-bold text-[#F6465D]">
                -{result.maxDrawdownPercent.toFixed(2)}%
              </p>
            </div>

            <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
              <span className="text-[10px] uppercase tracking-wider text-[#848E9C]">Saran Sinyal</span>
              <p
                className={`mt-1 text-sm font-bold ${
                  result.suggestedDirection === 'LONG' ? 'text-[#00C087]' : 'text-[#F6465D]'
                }`}
              >
                {result.suggestedDirection}
              </p>
              <p className="font-mono tabular-nums text-[10px] text-[#848E9C]">
                SL {formatPrice(result.suggestedStopLoss)}
              </p>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-[#848E9C]">
              <span>Equity Curve (Normalized Base 100 · Risk 1%/Trade · Fee 0.1%)</span>
              <span className="font-mono tabular-nums">
                Akhir: {(100 + result.netPnlPercent).toFixed(2)}
              </span>
            </div>
            <EquityCurveChart points={result.equityCurve} height={155} />
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-6 text-center text-xs text-[#848E9C]">
          Memuat candle historis untuk simulasi backtest...
        </div>
      )}
    </section>
  );
}
