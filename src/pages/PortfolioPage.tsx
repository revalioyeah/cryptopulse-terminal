import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  History,
  PieChart,
  Plus,
  RotateCcw,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { SpotHolding } from '../types';
import { useAppStore } from '../store/useAppStore';
import { usePortfolioStore } from '../store/usePortfolioStore';
import {
  formatDateTime,
  formatPercent,
  formatPrice,
  formatQty,
  formatRawPrice,
  formatUsd,
} from '../utils/format';
import { AllocationDonutChart } from '../components/portfolio/AllocationDonutChart';
import { PortfolioPerfChart } from '../components/portfolio/PortfolioPerfChart';
import { PartialSellModal } from '../components/portfolio/PartialSellModal';
import { CoinSearchSelect } from '../components/ui/CoinSearchSelect';
import { Modal } from '../components/ui/Modal';

const ALLOC_COLORS = ['#F0B90B', '#00C087', '#38BDF8', '#FB923C', '#EC4899', '#94A3B8'];

export function PortfolioPage() {
  const coins = useAppStore((s) => s.coins);
  const coinsMap = useAppStore((s) => s.coinsMap);
  const pushToast = useAppStore((s) => s.pushToast);

  const usdtBalance = usePortfolioStore((s) => s.usdtBalance);
  const autoDeductUsdtOnBuy = usePortfolioStore((s) => s.autoDeductUsdtOnBuy);
  const autoCreditUsdtOnSell = usePortfolioStore((s) => s.autoCreditUsdtOnSell);
  const holdings = usePortfolioStore((s) => s.holdings);
  const activityLogs = usePortfolioStore((s) => s.activityLogs);
  const snapshots = usePortfolioStore((s) => s.snapshots);

  const setUsdtBalance = usePortfolioStore((s) => s.setUsdtBalance);
  const depositUsdt = usePortfolioStore((s) => s.depositUsdt);
  const withdrawUsdt = usePortfolioStore((s) => s.withdrawUsdt);
  const setAutoDeductUsdtOnBuy = usePortfolioStore((s) => s.setAutoDeductUsdtOnBuy);
  const setAutoCreditUsdtOnSell = usePortfolioStore((s) => s.setAutoCreditUsdtOnSell);
  const buyOrDcaSpot = usePortfolioStore((s) => s.buyOrDcaSpot);
  const partialSellSpot = usePortfolioStore((s) => s.partialSellSpot);
  const recordSnapshot = usePortfolioStore((s) => s.recordSnapshot);
  const resetPortfolio = usePortfolioStore((s) => s.resetPortfolio);

  // USDT Cash Form State
  const [cashAmount, setCashAmount] = useState<string>('500');

  // Spot Buy / DCA Form State
  const [buySymbol, setBuySymbol] = useState<string>('BTCUSDT');
  const [buyInputMode, setBuyInputMode] = useState<'USDT' | 'COIN'>('USDT');
  const [buyUsdtInput, setBuyUsdtInput] = useState<string>('250');
  const [buyQtyInput, setBuyQtyInput] = useState<string>('0.005');
  const [buyPriceInput, setBuyPriceInput] = useState<string>(() =>
    formatRawPrice(coinsMap.BTCUSDT?.price ?? 60000),
  );
  const [targetSellInput, setTargetSellInput] = useState<string>(() =>
    formatRawPrice((coinsMap.BTCUSDT?.price ?? 60000) * 1.4),
  );
  const [buyPriceEdited, setBuyPriceEdited] = useState(false);
  const [buyNote, setBuyNote] = useState('');

  // Sell Modal, Reset Modal & History Filter
  const [sellTarget, setSellTarget] = useState<SpotHolding | null>(null);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetStartUsdt, setResetStartUsdt] = useState<string>('0');
  const [resetClearFutures, setResetClearFutures] = useState<boolean>(true);
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'SPOT' | 'FUTURES'>('ALL');

  const selectedBuyCoin = coinsMap[buySymbol] ?? coins[0];

  useEffect(() => {
    if (!buyPriceEdited && selectedBuyCoin && selectedBuyCoin.price > 0) {
      setBuyPriceInput(formatRawPrice(selectedBuyCoin.price));
      const existing = holdings.find((h) => h.symbol === buySymbol);
      setTargetSellInput(formatRawPrice(existing?.targetSellPrice ?? selectedBuyCoin.price * 1.4));
    }
  }, [selectedBuyCoin?.price, buySymbol, buyPriceEdited]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live portfolio valuation metrics
  const metrics = useMemo(() => {
    let coinValueUsdt = 0;
    let totalCostBasis = 0;
    let totalRealizedSpot = 0;

    const enriched = holdings.map((h) => {
      const livePrice = coinsMap[h.symbol]?.price ?? h.avgBuyPrice;
      const currentValue = h.quantity * livePrice;
      const unrealizedPnl = currentValue - h.totalCostUsdt;
      const roiPct = h.totalCostUsdt > 0 ? (unrealizedPnl / h.totalCostUsdt) * 100 : 0;
      const targetProgress =
        h.targetSellPrice > h.avgBuyPrice
          ? Math.min(100, Math.max(0, ((livePrice - h.avgBuyPrice) / (h.targetSellPrice - h.avgBuyPrice)) * 100))
          : 0;

      coinValueUsdt += currentValue;
      totalCostBasis += h.totalCostUsdt;
      totalRealizedSpot += h.realizedPnlUsdt;

      return { ...h, livePrice, currentValue, unrealizedPnl, roiPct, targetProgress };
    });

    // Include realized TP from fully closed Spot sales logged in activityLogs
    const closedSpotRealized = activityLogs
      .filter((l) => l.action === 'SPOT_SELL_TP' && l.pnlUsdt !== undefined)
      .reduce((acc, l) => acc + (l.pnlUsdt ?? 0), 0);
    const realizedTp = Math.max(totalRealizedSpot, closedSpotRealized);

    const totalPortfolioUsdt = coinValueUsdt + usdtBalance;
    const usdtSharePct = totalPortfolioUsdt > 0 ? (usdtBalance / totalPortfolioUsdt) * 100 : 0;
    const unrealizedPnl = coinValueUsdt - totalCostBasis;
    const unrealizedPnlPct = totalCostBasis > 0 ? (unrealizedPnl / totalCostBasis) * 100 : 0;
    const bestPerformer = [...enriched].sort((a, b) => b.roiPct - a.roiPct)[0] ?? null;

    const allocationItems = [
      ...enriched.map((item, idx) => ({
        label: item.baseAsset,
        valueUsd: item.currentValue,
        percent: totalPortfolioUsdt > 0 ? (item.currentValue / totalPortfolioUsdt) * 100 : 0,
        color: ALLOC_COLORS[idx % ALLOC_COLORS.length],
      })),
      {
        label: 'Kas USDT',
        valueUsd: usdtBalance,
        percent: usdtSharePct,
        color: '#64748B',
      },
    ].sort((a, b) => b.valueUsd - a.valueUsd);

    return {
      enriched,
      coinValueUsdt,
      totalPortfolioUsdt,
      usdtSharePct,
      unrealizedPnl,
      unrealizedPnlPct,
      bestPerformer,
      realizedTp,
      allocationItems,
    };
  }, [holdings, coinsMap, usdtBalance, activityLogs]);

  // Keep latest portfolio snapshot updated
  useEffect(() => {
    if (metrics.coinValueUsdt > 0 || usdtBalance > 0) {
      recordSnapshot(metrics.coinValueUsdt);
    }
  }, [Math.round(metrics.coinValueUsdt / 50), usdtBalance, recordSnapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  // DCA Live Preview
  const dcaPreview = useMemo(() => {
    const price = Math.max(0, Number.parseFloat(buyPriceInput) || 0);
    const qty =
      buyInputMode === 'USDT'
        ? price > 0
          ? (Number.parseFloat(buyUsdtInput) || 0) / price
          : 0
        : Number.parseFloat(buyQtyInput) || 0;
    const cost = qty * price;
    const existing = holdings.find((h) => h.symbol === buySymbol);

    const newTotalQty = (existing?.quantity ?? 0) + qty;
    const newTotalCost = (existing?.totalCostUsdt ?? 0) + cost;
    const newAvgPrice = newTotalQty > 0 ? newTotalCost / newTotalQty : price;

    return { price, qty, cost, existing, newTotalQty, newAvgPrice };
  }, [buyInputMode, buyUsdtInput, buyQtyInput, buyPriceInput, holdings, buySymbol]);

  const handleSelectBuyCoin = (symbol: string) => {
    setBuySymbol(symbol);
    setBuyPriceEdited(false);
    const c = coinsMap[symbol];
    if (c) {
      setBuyPriceInput(formatRawPrice(c.price));
      const existing = holdings.find((h) => h.symbol === symbol);
      setTargetSellInput(formatRawPrice(existing?.targetSellPrice ?? c.price * 1.4));
    }
  };

  const handleCashAction = (type: 'SET' | 'DEPOSIT' | 'WITHDRAW') => {
    const val = Number.parseFloat(cashAmount);
    if (!Number.isFinite(val) || val < 0 || (type !== 'SET' && val <= 0)) {
      pushToast('Nominal Tidak Valid', 'Masukkan nominal USDT yang valid.', 'error');
      return;
    }
    if (type === 'SET') {
      setUsdtBalance(val);
      pushToast('Saldo USDT Diatur', `Saldo kas USDT menjadi ${formatUsd(val)}.`, 'success');
    } else if (type === 'DEPOSIT') {
      depositUsdt(val);
      pushToast('Deposit USDT Berhasil', `+${formatUsd(val)} ditambahkan ke kas exchange.`, 'success');
    } else {
      const ok = withdrawUsdt(val);
      if (ok) {
        pushToast('Penarikan USDT Berhasil', `-${formatUsd(val)} ditarik dari kas exchange.`, 'info');
      } else {
        pushToast('Saldo Tidak Mencukupi', `Saldo tersedia hanya ${formatUsd(usdtBalance)}.`, 'error');
      }
    }
  };

  const handleBuySubmit = () => {
    const targetSell = Number.parseFloat(targetSellInput) || dcaPreview.price * 1.35;
    const res = buyOrDcaSpot({
      symbol: selectedBuyCoin.symbol,
      baseAsset: selectedBuyCoin.baseAsset,
      name: selectedBuyCoin.name,
      quantity: dcaPreview.qty,
      buyPrice: dcaPreview.price,
      targetSellPrice: targetSell,
      note: buyNote,
    });

    if (!res.ok) {
      pushToast('Pembelian Gagal', res.error, 'error');
      return;
    }

    pushToast(
      `${dcaPreview.existing ? 'DCA' : 'Beli'} ${selectedBuyCoin.baseAsset} Tercatat`,
      `${formatQty(dcaPreview.qty)} ${selectedBuyCoin.baseAsset} @ ${formatPrice(dcaPreview.price)} · Avg baru ${formatPrice(dcaPreview.newAvgPrice)}`,
      'success',
    );
    setBuyNote('');
  };

  const handleConfirmSell = (sellPercent: number, sellPrice: number, note: string) => {
    if (!sellTarget) return;
    const res = partialSellSpot({
      holdingId: sellTarget.id,
      sellPercent,
      sellPrice,
      note,
    });
    if (!res.ok) {
      pushToast('Gagal Jual / TP', res.error, 'error');
      return;
    }
    pushToast(
      `TP ${sellPercent}% ${sellTarget.baseAsset} Berhasil`,
      `Realized PnL: ${formatUsd(res.realizedPnl ?? 0, true)}`,
      (res.realizedPnl ?? 0) >= 0 ? 'success' : 'warning',
    );
    setSellTarget(null);
  };

  const filteredLogs = useMemo(() => {
    return activityLogs.filter((log) => {
      if (historyFilter === 'ALL') return true;
      if (historyFilter === 'SPOT') return log.category === 'SPOT' || log.category === 'USDT_CASH';
      return log.category === 'FUTURES';
    });
  }, [activityLogs, historyFilter]);

  const handleConfirmReset = () => {
    const startVal = Math.max(0, Number.parseFloat(resetStartUsdt) || 0);
    resetPortfolio({
      initialUsdtBalance: startVal,
      clearFuturesHistory: resetClearFutures,
    });
    setResetModalOpen(false);
    pushToast(
      'Portofolio Berhasil Direset',
      `Mulai bersih dengan saldo Kas USDT ${formatUsd(startVal)}. Grafik & Realized TP diatur ulang.`,
      'success',
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#EAECEF] sm:text-2xl">
            Portofolio Akumulasi Spot &amp; Rekap Historis
          </h1>
          <p className="mt-0.5 text-xs text-[#848E9C]">
            Kelola aset spot, kas USDT exchange, kalkulasi DCA live, TP parsial, dan riwayat terpadu Spot + Futures.
          </p>
        </div>

        <button
          id="btn-reset-portfolio"
          type="button"
          onClick={() => {
            setResetStartUsdt('0');
            setResetModalOpen(true);
          }}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#F6465D]/40 bg-[#F6465D]/10 px-3.5 text-xs font-semibold text-[#F6465D] transition hover:bg-[#F6465D] hover:text-white"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset Portofolio</span>
        </button>
      </div>

      {/* KPI Strip */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="cp-card p-4">
          <span className="text-xs text-[#848E9C]">Total Nilai Portofolio</span>
          <p className="font-mono tabular-nums mt-1.5 text-xl font-bold text-[#EAECEF]">
            {formatUsd(metrics.totalPortfolioUsdt)}
          </p>
          <span className="font-mono tabular-nums text-[11px] text-[#5E6673]">
            Coin {formatUsd(metrics.coinValueUsdt)} + Kas
          </span>
        </div>

        <div className="cp-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#848E9C]">Saldo Kas USDT</span>
            <span className="font-mono tabular-nums rounded bg-[#1E2329] px-1.5 py-0.5 text-[10px] font-bold text-[#F0B90B]">
              {metrics.usdtSharePct.toFixed(1)}%
            </span>
          </div>
          <p className="font-mono tabular-nums mt-1.5 text-xl font-bold text-[#F0B90B]">
            {formatUsd(usdtBalance)}
          </p>
          <span className="text-[11px] text-[#5E6673]">Dry Powder Exchange</span>
        </div>

        <div className="cp-card p-4">
          <span className="text-xs text-[#848E9C]">Unrealized PnL</span>
          <p
            className={`font-mono tabular-nums mt-1.5 text-xl font-bold ${
              metrics.unrealizedPnl >= 0 ? 'text-[#00C087]' : 'text-[#F6465D]'
            }`}
          >
            {formatUsd(metrics.unrealizedPnl, true)}
          </p>
          <span
            className={`font-mono tabular-nums text-[11px] font-semibold ${
              metrics.unrealizedPnlPct >= 0 ? 'text-[#00C087]' : 'text-[#F6465D]'
            }`}
          >
            {formatPercent(metrics.unrealizedPnlPct)}
          </span>
        </div>

        <div className="cp-card p-4">
          <span className="text-xs text-[#848E9C]">Best Performer</span>
          {metrics.bestPerformer ? (
            <>
              <p className="mt-1.5 text-xl font-bold text-[#EAECEF]">
                {metrics.bestPerformer.baseAsset}
              </p>
              <span
                className={`font-mono tabular-nums text-[11px] font-semibold ${
                  metrics.bestPerformer.roiPct >= 0 ? 'text-[#00C087]' : 'text-[#F6465D]'
                }`}
              >
                {formatPercent(metrics.bestPerformer.roiPct)}
              </span>
            </>
          ) : (
            <p className="mt-1.5 text-sm text-[#5E6673]">—</p>
          )}
        </div>

        <div className="cp-card p-4">
          <span className="text-xs text-[#848E9C]">Realized TP (Spot)</span>
          <p
            className={`font-mono tabular-nums mt-1.5 text-xl font-bold ${
              metrics.realizedTp >= 0 ? 'text-[#00C087]' : 'text-[#F6465D]'
            }`}
          >
            {formatUsd(metrics.realizedTp, true)}
          </p>
          <span className="text-[11px] text-[#5E6673]">Profit Terealisasi</span>
        </div>
      </section>

      {/* Performance Chart + Allocation Donut & Bar */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="cp-card p-4 xl:col-span-7">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#00C087]" />
              <h2 className="text-sm font-semibold text-[#EAECEF]">
                Grafik Kinerja Historis Portofolio (Coin + Kas USDT)
              </h2>
            </div>
            <span className="font-mono tabular-nums text-xs font-bold text-[#EAECEF]">
              {formatUsd(metrics.totalPortfolioUsdt)}
            </span>
          </div>
          <PortfolioPerfChart snapshots={snapshots} />
        </div>

        <div className="cp-card flex flex-col justify-between p-4 xl:col-span-5">
          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <PieChart className="h-4 w-4 text-[#F0B90B]" />
                <h2 className="text-sm font-semibold text-[#EAECEF]">
                  Persentase Aset dari Total Porto
                </h2>
              </div>
              <span className="text-[11px] text-[#848E9C]">Grafik Donat &amp; Bobot</span>
            </div>

            <AllocationDonutChart
              items={metrics.allocationItems}
              totalUsd={metrics.totalPortfolioUsdt}
            />
          </div>
        </div>
      </div>

      {/* Manajemen Kas USDT + Form Pembelian / DCA */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* USDT Cash Management */}
        <section className="cp-card space-y-3 p-4 xl:col-span-5">
          <div className="flex items-center gap-2 border-b border-[#2B3139] pb-2.5">
            <Wallet className="h-4 w-4 text-[#F0B90B]" />
            <h2 className="text-sm font-semibold text-[#EAECEF]">Manajemen Kas USDT Exchange</h2>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[#848E9C]">Nominal USDT</label>
            <input
              type="number"
              min={0}
              step={50}
              value={cashAmount}
              onChange={(e) => setCashAmount(e.target.value)}
              className="font-mono tabular-nums min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-sm font-bold text-[#F0B90B]"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleCashAction('DEPOSIT')}
              className="inline-flex min-h-[42px] items-center justify-center gap-1 rounded-xl bg-[#00C087]/15 px-2 text-xs font-semibold text-[#00C087] transition hover:bg-[#00C087] hover:text-[#0B0E11]"
            >
              <ArrowDownCircle className="h-3.5 w-3.5" />
              + Deposit
            </button>
            <button
              type="button"
              onClick={() => handleCashAction('WITHDRAW')}
              className="inline-flex min-h-[42px] items-center justify-center gap-1 rounded-xl bg-[#F6465D]/15 px-2 text-xs font-semibold text-[#F6465D] transition hover:bg-[#F6465D] hover:text-white"
            >
              <ArrowUpCircle className="h-3.5 w-3.5" />
              - Tarik
            </button>
            <button
              type="button"
              onClick={() => handleCashAction('SET')}
              className="min-h-[42px] rounded-xl border border-[#2B3139] bg-[#1E2329] px-2 text-xs font-semibold text-[#EAECEF] hover:border-[#F0B90B]/60"
            >
              Set Saldo
            </button>
          </div>

          <div className="space-y-2 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
            <label className="flex min-h-[32px] cursor-pointer items-center justify-between gap-2 text-xs text-[#EAECEF]">
              <span>Potong saldo USDT otomatis saat Beli/DCA</span>
              <input
                type="checkbox"
                checked={autoDeductUsdtOnBuy}
                onChange={(e) => setAutoDeductUsdtOnBuy(e.target.checked)}
                className="h-4 w-4 accent-[#F0B90B]"
              />
            </label>
            <label className="flex min-h-[32px] cursor-pointer items-center justify-between gap-2 text-xs text-[#EAECEF]">
              <span>Masukkan hasil ke saldo USDT saat Jual/TP</span>
              <input
                type="checkbox"
                checked={autoCreditUsdtOnSell}
                onChange={(e) => setAutoCreditUsdtOnSell(e.target.checked)}
                className="h-4 w-4 accent-[#00C087]"
              />
            </label>
          </div>
        </section>

        {/* Form Pembelian / DCA */}
        <section id="spot-dca-form" className="cp-card space-y-3 p-4 xl:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2B3139] pb-2.5">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-[#F0B90B]" />
              <h2 className="text-sm font-semibold text-[#EAECEF]">Form Pembelian / DCA Spot</h2>
            </div>

            <div className="grid grid-cols-2 gap-1 rounded-lg border border-[#2B3139] bg-[#0B0E11] p-0.5">
              {(['USDT', 'COIN'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setBuyInputMode(m)}
                  className={`min-h-[34px] rounded-md px-2.5 text-[11px] font-semibold ${
                    buyInputMode === m ? 'bg-[#F0B90B] text-[#0B0E11]' : 'text-[#848E9C]'
                  }`}
                >
                  {m === 'USDT' ? 'Nominal USDT' : 'Jumlah Coin'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-[11px] text-[#848E9C]">Aset Coin</label>
              <CoinSearchSelect
                coins={coins}
                value={buySymbol}
                onChange={handleSelectBuyCoin}
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-[#848E9C]">
                {buyInputMode === 'USDT' ? 'Nominal Beli (USDT)' : `Jumlah (${selectedBuyCoin.baseAsset})`}
              </label>
              {buyInputMode === 'USDT' ? (
                <input
                  type="number"
                  step="any"
                  value={buyUsdtInput}
                  onChange={(e) => setBuyUsdtInput(e.target.value)}
                  className="font-mono tabular-nums min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-xs font-bold text-[#F0B90B]"
                />
              ) : (
                <input
                  type="number"
                  step="any"
                  value={buyQtyInput}
                  onChange={(e) => setBuyQtyInput(e.target.value)}
                  className="font-mono tabular-nums min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-xs font-bold text-[#F0B90B]"
                />
              )}
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-[#848E9C]">Harga Beli</label>
              <input
                type="number"
                step="any"
                value={buyPriceInput}
                onChange={(e) => {
                  setBuyPriceEdited(true);
                  setBuyPriceInput(e.target.value);
                }}
                className="font-mono tabular-nums min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-xs font-semibold text-[#EAECEF]"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-[#00C087]">Target Jual / TP</label>
              <input
                type="number"
                step="any"
                value={targetSellInput}
                onChange={(e) => setTargetSellInput(e.target.value)}
                className="font-mono tabular-nums min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-xs font-semibold text-[#00C087]"
              />
            </div>
          </div>

          {/* Live Avg Buy Price Preview */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3.5 py-2.5 text-xs">
            <div className="font-mono tabular-nums flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-[#848E9C]">
                Est. Beli:{' '}
                <strong className="text-[#EAECEF]">
                  {formatQty(dcaPreview.qty)} {selectedBuyCoin.baseAsset} ({formatUsd(dcaPreview.cost)})
                </strong>
              </span>
              <span className="text-[#848E9C]">
                Pratinjau Avg Buy Baru:{' '}
                <strong className="text-[#00C087]">{formatPrice(dcaPreview.newAvgPrice)}</strong>
              </span>
            </div>

            <button
              type="button"
              onClick={handleBuySubmit}
              className="min-h-[40px] rounded-xl bg-[#F0B90B] px-4 text-xs font-bold text-[#0B0E11] hover:bg-[#F0B90B]/90"
            >
              {dcaPreview.existing ? 'Simpan +DCA' : 'Simpan Pembelian'}
            </button>
          </div>
        </section>
      </div>

      {/* Daftar Aset Spot */}
      <section aria-label="Daftar Aset Spot" className="cp-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#EAECEF]">Daftar Aset Akumulasi Spot</h2>
          <span className="font-mono tabular-nums text-xs text-[#848E9C]">
            {metrics.enriched.length} aset aktif
          </span>
        </div>

        {metrics.enriched.length === 0 ? (
          <p className="py-8 text-center text-xs text-[#5E6673]">
            Belum ada aset spot. Gunakan Form Pembelian / DCA di atas untuk mulai mencatat.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {metrics.enriched.map((item) => {
              const pos = item.unrealizedPnl >= 0;
              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-[#EAECEF]">{item.baseAsset}</span>
                        <span className="text-xs text-[#848E9C]">{item.name}</span>
                      </div>
                      <p className="font-mono tabular-nums mt-0.5 text-xs text-[#848E9C]">
                        {formatQty(item.quantity)} {item.baseAsset} · Avg {formatPrice(item.avgBuyPrice)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-mono tabular-nums text-base font-bold text-[#EAECEF]">
                        {formatUsd(item.currentValue)}
                      </p>
                      <p
                        className={`font-mono tabular-nums text-xs font-semibold ${
                          pos ? 'text-[#00C087]' : 'text-[#F6465D]'
                        }`}
                      >
                        {formatUsd(item.unrealizedPnl, true)} ({formatPercent(item.roiPct)})
                      </p>
                    </div>
                  </div>

                  {/* Progress Bar menuju Target Jual */}
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-[11px]">
                      <span className="font-mono tabular-nums text-[#848E9C]">
                        Live: {formatPrice(item.livePrice)}
                      </span>
                      <span className="font-mono tabular-nums text-[#00C087]">
                        Target TP: {formatPrice(item.targetSellPrice)} ({item.targetProgress.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1E2329]">
                      <div
                        className="h-full rounded-full bg-[#00C087]"
                        style={{ width: `${item.targetProgress}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        handleSelectBuyCoin(item.symbol);
                        document.getElementById('spot-dca-form')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="min-h-[40px] rounded-lg border border-[#2B3139] bg-[#161A1E] text-xs font-semibold text-[#F0B90B] hover:border-[#F0B90B]/60"
                    >
                      +DCA {item.baseAsset}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSellTarget(item)}
                      className="min-h-[40px] rounded-lg bg-[#00C087]/15 text-xs font-semibold text-[#00C087] hover:bg-[#00C087] hover:text-[#0B0E11]"
                    >
                      Jual / TP Parsial
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Rekap Historis Terpadu Futures & Spot */}
      <section aria-label="Rekap Historis Futures dan Spot" className="cp-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-[#F0B90B]" />
            <h2 className="text-sm font-semibold text-[#EAECEF]">
              Rekap Historis Futures &amp; Spot
            </h2>
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-1">
            {(
              [
                { id: 'ALL', label: 'Semua' },
                { id: 'SPOT', label: 'Spot' },
                { id: 'FUTURES', label: 'Futures' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setHistoryFilter(tab.id)}
                className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold transition ${
                  historyFilter === tab.id ? 'bg-[#F0B90B] text-[#0B0E11]' : 'text-[#848E9C]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {filteredLogs.length === 0 ? (
            <p className="py-6 text-center text-xs text-[#5E6673]">
              Belum ada aktivitas pada kategori ini.
            </p>
          ) : (
            filteredLogs.slice(0, 40).map((log) => {
              const badgeColor =
                log.category === 'FUTURES'
                  ? log.action === 'FUTURES_HIT_TP'
                    ? 'bg-[#00C087]/15 text-[#00C087]'
                    : 'bg-[#F6465D]/15 text-[#F6465D]'
                  : log.category === 'USDT_CASH'
                    ? 'bg-[#F0B90B]/15 text-[#F0B90B]'
                    : 'bg-[#38BDF8]/15 text-[#38BDF8]';

              return (
                <div
                  key={log.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3.5 py-2.5 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${badgeColor}`}>
                        {log.action.replaceAll('_', ' ')}
                      </span>
                      {log.baseAsset && (
                        <span className="font-bold text-[#EAECEF]">{log.baseAsset}</span>
                      )}
                      <span className="font-mono tabular-nums text-[10px] text-[#5E6673]">
                        {formatDateTime(log.timestamp)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-[#848E9C]">{log.note}</p>
                  </div>

                  <div className="font-mono tabular-nums text-right">
                    <p className="font-semibold text-[#EAECEF]">{formatUsd(log.amountUsdt)}</p>
                    {log.pnlUsdt !== undefined && (
                      <p
                        className={`text-[11px] font-bold ${
                          log.pnlUsdt >= 0 ? 'text-[#00C087]' : 'text-[#F6465D]'
                        }`}
                      >
                        PnL {formatUsd(log.pnlUsdt, true)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <PartialSellModal
        holding={sellTarget}
        livePrice={sellTarget ? (coinsMap[sellTarget.symbol]?.price ?? sellTarget.avgBuyPrice) : 0}
        onClose={() => setSellTarget(null)}
        onConfirmSell={handleConfirmSell}
      />

      <Modal
        open={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        title="Reset Portofolio Spot"
        subtitle="Hapus aset demo/lama, nolkan Realized TP, dan mulai grafik historis dari awal"
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-xl border border-[#F6465D]/40 bg-[#F6465D]/10 p-3 text-xs text-[#EAECEF]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#F6465D]" />
            <p className="leading-relaxed">
              Seluruh daftar aset Spot, riwayat transaksi Spot/Kas USDT, <strong>Realized TP</strong>, dan kurva historis lama akan dihapus bersih.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[#848E9C]">
              Saldo Awal Kas USDT Setelah Reset (Opsional)
            </label>
            <input
              type="number"
              min={0}
              step={100}
              value={resetStartUsdt}
              onChange={(e) => setResetStartUsdt(e.target.value)}
              className="font-mono tabular-nums min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-sm font-bold text-[#F0B90B]"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[0, 500, 1000, 5000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setResetStartUsdt(String(amt))}
                  className="font-mono tabular-nums min-h-[36px] rounded-lg border border-[#2B3139] bg-[#0B0E11] px-2.5 text-xs font-medium text-[#848E9C] hover:border-[#F0B90B]/60 hover:text-[#EAECEF]"
                >
                  ${amt.toLocaleString('en-US')}
                </button>
              ))}
            </div>
          </div>

          <label className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 py-2 text-xs text-[#EAECEF]">
            <input
              type="checkbox"
              checked={resetClearFutures}
              onChange={(e) => setResetClearFutures(e.target.checked)}
              className="h-4 w-4 accent-[#F6465D]"
            />
            <span>Hapus juga riwayat Hit TP / Hit SL Futures di Rekap Historis</span>
          </label>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setResetModalOpen(false)}
              className="min-h-[42px] rounded-xl border border-[#2B3139] bg-[#1E2329] px-4 text-xs font-medium text-[#EAECEF]"
            >
              Batal
            </button>
            <button
              id="btn-confirm-reset-portfolio"
              type="button"
              onClick={handleConfirmReset}
              className="min-h-[42px] rounded-xl bg-[#F6465D] px-4 text-xs font-bold text-white hover:bg-[#F6465D]/90"
            >
              Reset Sekarang
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
