import { useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Bell, ShieldCheck, Star } from 'lucide-react';
import type { MtfTrendItem, Timeframe } from '../types';
import { useBinanceKlinesQuery } from '../hooks/useMarketQueries';
import { fetchBinanceKlines } from '../services/adapters/binanceAdapter';
import {
  computeLiquidationClusters,
  fetchDerivativesSnapshot,
} from '../services/adapters/derivativesAdapter';
import { buildTechnicalSummary, evaluateSingleTimeframeTrend } from '../services/indicators';
import { useAppStore } from '../store/useAppStore';
import { useTradingStore } from '../store/useTradingStore';
import { formatCompactUsd, formatPercent, formatPrice } from '../utils/format';
import { CoinSearchSelect } from '../components/ui/CoinSearchSelect';
import { InteractiveCandleChart } from '../components/analysis/InteractiveCandleChart';
import {
  DerivativesSnapshotCard,
  LiquidationClustersCard,
  MtfTrendMatrixCard,
  TechnicalSummaryCard,
} from '../components/analysis/AnalysisPanels';

const MTF_TIMEFRAMES: Array<'15m' | '1h' | '4h' | '1d'> = ['15m', '1h', '4h', '1d'];

export function AnalysisPage() {
  const coins = useAppStore((s) => s.coins);
  const coinsMap = useAppStore((s) => s.coinsMap);
  const selectedSymbol = useAppStore((s) => s.selectedSymbol);
  const setSelectedSymbol = useAppStore((s) => s.setSelectedSymbol);
  const openSetupForCoin = useAppStore((s) => s.openSetupForCoin);
  const openPriceAlertsModal = useAppStore((s) => s.openPriceAlertsModal);
  const pushToast = useAppStore((s) => s.pushToast);

  const watchlist = useTradingStore((s) => s.watchlist);
  const toggleWatchlist = useTradingStore((s) => s.toggleWatchlist);

  const [timeframe, setTimeframe] = useState<Timeframe>('1h');

  const coin = coinsMap[selectedSymbol] ?? coins[0];
  const isStarred = watchlist.includes(coin.symbol);

  const klinesQuery = useBinanceKlinesQuery(coin.symbol, timeframe, 300, coin.price);
  const candles = klinesQuery.data?.candles ?? [];

  const summary = useMemo(() => buildTechnicalSummary(candles), [candles]);

  const derivativesQuery = useQuery({
    queryKey: ['derivatives', coin.symbol],
    queryFn: () => fetchDerivativesSnapshot(coin),
    staleTime: 30_000,
    refetchInterval: 45_000,
  });

  const mtfQueries = useQueries({
    queries: MTF_TIMEFRAMES.map((tf) => ({
      queryKey: ['binance', 'klines-mtf', coin.symbol, tf],
      queryFn: () => fetchBinanceKlines(coin.symbol, tf, 120, coin.price),
      staleTime: 120_000,
      retry: 1,
    })),
  });

  const mtfItems = useMemo<MtfTrendItem[]>(() => {
    return MTF_TIMEFRAMES.map((tf, idx) => {
      const tfCandles = mtfQueries[idx]?.data?.candles ?? [];
      return evaluateSingleTimeframeTrend(tfCandles, tf);
    });
  }, [mtfQueries]);

  const liqClusters = useMemo(
    () => computeLiquidationClusters(coin, derivativesQuery.data?.openInterestUsd),
    [coin, derivativesQuery.data?.openInterestUsd],
  );
  const pos = coin.priceChangePercent24h >= 0;

  return (
    <div className="space-y-4">
      {/* Header & Coin Switcher */}
      <div className="cp-card flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[200px] flex-1 sm:flex-none">
            <CoinSearchSelect
              id="analysis-coin-select"
              coins={coins}
              value={coin.symbol}
              onChange={setSelectedSymbol}
            />
          </div>

          <div>
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="font-mono tabular-nums text-xl font-bold text-[#EAECEF] sm:text-2xl">
                {formatPrice(coin.price)}
              </h1>
              <span
                className={`font-mono tabular-nums rounded px-2 py-0.5 text-xs font-semibold ${
                  pos ? 'bg-[#00C087]/15 text-[#00C087]' : 'bg-[#F6465D]/15 text-[#F6465D]'
                }`}
              >
                {formatPercent(coin.priceChangePercent24h)}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  coin.hasFutures
                    ? 'bg-[#F0B90B]/15 text-[#F0B90B]'
                    : 'bg-[#1E2329] text-[#848E9C]'
                }`}
              >
                {coin.hasFutures
                  ? coin.futuresSymbol && coin.futuresSymbol !== coin.symbol
                    ? `FUTURES (${coin.futuresSymbol}) + SPOT`
                    : 'FUTURES + SPOT'
                  : 'SPOT ONLY'}
              </span>
            </div>
            <p className="font-mono tabular-nums mt-0.5 text-[11px] text-[#848E9C]">
              24h H {formatPrice(coin.high24h)} · L {formatPrice(coin.low24h)} · Vol{' '}
              {formatCompactUsd(coin.quoteVolume24h)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const added = toggleWatchlist(coin.symbol);
              pushToast(
                added ? `${coin.baseAsset} masuk Watchlist` : `${coin.baseAsset} dihapus dari Watchlist`,
                undefined,
                added ? 'success' : 'info',
              );
            }}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-xs font-medium text-[#EAECEF] hover:border-[#F0B90B]/60"
          >
            <Star
              className={`h-4 w-4 ${isStarred ? 'fill-[#F0B90B] text-[#F0B90B]' : 'text-[#848E9C]'}`}
            />
            <span>{isStarred ? 'Watchlist' : 'Bintangi'}</span>
          </button>

          <button
            type="button"
            onClick={() => openPriceAlertsModal(coin.symbol)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-xs font-medium text-[#EAECEF] hover:border-[#F0B90B]/60"
          >
            <Bell className="h-4 w-4 text-[#F0B90B]" />
            <span>Alert</span>
          </button>

          <button
            type="button"
            onClick={() => openSetupForCoin(coin.symbol, coin.hasFutures ? 'FUTURES' : 'SPOT')}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#F0B90B] px-3.5 text-xs font-semibold text-[#0B0E11] hover:bg-[#F0B90B]/90"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>{coin.hasFutures ? 'Setup Futures' : 'Setup Spot'}</span>
          </button>
        </div>
      </div>

      {/* Main Chart + Technical Summary Grid */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">
          <InteractiveCandleChart
            symbol={coin.symbol}
            timeframe={timeframe}
            onChangeTimeframe={setTimeframe}
            candles={candles}
            summary={summary}
            isLoading={klinesQuery.isLoading}
            isFallback={klinesQuery.data?.isFallback ?? false}
          />
        </div>
        <div className="min-w-0 space-y-4 xl:col-span-4">
          <TechnicalSummaryCard summary={summary} />
          {derivativesQuery.data && <DerivativesSnapshotCard data={derivativesQuery.data} />}
        </div>
      </div>

      {/* MTF Matrix & Liquidation Clusters */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-7">
          <MtfTrendMatrixCard items={mtfItems} />
        </div>
        <div className="min-w-0 xl:col-span-5">
          <LiquidationClustersCard clusters={liqClusters} />
        </div>
      </div>
    </div>
  );
}
