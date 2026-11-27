import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CandlestickChart,
  ChevronLeft,
  ChevronRight,
  Search,
  ShieldCheck,
  Star,
} from 'lucide-react';
import type { Coin, ScreenerPreset, SectorName } from '../types';
import { useAppStore } from '../store/useAppStore';
import { useTradingStore } from '../store/useTradingStore';
import { formatCompactUsd, formatPercent, formatPrice } from '../utils/format';
import { AutoSignalBotPanel } from '../components/screener/AutoSignalBotPanel';

type SortKey = 'price' | 'priceChangePercent24h' | 'quoteVolume24h' | 'rsi14' | 'oiChange24h' | 'volumeSpikeRatio';

const PRESETS: Array<{ id: ScreenerPreset; label: string }> = [
  { id: 'ALL', label: 'Semua' },
  { id: 'WATCHLIST', label: '★ Watchlist' },
  { id: 'VOLUME_SPIKE', label: 'Volume Spike >200%' },
  { id: 'RSI_OVERSOLD', label: 'RSI Oversold <30' },
  { id: 'RSI_OVERBOUGHT', label: 'RSI Overbought >70' },
  { id: 'NEAR_BREAKOUT', label: 'Near Breakout' },
  { id: 'HIGH_OI', label: 'High OI' },
];

const SECTORS: Array<SectorName | 'ALL'> = [
  'ALL',
  'Layer 1',
  'AI',
  'DeFi',
  'Meme',
  'Layer 2',
  'RWA',
  'Altcoin',
];

const PAGE_SIZE = 50;

