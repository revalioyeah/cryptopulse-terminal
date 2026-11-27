import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import type { Coin } from '../../types';
import { formatPercent, formatPrice } from '../../utils/format';

interface CoinSearchSelectProps {
  coins: Coin[];
  value: string;
  onChange: (symbol: string) => void;
  id?: string;
  className?: string;
}

export function CoinSearchSelect({
  coins,
  value,
  onChange,
  id,
  className = '',
}: CoinSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(
    () => coins.find((c) => c.symbol === value) ?? coins[0],
    [coins, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return coins.slice(0, 80);
    return coins
      .filter(
        (c) =>
          c.baseAsset.toLowerCase().includes(q) ||
          c.symbol.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q),
      )
      .slice(0, 80);
  }, [coins, query]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    const handleOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        id={id}
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setQuery('');
        }}
        className="flex min-h-[42px] w-full items-center justify-between gap-2 rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-left text-xs font-bold text-[#EAECEF] transition hover:border-[#F0B90B]/60"
      >
        <span className="truncate">
          {selected ? `${selected.baseAsset}/USDT` : 'Pilih Coin'}
          {selected && selected.name !== selected.baseAsset && (
            <span className="ml-1.5 font-normal text-[#848E9C]">— {selected.name}</span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#848E9C] transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1.5 min-w-[240px] overflow-hidden rounded-xl border border-[#2B3139] bg-[#161A1E] shadow-2xl">
          <div className="border-b border-[#2B3139] p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#848E9C]" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Cari dari ${coins.length} coin Binance...`}
                className="min-h-[38px] w-full rounded-lg border border-[#2B3139] bg-[#0B0E11] pl-8 pr-2.5 text-xs text-[#EAECEF] placeholder-[#5E6673] focus:border-[#F0B90B] focus:outline-none"
              />
            </div>
          </div>

          <div className="cp-scrollbar max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="py-4 text-center text-xs text-[#5E6673]">Coin tidak ditemukan.</p>
            ) : (
              filtered.map((c) => {
                const isSelected = c.symbol === value;
                const pos = c.priceChangePercent24h >= 0;
                return (
                  <button
                    key={c.symbol}
                    type="button"
                    onClick={() => {
                      onChange(c.symbol);
                      setOpen(false);
                    }}
                    className={`flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                      isSelected
                        ? 'bg-[#F0B90B]/15 text-[#F0B90B]'
                        : 'text-[#EAECEF] hover:bg-[#1E2329]'
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="font-bold">{c.baseAsset}</span>
                      <span className="ml-1 text-[10px] text-[#5E6673]">/USDT</span>
                      {c.name !== c.baseAsset && (
                        <span className="ml-1.5 truncate text-[10px] text-[#848E9C]">{c.name}</span>
                      )}
                    </div>
                    <div className="font-mono tabular-nums shrink-0 text-right">
                      <span className="mr-2 font-medium text-[#EAECEF]">{formatPrice(c.price)}</span>
                      <span className={`text-[10px] font-semibold ${pos ? 'text-[#00C087]' : 'text-[#F6465D]'}`}>
                        {formatPercent(c.priceChangePercent24h, 1)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
