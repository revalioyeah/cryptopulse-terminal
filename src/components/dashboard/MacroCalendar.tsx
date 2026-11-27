import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, LockOpen } from 'lucide-react';
import { getMacroAndUnlockEvents } from '../../services/adapters/mockData';
import { formatCompactUsd, formatCountdown, formatDateTime } from '../../utils/format';

interface MacroCalendarProps {
  onSelectCoin: (symbol: string) => void;
}

export function MacroCalendar({ onSelectCoin }: MacroCalendarProps) {
  const events = useMemo(() => getMacroAndUnlockEvents(), []);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section aria-label="Macro dan Token Unlock Calendar" className="cp-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-[#F0B90B]" />
          <h2 className="text-sm font-semibold text-[#EAECEF]">
            Macro &amp; Token Unlock Calendar
          </h2>
        </div>
        <span className="text-xs text-[#848E9C]">FOMC · CPI · PCE · Major Unlocks</span>
      </div>

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {events.map((ev) => {
          const isUnlock = ev.category === 'Token Unlock';
          return (
            <div
              key={ev.id}
              className="flex flex-col justify-between rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3.5"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
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
                  <span className="font-mono tabular-nums text-[11px] text-[#848E9C]">
                    {formatDateTime(ev.timestamp)}
                  </span>
                </div>

                <h3 className="mt-2 text-sm font-semibold text-[#EAECEF]">{ev.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-[#848E9C]">{ev.description}</p>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#2B3139] pt-2.5">
                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-[#5E6673]">
                    Countdown
                  </span>
                  <span className="font-mono tabular-nums text-sm font-bold text-[#F0B90B]">
                    {formatCountdown(ev.timestamp, nowMs)}
                  </span>
                </div>

                {ev.symbol && ev.unlockUsdValue ? (
                  <button
                    type="button"
                    onClick={() => onSelectCoin(ev.symbol!)}
                    className="min-h-[40px] rounded-lg border border-[#2B3139] bg-[#161A1E] px-2.5 py-1 text-right transition hover:border-[#F0B90B]/60"
                  >
                    <span className="font-mono tabular-nums block text-xs font-semibold text-[#EAECEF]">
                      {formatCompactUsd(ev.unlockUsdValue)}
                    </span>
                    <span className="font-mono tabular-nums text-[10px] text-[#848E9C]">
                      {ev.unlockSupplyPercent?.toFixed(2)}% supply · Analisa →
                    </span>
                  </button>
                ) : (
                  <span className="text-[11px] font-medium text-[#848E9C]">USD Macro Event</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