export function ScreenerPage() {
  const coins = useAppStore((s) => s.coins);
  const sectorFilter = useAppStore((s) => s.screenerSectorFilter);
  const preset = useAppStore((s) => s.screenerPreset);
  const setSectorFilter = useAppStore((s) => s.setScreenerSectorFilter);
  const setPreset = useAppStore((s) => s.setScreenerPreset);
  const openAnalysis = useAppStore((s) => s.openAnalysis);
  const openSetupForCoin = useAppStore((s) => s.openSetupForCoin);
  const pushToast = useAppStore((s) => s.pushToast);

  const watchlist = useTradingStore((s) => s.watchlist);
  const toggleWatchlist = useTradingStore((s) => s.toggleWatchlist);

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('quoteVolume24h');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(1);
  };

  useEffect(() => {
    setPage(1);
  }, [sectorFilter, preset, search]);

  const filteredCoins = useMemo<Coin[]>(() => {
    const q = search.trim().toLowerCase();
    const watchSet = new Set(watchlist);

    const list = coins.filter((c) => {
      if (sectorFilter !== 'ALL' && c.sector !== sectorFilter) return false;
      if (q && !c.baseAsset.toLowerCase().includes(q) && !c.name.toLowerCase().includes(q) && !c.symbol.toLowerCase().includes(q)) {
        return false;
      }
      switch (preset) {
        case 'WATCHLIST':
          return watchSet.has(c.symbol);
        case 'VOLUME_SPIKE':
          return c.volumeSpikeRatio >= 2.0;
        case 'RSI_OVERSOLD':
          return c.rsi14 < 30;
        case 'RSI_OVERBOUGHT':
          return c.rsi14 > 70;
        case 'NEAR_BREAKOUT':
          return c.nearBreakout;
        case 'HIGH_OI':
          return c.oiChange24h >= 5;
        default:
          return true;
      }
    });

    return [...list].sort((a, b) => {
      const mul = sortDir === 'desc' ? -1 : 1;
      return (a[sortKey] - b[sortKey]) * mul;
    });
  }, [coins, sectorFilter, preset, search, watchlist, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredCoins.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleCoins = useMemo(
    () => filteredCoins.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredCoins, safePage],
  );

  const handleStar = (coin: Coin) => {
    const added = toggleWatchlist(coin.symbol);
    pushToast(
      added ? `${coin.baseAsset} masuk Watchlist` : `${coin.baseAsset} dihapus dari Watchlist`,
      undefined,
      added ? 'success' : 'info',
    );
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === 'desc' ? (
      <ArrowDown className="h-3 w-3 text-[#F0B90B]" />
    ) : (
      <ArrowUp className="h-3 w-3 text-[#F0B90B]" />
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[#EAECEF] sm:text-2xl">
          Smart Crypto Screener
        </h1>
        <p className="mt-0.5 text-xs text-[#848E9C]">
          Filter momentum teknikal real-time, narasi sektor, dan pemindai sinyal otomatis.
        </p>
      </div>

      {/* Auto-Signal Scanner Bot */}
      <AutoSignalBotPanel />

      {/* Screener Filters Bar */}
      <section aria-label="Filter Screener" className="cp-card space-y-3 p-4">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#848E9C]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari symbol atau nama (BTC, SOL, TAO)..."
              className="min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] pl-9 pr-3 text-xs text-[#EAECEF] placeholder-[#5E6673] focus:border-[#F0B90B] focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {SECTORS.map((sec) => {
              const active = sectorFilter === sec;
              return (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setSectorFilter(sec)}
                  className={`min-h-[40px] rounded-lg px-3 text-xs font-medium transition ${
                    active
                      ? 'bg-[#F0B90B] text-[#0B0E11] font-semibold'
                      : 'border border-[#2B3139] bg-[#0B0E11] text-[#848E9C] hover:text-[#EAECEF]'
                  }`}
                >
                  {sec === 'ALL' ? 'Semua Narasi' : sec}
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[#2B3139] pt-3">
          {PRESETS.map((p) => {
            const active = preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className={`min-h-[40px] rounded-lg border px-3 text-xs font-medium transition ${
                  active
                    ? 'border-[#F0B90B] bg-[#F0B90B]/15 text-[#F0B90B]'
                    : 'border-[#2B3139] bg-[#1E2329] text-[#848E9C] hover:text-[#EAECEF]'
                }`}
              >
                {p.label}
              </button>
            );
          })}
          <span className="font-mono tabular-nums ml-auto text-xs text-[#848E9C]">
            {filteredCoins.length} aset
          </span>
        </div>
      </section>

      {/* Desktop Sortable Table (>= 1024px) */}
      <section aria-label="Tabel Screener Desktop" className="cp-card hidden overflow-hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#2B3139] bg-[#0B0E11] text-[11px] uppercase tracking-wider text-[#848E9C]">
                <th className="w-10 px-3 py-3 text-center">★</th>
                <th className="px-3 py-3">Aset / Narasi</th>
                <th className="px-3 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('price')}
                    className="inline-flex items-center gap-1 hover:text-[#EAECEF]"
                  >
                    Harga {renderSortIcon('price')}
                  </button>
                </th>
                <th className="px-3 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('priceChangePercent24h')}
                    className="inline-flex items-center gap-1 hover:text-[#EAECEF]"
                  >
                    24h % {renderSortIcon('priceChangePercent24h')}
                  </button>
                </th>
                <th className="px-3 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('quoteVolume24h')}
                    className="inline-flex items-center gap-1 hover:text-[#EAECEF]"
                  >
                    Vol 24h {renderSortIcon('quoteVolume24h')}
                  </button>
                </th>
                <th className="px-3 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('volumeSpikeRatio')}
                    className="inline-flex items-center gap-1 hover:text-[#EAECEF]"
                  >
                    Vol Spike {renderSortIcon('volumeSpikeRatio')}
                  </button>
                </th>
                <th className="px-3 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('rsi14')}
                    className="inline-flex items-center gap-1 hover:text-[#EAECEF]"
                  >
                    RSI (14) {renderSortIcon('rsi14')}
                  </button>
                </th>
                <th className="px-3 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('oiChange24h')}
                    className="inline-flex items-center gap-1 hover:text-[#EAECEF]"
                  >
                    OI 24h {renderSortIcon('oiChange24h')}
                  </button>
                </th>
                <th className="px-3 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2B3139]">
              {filteredCoins.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-[#848E9C]">
                    Tidak ada aset yang cocok dengan filter preset atau kata kunci ini.
                  </td>
                </tr>
              ) : (
                visibleCoins.map((coin) => {
                  const isStarred = watchlist.includes(coin.symbol);
                  const pos = coin.priceChangePercent24h >= 0;
                  const rsiColor =
                    coin.rsi14 < 30
                      ? 'text-[#00C087]'
                      : coin.rsi14 > 70
                        ? 'text-[#F6465D]'
                        : 'text-[#EAECEF]';

                  return (
                    <tr
                      key={coin.symbol}
                      className="transition hover:bg-[#1E2329]/70"
                    >
                      <td className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleStar(coin)}
                          aria-label={`Watchlist ${coin.baseAsset}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[#2B3139]"
                        >
                          <Star
                            className={`h-4 w-4 ${
                              isStarred ? 'fill-[#F0B90B] text-[#F0B90B]' : 'text-[#5E6673]'
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#EAECEF]">{coin.baseAsset}</span>
                          <span className="rounded bg-[#0B0E11] px-1.5 py-0.5 text-[10px] text-[#848E9C]">
                            {coin.sector}
                          </span>
                          {coin.nearBreakout && (
                            <span className="rounded bg-[#F0B90B]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#F0B90B]">
                              Breakout
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#5E6673]">{coin.name}</p>
                      </td>
                      <td className="font-mono tabular-nums px-3 py-2.5 text-right font-semibold text-[#EAECEF]">
                        {formatPrice(coin.price)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span
                          className={`font-mono tabular-nums inline-block rounded px-2 py-0.5 font-semibold ${
                            pos
                              ? 'bg-[#00C087]/15 text-[#00C087]'
                              : 'bg-[#F6465D]/15 text-[#F6465D]'
                          }`}
                        >
                          {formatPercent(coin.priceChangePercent24h)}
                        </span>
                      </td>
                      <td className="font-mono tabular-nums px-3 py-2.5 text-right text-[#EAECEF]">
                        {formatCompactUsd(coin.quoteVolume24h)}
                      </td>
                      <td className="font-mono tabular-nums px-3 py-2.5 text-right">
                        <span
                          className={
                            coin.volumeSpikeRatio >= 2
                              ? 'font-semibold text-[#F0B90B]'
                              : 'text-[#848E9C]'
                          }
                        >
                          {(coin.volumeSpikeRatio * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className={`font-mono tabular-nums px-3 py-2.5 text-right font-medium ${rsiColor}`}>
                        {coin.rsi14.toFixed(1)}
                      </td>
                      <td
                        className={`font-mono tabular-nums px-3 py-2.5 text-right font-medium ${
                          coin.oiChange24h >= 0 ? 'text-[#00C087]' : 'text-[#F6465D]'
                        }`}
                      >
                        {formatPercent(coin.oiChange24h, 1)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openAnalysis(coin.symbol)}
                            className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#2B3139] bg-[#0B0E11] px-2.5 text-xs font-medium text-[#EAECEF] transition hover:border-[#F0B90B]/60 hover:text-[#F0B90B]"
                          >
                            <CandlestickChart className="h-3.5 w-3.5" />
                            Analisa
                          </button>
                          <button
                            type="button"
                            onClick={() => openSetupForCoin(coin.symbol)}
                            className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#F0B90B]/15 px-2.5 text-xs font-semibold text-[#F0B90B] transition hover:bg-[#F0B90B] hover:text-[#0B0E11]"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Setup
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Mobile Compact Card List (< 1024px) */}
      <section aria-label="Daftar Screener Mobile" className="space-y-2.5 lg:hidden">
        {filteredCoins.length === 0 ? (
          <div className="cp-card p-8 text-center text-xs text-[#848E9C]">
            Tidak ada aset yang cocok dengan filter preset atau kata kunci ini.
          </div>
        ) : (
          visibleCoins.map((coin) => {
            const isStarred = watchlist.includes(coin.symbol);
            const pos = coin.priceChangePercent24h >= 0;

            return (
              <div key={coin.symbol} className="cp-card p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleStar(coin)}
                      aria-label={`Watchlist ${coin.baseAsset}`}
                      className="flex h-10 w-10 -ml-1 shrink-0 items-center justify-center rounded-lg border border-[#2B3139] bg-[#0B0E11]"
                    >
                      <Star
                        className={`h-4 w-4 ${
                          isStarred ? 'fill-[#F0B90B] text-[#F0B90B]' : 'text-[#5E6673]'
                        }`}
                      />
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-[#EAECEF]">{coin.baseAsset}</span>
                        <span className="rounded bg-[#0B0E11] px-1.5 py-0.5 text-[10px] text-[#848E9C]">
                          {coin.sector}
                        </span>
                      </div>
                      <p className="truncate text-[11px] text-[#5E6673]">{coin.name}</p>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="font-mono tabular-nums text-sm font-bold text-[#EAECEF]">
                      {formatPrice(coin.price)}
                    </p>
                    <span
                      className={`font-mono tabular-nums inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                        pos ? 'bg-[#00C087]/15 text-[#00C087]' : 'bg-[#F6465D]/15 text-[#F6465D]'
                      }`}
                    >
                      {formatPercent(coin.priceChangePercent24h)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-[#0B0E11] p-2 text-center">
                  <div>
                    <span className="block text-[10px] text-[#5E6673]">Vol 24h</span>
                    <span className="font-mono tabular-nums text-xs font-medium text-[#EAECEF]">
                      {formatCompactUsd(coin.quoteVolume24h)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-[#5E6673]">RSI (14)</span>
                    <span
                      className={`font-mono tabular-nums text-xs font-semibold ${
                        coin.rsi14 < 30
                          ? 'text-[#00C087]'
                          : coin.rsi14 > 70
                            ? 'text-[#F6465D]'
                            : 'text-[#EAECEF]'
                      }`}
                    >
                      {coin.rsi14.toFixed(1)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-[#5E6673]">OI 24h</span>
                    <span
                      className={`font-mono tabular-nums text-xs font-semibold ${
                        coin.oiChange24h >= 0 ? 'text-[#00C087]' : 'text-[#F6465D]'
                      }`}
                    >
                      {formatPercent(coin.oiChange24h, 1)}
                    </span>
                  </div>
                </div>

                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => openAnalysis(coin.symbol)}
                    className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-[#2B3139] bg-[#1E2329] text-xs font-medium text-[#EAECEF]"
                  >
                    <CandlestickChart className="h-3.5 w-3.5 text-[#F0B90B]" />
                    Analisa Coin
                  </button>
                  <button
                    type="button"
                    onClick={() => openSetupForCoin(coin.symbol)}
                    className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-[#F0B90B] text-xs font-semibold text-[#0B0E11]"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Buat Setup
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="cp-card flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs">
          <span className="font-mono tabular-nums text-[#848E9C]">
            Menampilkan {(safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, filteredCoins.length)} dari {filteredCoins.length} aset Binance USDT
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-[#2B3139] bg-[#0B0E11] px-3 font-semibold text-[#EAECEF] transition hover:border-[#F0B90B]/60 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>
            <span className="font-mono tabular-nums px-2 font-bold text-[#F0B90B]">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-[#2B3139] bg-[#0B0E11] px-3 font-semibold text-[#EAECEF] transition hover:border-[#F0B90B]/60 disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
