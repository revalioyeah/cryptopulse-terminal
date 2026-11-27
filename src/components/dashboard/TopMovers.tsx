import { useMemo } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { Coin } from '../../types';
import { formatCompactUsd, formatPercent, formatPrice } from '../../utils/format';

interface TopMoversProps {
  coins: Coin[];
  onSelectCoin: (symbol: string) => void;
}

function MoverList({
  title,
  items,
  isGainer,
  onSelectCoin,
}: {
  title: string;
  items: Coin[];
  isGainer: boolean;
  onSelectCoin: (symbol: string) => void;
}) {
  return (
    <div className="cp-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isGainer ? (
            <TrendingUp className="h-4 w-4 text-[#00C087]" />
          ) : (
            <TrendingDown className="h-4 w-4 text-[#F6465D]" />
          )}
          <h2 className="text-sm font-semibold text-[#EAECEF]">{title}</h2>
        </div>
        <span className="text-[11px] text-[#848E9C]">Binance USDT · 24h</span>
      </div>

      <div className="space-y-1.5">
        {items.map((coin, index) => {
          const positive = coin.priceChangePercent24h >= 0;
          return (
            <button
              key={coin.symbol}
              type="button"
              onClick={() => onSelectCoin(coin.symbol)}
              className="flex min-h-[48px] w-full items-center justify-between gap-2 rounded-xl border border-transparent bg-[#0B0E11] px-3 py-2 text-left transition hover:border-[#2B3139] hover:bg-[#1E2329]"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="font-mono tabular-nums w-4 text-xs font-medium text-[#5E6673]">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-[#EAECEF]">{coin.baseAsset}</span>
                    <span className="truncate text-[11px] text-[#848E9C]">{coin.sector}</span>
                  </div>
                  <p className="font-mono tabular-nums text-[11px] text-[#5E6673]">
                    Vol {formatCompactUsd(coin.quoteVolume24h)}
                  </p>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <p className="font-mono tabular-nums text-sm font-semibold text-[#EAECEF]">
                  {formatPrice(coin.price)}
                </p>
                <span
                  className={`font-mono tabular-nums inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                    positive
                      ? 'bg-[#00C087]/15 text-[#00C087]'
                      : 'bg-[#F6465D]/15 text-[#F6465D]'
                  }`}
                >
                  {formatPercent(coin.priceChangePercent24h)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TopMovers({ coins, onSelectCoin }: TopMoversProps) {
  const { gainers, losers } = useMemo(() => {
    const sorted = [...coins].sort((a, b) => b.priceChangePercent24h - a.priceChangePercent24h);
    return {
      gainers: sorted.slice(0, 5),
      losers: [...sorted].reverse().slice(0, 5),
    };
  }, [coins]);

  return (
    <section aria-label="Top Gainers dan Top Losers" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <MoverList title="Top 5 Gainers (24h)" items={gainers} isGainer onSelectCoin={onSelectCoin} />
      <MoverList title="Top 5 Losers (24h)" items={losers} isGainer={false} onSelectCoin={onSelectCoin} />
    </section>
  );
}
