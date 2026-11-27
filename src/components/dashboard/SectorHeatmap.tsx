import { useMemo } from 'react';
import { ArrowUpRight, Flame } from 'lucide-react';
import type { Coin, SectorName, SectorStats } from '../../types';
import { formatCompactUsd, formatPercent } from '../../utils/format';

interface SectorHeatmapProps {
  coins: Coin[];
  onSelectSector: (sector: SectorName) => void;
}

const ORDERED_SECTORS: SectorName[] = ['Layer 1', 'AI', 'DeFi', 'Meme', 'Layer 2', 'RWA'];

export function SectorHeatmap({ coins, onSelectSector }: SectorHeatmapProps) {
  const sectors = useMemo<SectorStats[]>(() => {
    const grouped = new Map<SectorName, Coin[]>();
    for (const s of ORDERED_SECTORS) grouped.set(s, []);
    for (const coin of coins) {
      const bucket = grouped.get(coin.sector);
      if (bucket) bucket.push(coin);
    }

    const stats: SectorStats[] = [];
    for (const sector of ORDERED_SECTORS) {
      const list = grouped.get(sector) ?? [];
      if (list.length === 0) continue;
      const avgChange24h =
        list.reduce((acc, c) => acc + c.priceChangePercent24h, 0) / list.length;
      const totalVolume24h = list.reduce((acc, c) => acc + c.quoteVolume24h, 0);
      const leader = [...list].sort((a, b) => b.priceChangePercent24h - a.priceChangePercent24h)[0];

      stats.push({
        sector,
        avgChange24h,
        totalVolume24h,
        leaderSymbol: leader.symbol,
        leaderBaseAsset: leader.baseAsset,
        leaderChange24h: leader.priceChangePercent24h,
        coinCount: list.length,
      });
    }
    return stats;
  }, [coins]);

  return (
    <section aria-label="Narrative dan Sector Rotation Heatmap" className="cp-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-[#F0B90B]" />
          <h2 className="text-sm font-semibold text-[#EAECEF]">
            Narrative &amp; Sector Rotation Heatmap (24h)
          </h2>
        </div>
        <span className="text-xs text-[#848E9C]">Klik sektor untuk saring Screener</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        {sectors.map((item) => {
          const isPositive = item.avgChange24h >= 0;
          const intensity = Math.min(1, Math.abs(item.avgChange24h) / 8);
          const bgStyle = isPositive
            ? `rgba(0, 192, 135, ${(0.07 + intensity * 0.16).toFixed(2)})`
            : `rgba(246, 70, 93, ${(0.07 + intensity * 0.16).toFixed(2)})`;

          return (
            <button
              key={item.sector}
              type="button"
              onClick={() => onSelectSector(item.sector)}
              style={{ backgroundColor: bgStyle }}
              className="group flex min-h-[112px] flex-col justify-between rounded-xl border border-[#2B3139] p-3 text-left transition hover:border-[#F0B90B]/60"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-xs font-semibold text-[#EAECEF]">
                  {item.sector}
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[#848E9C] transition group-hover:text-[#F0B90B]" />
              </div>

              <div className="my-1.5">
                <p
                  className={`font-mono tabular-nums text-lg font-bold ${
                    isPositive ? 'text-[#00C087]' : 'text-[#F6465D]'
                  }`}
                >
                  {formatPercent(item.avgChange24h)}
                </p>
                <p className="font-mono tabular-nums text-[11px] text-[#848E9C]">
                  Vol {formatCompactUsd(item.totalVolume24h)}
                </p>
              </div>

              <div className="flex items-center justify-between border-t border-white/10 pt-1.5 text-[11px]">
                <span className="truncate text-[#848E9C]">
                  Lead: <strong className="text-[#EAECEF]">{item.leaderBaseAsset}</strong>
                </span>
                <span
                  className={`font-mono tabular-nums font-medium ${
                    item.leaderChange24h >= 0 ? 'text-[#00C087]' : 'text-[#F6465D]'
                  }`}
                >
                  {formatPercent(item.leaderChange24h, 1)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
