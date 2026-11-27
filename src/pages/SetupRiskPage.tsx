import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BacktestResult } from '../types';
import { useAppStore } from '../store/useAppStore';
import { formatPercent, formatPrice } from '../utils/format';
import { CoinSearchSelect } from '../components/ui/CoinSearchSelect';
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

  const futuresCoins = useMemo(() => coins.filter((c) => c.hasFutures), [coins]);
  const selectableCoins = setupMode === 'FUTURES' && futuresCoins.length > 0 ? futuresCoins : coins;

  // Never allow a Spot-only coin to stay selected when user is in FUTURES mode
  const rawCoin = coinsMap[selectedSymbol] ?? selectableCoins[0] ?? coins[0];
  const isSpotOnlyBlockedInFutures =
    setupMode === 'FUTURES' && futuresCoins.length > 0 && rawCoin && !rawCoin.hasFutures;
  const coin = isSpotOnlyBlockedInFutures ? futuresCoins[0] : rawCoin;

  useEffect(() => {
    if (isSpotOnlyBlockedInFutures && futuresCoins[0]) {
      setSelectedSymbol(futuresCoins[0].symbol);
      pushToast(
        `${rawCoin.baseAsset} Hanya Tersedia di Spot`,
        `Daftar Futures hanya memuat ${futuresCoins.length} pair USDT-M Perpetual Binance. Dialihkan ke ${futuresCoins[0].baseAsset}/USDT.`,
        'info',
      );
    }
  }, [isSpotOnlyBlockedInFutures, futuresCoins, rawCoin?.baseAsset, setSelectedSymbol, pushToast]);

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
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[#EAECEF] sm:text-2xl">
              Setup Coin &amp; Risk Calculator
            </h1>
            <span
              className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                setupMode === 'FUTURES'
                  ? 'bg-[#F0B90B]/15 text-[#F0B90B]'
                  : 'bg-[#00C087]/15 text-[#00C087]'
              }`}
            >
              {setupMode === 'FUTURES'
                ? `KHUSUS FUTURES (${futuresCoins.length} PERP)`
                : `PASAR SPOT (${coins.length} PAIR)`}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[#848E9C]">
            {setupMode === 'FUTURES'
              ? 'Daftar coin tersaring khusus pair USDT-M Perpetual aktif di Binance Futures (coin Spot-only otomatis dipisahkan).'
              : 'Daftar coin lengkap seluruh pair Spot USDT aktif di Binance untuk perencanaan akumulasi DCA & Moonbag.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Coin Selector */}
          <div className="flex items-center gap-2">
            <CoinSearchSelect
              id="setup-coin-select"
              coins={selectableCoins}
              value={coin.symbol}
              onChange={setSelectedSymbol}
              placeholder={
                setupMode === 'FUTURES'
                  ? `Cari dari ${futuresCoins.length} coin Futures Binance...`
                  : `Cari dari ${coins.length} coin Spot Binance...`
              }
              showMarketBadge={setupMode === 'SPOT'}
              className="min-w-[175px]"
            />
            <div className="hidden text-right sm:block">
              <p className="font-mono tabular-nums text-xs font-bold text-[#EAECEF]">
                {formatPrice(coin.price)}
              </p>
              <div className="flex items-center justify-end gap-1">
                <span
                  className={`font-mono tabular-nums text-[11px] font-semibold ${
                    pos ? 'text-[#00C087]' : 'text-[#F6465D]'
                  }`}
                >
                  {formatPercent(coin.priceChangePercent24h)}
                </span>
                {setupMode === 'FUTURES' && coin.futuresSymbol && coin.futuresSymbol !== coin.symbol && (
                  <span
                    title={`Kontrak perpetual Binance menggunakan multiplier 1000x (${coin.futuresSymbol})`}
                    className="rounded bg-[#F0B90B]/15 px-1 py-0.5 font-mono text-[9px] font-bold text-[#F0B90B]"
                  >
                    {coin.futuresSymbol}
                  </span>
                )}
              </div>
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
              Futures ({futuresCoins.length})
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
              Spot ({coins.length})
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
