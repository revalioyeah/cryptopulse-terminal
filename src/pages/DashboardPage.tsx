import { RefreshCw } from 'lucide-react';
import { useGlobalMarketQuery, useFearGreedQuery } from '../hooks/useMarketQueries';
import { buildFallbackFearGreed, buildFallbackGlobalMarket } from '../services/adapters/mockData';
import { useAppStore } from '../store/useAppStore';
import { useTradingStore } from '../store/useTradingStore';
import { GlobalKpiCards } from '../components/dashboard/GlobalKpiCards';
import { SectorHeatmap } from '../components/dashboard/SectorHeatmap';
import { WatchlistStrip } from '../components/dashboard/WatchlistStrip';
import { TopMovers } from '../components/dashboard/TopMovers';
import { MacroCalendar } from '../components/dashboard/MacroCalendar';

export function DashboardPage() {
  const coins = useAppStore((s) => s.coins);
  const coinsMap = useAppStore((s) => s.coinsMap);
  const marketSource = useAppStore((s) => s.marketSource);
  const openAnalysis = useAppStore((s) => s.openAnalysis);
  const openScreenerForSector = useAppStore((s) => s.openScreenerForSector);
  const openPriceAlertsModal = useAppStore((s) => s.openPriceAlertsModal);
  const pushToast = useAppStore((s) => s.pushToast);

  const watchlist = useTradingStore((s) => s.watchlist);
  const toggleWatchlist = useTradingStore((s) => s.toggleWatchlist);

  const globalQuery = useGlobalMarketQuery();
  const fgQuery = useFearGreedQuery();

  const globalData = globalQuery.data ?? buildFallbackGlobalMarket();
  const fearGreed = fgQuery.data ?? buildFallbackFearGreed();

  const handleRefresh = () => {
    void globalQuery.refetch();
    void fgQuery.refetch();
    pushToast('Data Global Diperbarui', 'Menyegarkan data CoinGecko & Fear & Greed Index.', 'info');
  };

  const handleToggleWatchlist = (symbol: string) => {
    const added = toggleWatchlist(symbol);
    const asset = coinsMap[symbol]?.baseAsset ?? symbol;
    pushToast(
      added ? `${asset} ditambahkan ke Watchlist` : `${asset} dihapus dari Watchlist`,
      undefined,
      added ? 'success' : 'info',
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[#EAECEF] sm:text-2xl">
              Market Overview
            </h1>
            {marketSource === 'live' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-[#00C087]/15 px-2 py-0.5 text-[10px] font-bold text-[#00C087]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#00C087]" />
                {coins.length} PAIR BINANCE LIVE
              </span>
            )}
            {marketSource === 'fallback' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-[#F0B90B]/15 px-2 py-0.5 text-[10px] font-bold text-[#F0B90B]">
                MODE CACHE OFFLINE
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-[#848E9C]">
            Intelijen pasar real-time, rotasi narasi 24 jam, dan kalender katalis makro.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-[#2B3139] bg-[#161A1E] px-3.5 text-xs font-medium text-[#EAECEF] transition hover:border-[#F0B90B]/60 hover:text-[#F0B90B]"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${
              globalQuery.isFetching || fgQuery.isFetching ? 'animate-spin text-[#F0B90B]' : ''
            }`}
          />
          <span>Segarkan KPI</span>
        </button>
      </div>

      <GlobalKpiCards
        globalData={globalData}
        fearGreed={fearGreed}
        isLoading={(globalQuery.isLoading && !globalQuery.data) || (fgQuery.isLoading && !fgQuery.data)}
      />

      {marketSource === 'loading' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl border border-[#2B3139] bg-[#161A1E]"
            />
          ))}
        </div>
      ) : (
        <>
          <SectorHeatmap coins={coins} onSelectSector={openScreenerForSector} />

          <WatchlistStrip
            watchlistSymbols={watchlist}
            coinsMap={coinsMap}
            onOpenAnalysis={openAnalysis}
            onOpenAlert={(sym) => openPriceAlertsModal(sym)}
            onToggleWatchlist={handleToggleWatchlist}
          />

          <TopMovers coins={coins} onSelectCoin={openAnalysis} />

          <MacroCalendar coinsMap={coinsMap} onSelectCoin={openAnalysis} />
        </>
      )}
    </div>
  );
}
