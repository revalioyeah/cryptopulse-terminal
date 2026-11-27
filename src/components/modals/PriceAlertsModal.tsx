import { useEffect, useState } from 'react';
import { Bell, BellRing, Plus, RotateCcw, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import type { AlertCondition } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { formatDateTime, formatPrice, formatRawPrice } from '../../utils/format';
import { CoinSearchSelect } from '../ui/CoinSearchSelect';
import { Modal } from '../ui/Modal';

export function PriceAlertsModal() {
  const open = useAppStore((s) => s.priceAlertsModalOpen);
  const draftSymbol = useAppStore((s) => s.priceAlertDraftSymbol);
  const closeModal = useAppStore((s) => s.closePriceAlertsModal);
  const coins = useAppStore((s) => s.coins);
  const coinsMap = useAppStore((s) => s.coinsMap);
  const pushToast = useAppStore((s) => s.pushToast);

  const priceAlerts = useSettingsStore((s) => s.priceAlerts);
  const addPriceAlert = useSettingsStore((s) => s.addPriceAlert);
  const togglePriceAlert = useSettingsStore((s) => s.togglePriceAlert);
  const resetPriceAlert = useSettingsStore((s) => s.resetPriceAlert);
  const deletePriceAlert = useSettingsStore((s) => s.deletePriceAlert);

  const [symbol, setSymbol] = useState<string>('BTCUSDT');
  const [condition, setCondition] = useState<AlertCondition>('ABOVE');
  const [targetInput, setTargetInput] = useState<string>('');
  const [note, setNote] = useState<string>('');

  const selectedCoin = coinsMap[symbol] ?? coins[0];

  useEffect(() => {
    if (!open) return;
    const targetSym = draftSymbol && coinsMap[draftSymbol] ? draftSymbol : 'BTCUSDT';
    setSymbol(targetSym);
    const live = coinsMap[targetSym]?.price ?? 0;
    setCondition('ABOVE');
    setTargetInput(live > 0 ? formatRawPrice(live * 1.03) : '');
    setNote('');
  }, [open, draftSymbol]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSymbolChange = (nextSym: string) => {
    setSymbol(nextSym);
    const live = coinsMap[nextSym]?.price ?? 0;
    if (live > 0) {
      setTargetInput(formatRawPrice(condition === 'ABOVE' ? live * 1.03 : live * 0.97));
    }
  };

  const applyQuickOffset = (pct: number) => {
    const live = selectedCoin?.price ?? 0;
    if (live <= 0) return;
    setCondition(pct >= 0 ? 'ABOVE' : 'BELOW');
    setTargetInput(formatRawPrice(live * (1 + pct / 100)));
  };

  const handleCreate = () => {
    const price = Number.parseFloat(targetInput);
    if (!Number.isFinite(price) || price <= 0) {
      pushToast('Target Harga Tidak Valid', 'Masukkan angka harga target lebih dari 0.', 'error');
      return;
    }

    addPriceAlert({
      symbol: selectedCoin.symbol,
      baseAsset: selectedCoin.baseAsset,
      condition,
      targetPrice: price,
      note,
    });

    pushToast(
      `Alert ${selectedCoin.baseAsset} Dipasang`,
      `${condition === 'ABOVE' ? 'Naik ≥' : 'Turun ≤'} ${formatPrice(price)}`,
      'success',
    );
    setNote('');
  };

  return (
    <Modal
      open={open}
      onClose={closeModal}
      title="Price Alerts Real-Time"
      subtitle="Pantau harga live Binance di semua tab & teruskan otomatis ke Telegram"
      maxWidthClass="max-w-xl"
    >
      <div className="space-y-4">
        {/* Create New Alert Form */}
        <div className="space-y-3 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3.5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] text-[#848E9C]">Aset Coin</label>
              <CoinSearchSelect
                coins={coins}
                value={symbol}
                onChange={handleSymbolChange}
              />
            </div>

            <div>
              <span className="mb-1 block text-[11px] text-[#848E9C]">Kondisi Pemicu</span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setCondition('ABOVE')}
                  className={`inline-flex min-h-[42px] items-center justify-center gap-1 rounded-xl text-xs font-bold transition ${
                    condition === 'ABOVE'
                      ? 'bg-[#00C087] text-[#0B0E11]'
                      : 'border border-[#2B3139] bg-[#161A1E] text-[#848E9C]'
                  }`}
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  Naik ≥
                </button>
                <button
                  type="button"
                  onClick={() => setCondition('BELOW')}
                  className={`inline-flex min-h-[42px] items-center justify-center gap-1 rounded-xl text-xs font-bold transition ${
                    condition === 'BELOW'
                      ? 'bg-[#F6465D] text-white'
                      : 'border border-[#2B3139] bg-[#161A1E] text-[#848E9C]'
                  }`}
                >
                  <TrendingDown className="h-3.5 w-3.5" />
                  Turun ≤
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="text-[#848E9C]">Target Harga (USDT)</span>
                <span className="font-mono tabular-nums text-[#F0B90B]">
                  Live: {formatPrice(selectedCoin?.price ?? 0)}
                </span>
              </div>
              <input
                type="number"
                step="any"
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                className="font-mono tabular-nums min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#161A1E] px-3 text-sm font-bold text-[#EAECEF]"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-[#848E9C]">Catatan Alert</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Misal: Breakout 4H / Area DCA"
                className="min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#161A1E] px-3 text-xs text-[#EAECEF]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {[-5, -2, 2, 5].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => applyQuickOffset(pct)}
                  className="font-mono tabular-nums min-h-[36px] rounded-lg border border-[#2B3139] bg-[#161A1E] px-2.5 text-[11px] font-medium text-[#848E9C] hover:border-[#F0B90B]/60 hover:text-[#EAECEF]"
                >
                  {pct > 0 ? `+${pct}%` : `${pct}%`}
                </button>
              ))}
            </div>

            <button
              id="btn-add-price-alert"
              type="button"
              onClick={handleCreate}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#F0B90B] px-4 text-xs font-bold text-[#0B0E11] hover:bg-[#F0B90B]/90"
            >
              <Plus className="h-4 w-4" />
              Pasang Alert
            </button>
          </div>
        </div>

        {/* Active & Triggered Alerts List */}
        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-[#EAECEF]">Daftar Price Alerts</span>
            <span className="font-mono tabular-nums text-[#848E9C]">
              {priceAlerts.filter((a) => a.active && !a.triggered).length} aktif · {priceAlerts.length} total
            </span>
          </div>

          {priceAlerts.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#2B3139] py-6 text-center text-xs text-[#5E6673]">
              Belum ada Price Alert terpasang.
            </p>
          ) : (
            <div className="space-y-2">
              {priceAlerts.map((alert) => {
                const live = coinsMap[alert.symbol]?.price ?? 0;
                const diffPct = live > 0 ? ((alert.targetPrice - live) / live) * 100 : 0;

                return (
                  <div
                    key={alert.id}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 ${
                      alert.triggered
                        ? 'border-[#F0B90B]/50 bg-[#F0B90B]/8'
                        : 'border-[#2B3139] bg-[#0B0E11]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {alert.triggered ? (
                          <BellRing className="h-3.5 w-3.5 text-[#F0B90B]" />
                        ) : (
                          <Bell className="h-3.5 w-3.5 text-[#848E9C]" />
                        )}
                        <span className="text-xs font-bold text-[#EAECEF]">
                          {alert.baseAsset}/USDT
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            alert.condition === 'ABOVE'
                              ? 'bg-[#00C087]/15 text-[#00C087]'
                              : 'bg-[#F6465D]/15 text-[#F6465D]'
                          }`}
                        >
                          {alert.condition === 'ABOVE' ? 'Naik ≥' : 'Turun ≤'}{' '}
                          <span className="font-mono tabular-nums">
                            {formatPrice(alert.targetPrice)}
                          </span>
                        </span>
                        {alert.triggered ? (
                          <span className="rounded bg-[#F0B90B]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#F0B90B]">
                            TERPICU {alert.triggeredAt ? formatDateTime(alert.triggeredAt) : ''}
                          </span>
                        ) : (
                          <span className="font-mono tabular-nums text-[10px] text-[#848E9C]">
                            Jarak {diffPct >= 0 ? `+${diffPct.toFixed(1)}%` : `${diffPct.toFixed(1)}%`}
                          </span>
                        )}
                      </div>
                      {alert.note && (
                        <p className="mt-1 truncate text-[11px] text-[#848E9C]">{alert.note}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {alert.triggered ? (
                        <button
                          type="button"
                          onClick={() => resetPriceAlert(alert.id)}
                          title="Aktifkan ulang alert"
                          className="inline-flex h-10 items-center gap-1 rounded-lg border border-[#2B3139] bg-[#161A1E] px-2.5 text-[11px] font-medium text-[#F0B90B]"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Reset
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => togglePriceAlert(alert.id)}
                          className={`min-h-[40px] rounded-lg border px-2.5 text-[11px] font-semibold ${
                            alert.active
                              ? 'border-[#00C087]/40 bg-[#00C087]/15 text-[#00C087]'
                              : 'border-[#2B3139] bg-[#161A1E] text-[#848E9C]'
                          }`}
                        >
                          {alert.active ? 'Aktif' : 'Nonaktif'}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => deletePriceAlert(alert.id)}
                        aria-label="Hapus alert"
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#2B3139] bg-[#161A1E] text-[#848E9C] hover:text-[#F6465D]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
