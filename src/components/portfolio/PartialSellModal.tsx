import { useEffect, useState } from 'react';
import type { SpotHolding } from '../../types';
import { formatPrice, formatQty, formatRawPrice, formatUsd } from '../../utils/format';
import { Modal } from '../ui/Modal';

interface PartialSellModalProps {
  holding: SpotHolding | null;
  livePrice: number;
  onClose: () => void;
  onConfirmSell: (sellPercent: number, sellPrice: number, note: string) => void;
}

const QUICK_PERCENTS = [25, 50, 75, 100];

export function PartialSellModal({
  holding,
  livePrice,
  onClose,
  onConfirmSell,
}: PartialSellModalProps) {
  const [sellPercent, setSellPercent] = useState<number>(25);
  const [sellPrice, setSellPrice] = useState<number>(livePrice);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (holding) {
      setSellPercent(25);
      setSellPrice(Number(formatRawPrice(livePrice > 0 ? livePrice : holding.avgBuyPrice)));
      setNote('');
    }
  }, [holding, livePrice]);

  if (!holding) return null;

  const qtyToSell = (holding.quantity * sellPercent) / 100;
  const proceedsUsdt = qtyToSell * sellPrice;
  const costSold = (holding.totalCostUsdt * sellPercent) / 100;
  const estRealizedPnl = proceedsUsdt - costSold;

  return (
    <Modal
      open={Boolean(holding)}
      onClose={onClose}
      title={`Jual / Take Profit — ${holding.baseAsset}`}
      subtitle={`Dimiliki: ${formatQty(holding.quantity)} ${holding.baseAsset} · Avg ${formatPrice(holding.avgBuyPrice)}`}
    >
      <div className="space-y-4">
        {/* Quick Percent Buttons */}
        <div>
          <span className="mb-1.5 block text-xs font-medium text-[#848E9C]">
            Pilih Persentase Jual / TP
          </span>
          <div className="grid grid-cols-4 gap-2">
            {QUICK_PERCENTS.map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setSellPercent(pct)}
                className={`font-mono tabular-nums min-h-[42px] rounded-xl text-xs font-bold transition ${
                  sellPercent === pct
                    ? 'bg-[#F0B90B] text-[#0B0E11]'
                    : 'border border-[#2B3139] bg-[#0B0E11] text-[#EAECEF]'
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        {/* Sell Price */}
        <div>
          <label className="mb-1 block text-xs text-[#848E9C]">Harga Jual (USDT)</label>
          <input
            type="number"
            step="any"
            value={sellPrice}
            onChange={(e) => setSellPrice(Number(e.target.value) || 0)}
            className="font-mono tabular-nums min-h-[44px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-sm font-bold text-[#EAECEF]"
          />
        </div>

        {/* Live Preview */}
        <div className="grid grid-cols-2 gap-2.5 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
          <div>
            <span className="block text-[11px] text-[#848E9C]">Jumlah Dijual</span>
            <span className="font-mono tabular-nums text-sm font-bold text-[#EAECEF]">
              {formatQty(qtyToSell)} {holding.baseAsset}
            </span>
          </div>
          <div>
            <span className="block text-[11px] text-[#848E9C]">Hasil USDT</span>
            <span className="font-mono tabular-nums text-sm font-bold text-[#F0B90B]">
              {formatUsd(proceedsUsdt)}
            </span>
          </div>
          <div className="col-span-2 border-t border-[#2B3139] pt-2">
            <span className="block text-[11px] text-[#848E9C]">Estimasi Realized PnL</span>
            <span
              className={`font-mono tabular-nums text-base font-bold ${
                estRealizedPnl >= 0 ? 'text-[#00C087]' : 'text-[#F6465D]'
              }`}
            >
              {formatUsd(estRealizedPnl, true)}
            </span>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-[#848E9C]">Catatan (Opsional)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Misal: TP1 di resistance mingguan"
            className="min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-xs text-[#EAECEF]"
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] rounded-xl border border-[#2B3139] bg-[#1E2329] px-4 text-xs font-medium text-[#EAECEF]"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => onConfirmSell(sellPercent, sellPrice, note)}
            className="min-h-[42px] rounded-xl bg-[#00C087] px-4 text-xs font-bold text-[#0B0E11] hover:bg-[#00C087]/90"
          >
            Eksekusi Jual {sellPercent}%
          </button>
        </div>
      </div>
    </Modal>
  );
}
