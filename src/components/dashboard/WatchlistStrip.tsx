import { Bell, CandlestickChart, Star } from 'lucide-react';
import type { Coin } from '../../types';
import { formatPercent, formatPrice } from '../../utils/format';

interface WatchlistStripProps {
  watchlistSymbols: string[];
  coinsMap: Record<string, Coin>;
  onOpenAnalysis: (symbol: string) => void;
  onOpenAlert: (symbol: string) => void;
  onToggleWatchlist: (symbol: string) => void;
}

export function WatchlistStrip({
  watchlistSymbols,
  coinsMap,
  onOpenAnalysis,
  onOpenAlert,
  onToggleWatchlist,
}: WatchlistStripProps) {
  const watchedCoins = watchlistSymbols
    .map((sym) => coinsMap[sym])
    .filter((c): c is Coin => Boolean(c));

  return (
    <section aria-label="Watchlist Favorit" className="cp-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 fill-[#F0B90B] text-[#F0B90B]" />
          <h2 className="text-sm font-semibold text-[#EAECEF]">Watchlist Favorit</h2>
          <span className="font-mono tabular-nums rounded-md bg-[#1E2329] px-2 py-0.5 text-[11px] font-medium text-[#848E9C]">
            {watchedCoins.length}
          </span>
        </div>
        <span className="text-xs text-[#848E9C]">Akses cepat Analisa &amp; Alert</span>
      </div>

      {watchedCoins.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#2B3139] bg-[#0B0E11] px-4 py-6 text-center text-xs text-[#848E9C]">
          Belum ada coin favorit. Tekan ikon ★ di Screener untuk menambahkan ke Watchlist.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {watchedCoins.map((coin) => {
            const positive = coin.priceChangePercent24h >= 0;
            return (
              <div
                key={coin.symbol}
                className="flex flex-col justify-between rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3 transition hover:border-[#474D57]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-[#EAECEF]">{coin.baseAsset}</span>
                      <span className="rounded bg-[#1E2329] px-1.5 py-0.5 text-[10px] text-[#848E9C]">
                        {coin.sector}
                      </span>
                    </div>
                    <p className="font-mono tabular-nums mt-1 text-sm font-semibold text-[#EAECEF]">
                      {formatPrice(coin.price)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleWatchlist(coin.symbol)}
                    aria-label={`Hapus ${coin.baseAsset} dari watchlist`}
                    className="flex h-10 w-10 -mr-2 -mt-2 shrink-0 items-center justify-center rounded-lg text-[#F0B90B] hover:bg-[#1E2329]"
                  >
                    <Star className="h-4 w-4 fill-[#F0B90B]" />
                  </button>
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <span
                    className={`font-mono tabular-nums text-xs font-semibold ${
                      positive ? 'text-[#00C087]' : 'text-[#F6465D]'
                    }`}
                  >
                    {formatPercent(coin.priceChangePercent24h)}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOpenAnalysis(coin.symbol)}
                      title={`Analisa ${coin.baseAsset}`}
                      aria-label={`Analisa ${coin.baseAsset}`}
                      className="flex h-10 min-w-[40px] items-center justify-center gap-1 rounded-lg border border-[#2B3139] bg-[#161A1E] px-2.5 text-xs font-medium text-[#EAECEF] transition hover:border-[#F0B90B]/60 hover:text-[#F0B90B]"
                    >
                      <CandlestickChart className="h-3.5 w-3.5" />
                      <span className="sm:hidden xl:inline">Chart</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenAlert(coin.symbol)}
                      title={`Pasang Alert ${coin.baseAsset}`}
                      aria-label={`Pasang Price Alert ${coin.baseAsset}`}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#2B3139] bg-[#161A1E] text-[#F0B90B] transition hover:border-[#F0B90B]/60"
                    >
                      <Bell className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
