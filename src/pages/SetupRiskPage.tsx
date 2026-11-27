import { useCallback, useState } from 'react';
import type { BacktestResult } from '../types';
import { useAppStore } from '../store/useAppStore';
import { formatPercent, formatPrice } from '../utils/format';
import { BacktestPanel } from '../components/setup/BacktestPanel';
import { FuturesSetupForm } from '../components/setup/FuturesSetupForm';
import { SpotModePanel } from '../components/setup/SpotModePanel';
import { ActiveSetupJournal } from '../components/setup/ActiveSetupJournal';

export function SetupRiskPage() {
  const coins = useAppStore((s) => s.coins);
  const coinsMap = useAppStore((s) => s.coinsMap);
  const selectedSymbol = useAppStore((s) => s.selectedSymbol);
  const setSelectedSymbol = useAppStore((s) => s.setSelectedSymbol);
  const setupMode = useAppStore((s) => s.setupMode);
  const setSetupMode = useAppStore((s) => s.setSetupMode);
  const pushToast = useAppStore((s) => s.pushToast);

  const [appliedBacktest, setAppliedBacktest] = useState<BacktestResult | null>(null);

  const coin = coinsMap[selectedSymbol] ?? coins[0];
  const btcCoin = coinsMap.BTCUSDT;
  const pos = coin.priceChangePercent24h >= 0;

  const handleApplyBacktest = useCallback(
    (res: BacktestResult) => {
      setAppliedBacktest(res);
      pushToast(
        'Hasil Backtest Diterapkan',
        `${res.suggestedDirection} ${coin.baseAsset} @ ${formatPrice(res.suggestedEntry)} (Grade ${res.grade})`,
        'success',
      );
    },
    [coin.baseAsset, pushToast],
  );

  const clearApplied = useCallback(() => setAppliedBacktest(null), []);

  return (
    <div className="space-y-4">
      {/* Header + Mode Switcher + Coin Selector */}
      <div className="cp-card flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#EAECEF] sm:text-2xl">
            Setup Coin &amp; Risk Calculator
          </h1>
          <p className="mt-0.5 text-xs text-[#848E9C]">
            Dual Mode: Backtest-First Futures Leverage &amp; Spot DCA Moonbag Planner.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Coin Selector */}
          <div className="flex items-center gap-2">
            <select
              aria-label="Pilih Coin Setup"
              value={coin.symbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="min-h-[42px] rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-xs font-bold text-[#EAECEF]"
            >
              {coins.map((c) => (
                <option key={c.symbol} value={c.symbol}>
                  {c.baseAsset}/USDT
                </option>
              ))}
            </select>
            <div className="hidden text-right sm:block">
              <p className="font-mono tabular-nums text-xs font-bold text-[#EAECEF]">
                {formatPrice(coin.price)}
              </p>
              <span
                className={`font-mono tabular-nums text-[11px] font-semibold ${
                  pos ? 'text-[#00C087]' : 'text-[#F6465D]'
                }`}
              >
                {formatPercent(coin.priceChangePercent24h)}
              </span>
            </div>
          </div>

          {/* Dual Mode Switcher */}
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-1">
            <button
              id="btn-mode-futures"
              type="button"
              onClick={() => setSetupMode('FUTURES')}
              className={`min-h-[40px] rounded-lg px-3 text-xs font-semibold transition ${
                setupMode === 'FUTURES'
                  ? 'bg-[#F0B90B] text-[#0B0E11]'
                  : 'text-[#848E9C] hover:text-[#EAECEF]'
              }`}
            >
              Futures (Leverage)
            </button>
            <button
              id="btn-mode-spot"
              type="button"
              onClick={() => setSetupMode('SPOT')}
              className={`min-h-[40px] rounded-lg px-3 text-xs font-semibold transition ${
                setupMode === 'SPOT'
                  ? 'bg-[#F0B90B] text-[#0B0E11]'
                  : 'text-[#848E9C] hover:text-[#EAECEF]'
              }`}
            >
              Spot (DCA &amp; Moonbag)
            </button>
          </div>
        </div>
      </div>

      {/* Mode Content */}
      {setupMode === 'FUTURES' ? (
        <div className="space-y-4">
          <BacktestPanel coin={coin} onApplyToSetup={handleApplyBacktest} />
          <FuturesSetupForm
            coin={coin}
            btcCoin={btcCoin}
            appliedBacktest={appliedBacktest}
            onClearApplied={clearApplied}
          />
        </div>
      ) : (
        <SpotModePanel coin={coin} />
      )}

      {/* Active Setup Tracker & Mini Journal */}
      <ActiveSetupJournal />
    </div>
  );
}
