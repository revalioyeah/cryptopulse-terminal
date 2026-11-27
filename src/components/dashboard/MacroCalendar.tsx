import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, LockOpen, ShieldCheck } from 'lucide-react';
import type { Coin } from '../../types';
import { getMacroAndUnlockEvents } from '../../services/adapters/calendarAdapter';
import { formatCompactUsd, formatCountdown, formatDateTime } from '../../utils/format';

interface MacroCalendarProps {
  coinsMap: Record<string, Coin>;
  onSelectCoin: (symbol: string) => void;
}

export function MacroCalendar({ coinsMap, onSelectCoin }: MacroCalendarProps) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Re-evaluate upcoming official schedules each minute so passed events roll over automatically
  const minuteBucket = Math.floor(nowMs / 60_000);
  const events = useMemo(
    () => getMacroAndUnlockEvents(minuteBucket * 60_000),
    [minuteBucket],
  );

  return (
    <section aria-label="Macro dan Token Unlock Calendar" className="cp-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarClock className="h-4 w-4 text-[#F0B90B]" />
          <h2 className="text-sm font-semibold text-[#EAECEF]">
            Macro &amp; Token Unlock Calendar
          </h2>
          <span className="inline-flex items-center gap-1 rounded-full border border-[#00C087]/30 bg-[#00C087]/10 px-2 py-0.5 text-[10px] font-medium text-[#00C087]">
            <ShieldCheck className="h-3 w-3" />
            Jadwal Resmi + Harga Live
          </span>
        </div>
        <span className="text-xs text-[#848E9C]">
          Fed · BLS · BEA · Tokenomist (Waktu Lokal)
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {events.map((ev) => {
          const isUnlock = ev.category === 'Token Unlock';
          const liveCoin = ev.symbol ? coinsMap[ev.symbol] : undefined;
          const isLivePriced = Boolean(
            isUnlock && ev.unlockTokenAmount && liveCoin && liveCoin.price > 0,
          );
          const unlockUsdValue =
            isLivePriced && ev.unlockTokenAmount && liveCoin
              ? ev.unlockTokenAmount * liveCoin.price
              : ev.unlockUsdValue;

          return (
            <div
              key={ev.id}
              className="flex flex-col justify-between rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3.5"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${
                        isUnlock
                          ? 'bg-[#F0B90B]/15 text-[#F0B90B]'
                          : 'bg-[#1E2329] text-[#EAECEF]'
                      }`}
                    >
                      {isUnlock && <LockOpen className="h-3 w-3" />}
                      {ev.category}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        ev.impact === 'High'
                          ? 'bg-[#F6465D]/15 text-[#F6465D]'
                          : 'bg-[#F0B90B]/15 text-[#F0B90B]'
                      }`}
                    >
                      {ev.impact} Impact
                    </span>
                  </div>
                  <span className="shrink-0 font-mono tabular-nums text-[11px] text-[#848E9C]">
                    {formatDateTime(ev.timestamp)}
                  </span>
                </div>

                <h3 className="mt-2 text-sm font-semibold text-[#EAECEF]">{ev.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-[#848E9C]">{ev.description}</p>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#2B3139] pt-2.5">
                <div className="min-w-0">
                  <span className="block text-[10px] uppercase tracking-wider text-[#5E6673]">
                    Countdown
                  </span>
                  <span className="font-mono tabular-nums text-sm font-bold text-[#F0B90B]">
                    {formatCountdown(ev.timestamp, nowMs)}
                  </span>
                  <span className="block truncate text-[10px] text-[#5E6673]">
                    Sumber: {ev.source}
                  </span>
                </div>

                {ev.symbol && unlockUsdValue !== undefined && unlockUsdValue > 0 ? (
                  <button
                    type="button"
                    onClick={() => onSelectCoin(ev.symbol!)}
                    className="min-h-[40px] shrink-0 rounded-lg border border-[#2B3139] bg-[#161A1E] px-2.5 py-1 text-right transition hover:border-[#F0B90B]/60"
                  >
                    <span className="flex items-center justify-end gap-1.5 font-mono tabular-nums text-xs font-semibold text-[#EAECEF]">
                      {isLivePriced && (
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-[#00C087]"
                          title="Valuasi dihitung otomatis dari harga live Binance"
                        />
                      )}
                      {formatCompactUsd(unlockUsdValue)}
                    </span>
                    <span className="font-mono tabular-nums text-[10px] text-[#848E9C]">
                      {ev.unlockSupplyPercent?.toFixed(2)}% supply · Analisa →
                    </span>
                  </button>
                ) : (
                  <div className="shrink-0 text-right">
                    <span className="block text-[11px] font-medium text-[#EAECEF]">
                      USD Macro Event
                    </span>
                    <span className="text-[10px] text-[#848E9C]">Jadwal Resmi AS</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
