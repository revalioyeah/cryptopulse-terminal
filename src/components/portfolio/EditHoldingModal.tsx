import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { SpotHolding } from '../../types';
import {
  formatPercent,
  formatPrice,
  formatRawPrice,
  formatUsd,
} from '../../utils/format';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Modal } from '../ui/Modal';

interface EditHoldingModalProps {
  holding: SpotHolding | null;
  livePrice: number;
  onClose: () => void;
  onSave: (input: {
    holdingId: string;
    quantity: number;
    avgBuyPrice: number;
    targetSellPrice: number;
    adjustUsdtDiff: boolean;
    note: string;
  }) => void;
  onDelete: (holding: SpotHolding) => void;
}

const TARGET_MULTIPLIERS = [
  { label: '+25%', mult: 1.25 },
  { label: '+50%', mult: 1.5 },
  { label: '+100%', mult: 2.0 },
  { label: '+200%', mult: 3.0 },
];

export function EditHoldingModal({
  holding,
  livePrice,
  onClose,
  onSave,
  onDelete,
}: EditHoldingModalProps) {
  const [qtyInput, setQtyInput] = useState('');
  const [avgInput, setAvgInput] = useState('');
  const [totalCostInput, setTotalCostInput] = useState('');
  const [targetInput, setTargetInput] = useState('');
  const [adjustUsdtDiff, setAdjustUsdtDiff] = useState(false);
  const [note, setNote] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    if (!holding) return;
    setQtyInput(String(Number(holding.quantity.toPrecision(8))));
    setAvgInput(formatRawPrice(holding.avgBuyPrice));
    setTotalCostInput(holding.totalCostUsdt.toFixed(2));
    setTargetInput(formatRawPrice(holding.targetSellPrice));
    setAdjustUsdtDiff(false);
    setNote('');
    setConfirmDeleteOpen(false);
  }, [holding]);

  if (!holding) return null;

  const qty = Number.parseFloat(qtyInput) || 0;
  const avg = Number.parseFloat(avgInput) || 0;
  const target = Number.parseFloat(targetInput) || 0;

  const newCost = qty * avg;
  const currentValue = qty * (livePrice > 0 ? livePrice : avg);
  const newPnl = currentValue - newCost;
  const newRoi = newCost > 0 ? (newPnl / newCost) * 100 : 0;
  const costDiff = newCost - holding.totalCostUsdt;

  const handleQtyChange = (val: string) => {
    setQtyInput(val);
    const q = Number.parseFloat(val);
    const a = Number.parseFloat(avgInput);
    if (Number.isFinite(q) && Number.isFinite(a) && q >= 0 && a >= 0) {
      setTotalCostInput((q * a).toFixed(2));
    }
  };

  const handleAvgChange = (val: string) => {
    setAvgInput(val);
    const q = Number.parseFloat(qtyInput);
    const a = Number.parseFloat(val);
    if (Number.isFinite(q) && Number.isFinite(a) && q >= 0 && a >= 0) {
      setTotalCostInput((q * a).toFixed(2));
    }
  };

  const handleTotalCostChange = (val: string) => {
    setTotalCostInput(val);
    const total = Number.parseFloat(val);
    const q = Number.parseFloat(qtyInput);
    if (Number.isFinite(total) && Number.isFinite(q) && q > 0 && total >= 0) {
      setAvgInput(formatRawPrice(total / q));
    }
  };

  const handleApplyTargetMult = (mult: number) => {
    const base = avg > 0 ? avg : livePrice;
    if (base > 0) {
      setTargetInput(formatRawPrice(base * mult));
    }
  };

  const handleSubmit = () => {
    onSave({
      holdingId: holding.id,
      quantity: qty,
      avgBuyPrice: avg,
      targetSellPrice: target,
      adjustUsdtDiff,
      note,
    });
  };

  return (
    <>
      <Modal
        open={Boolean(holding)}
        onClose={onClose}
        title={`Edit Aset — ${holding.baseAsset}/USDT`}
        subtitle={`Koreksi jumlah coin, Average Buy Price, Total Modal, atau Target TP · Live: ${formatPrice(livePrice)}`}
        maxWidthClass="max-w-lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-[#848E9C]">
                Jumlah Coin ({holding.baseAsset})
              </label>
              <input
                id="edit-holding-qty"
                type="number"
                step="any"
                min={0}
                value={qtyInput}
                onChange={(e) => handleQtyChange(e.target.value)}
                className="font-mono tabular-nums min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-sm font-bold text-[#EAECEF]"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-[#848E9C]">Avg Buy Price (USDT)</span>
                {livePrice > 0 && (
                  <button
                    type="button"
                    onClick={() => handleAvgChange(formatRawPrice(livePrice))}
                    className="text-[11px] font-medium text-[#F0B90B] hover:underline"
                  >
                    Pakai Live
                  </button>
                )}
              </div>
              <input
                id="edit-holding-avg"
                type="number"
                step="any"
                min={0}
                value={avgInput}
                onChange={(e) => handleAvgChange(e.target.value)}
                className="font-mono tabular-nums min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-sm font-bold text-[#F0B90B]"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-[#848E9C]">
                Total Modal (USDT) <span className="text-[10px] text-[#5E6673]">· Auto-sync Avg</span>
              </label>
              <input
                id="edit-holding-cost"
                type="number"
                step="any"
                min={0}
                value={totalCostInput}
                onChange={(e) => handleTotalCostChange(e.target.value)}
                className="font-mono tabular-nums min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-sm font-semibold text-[#EAECEF]"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-[#00C087]">Target Jual / TP (USDT)</label>
              <input
                id="edit-holding-target"
                type="number"
                step="any"
                min={0}
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                className="font-mono tabular-nums min-h-[42px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-sm font-semibold text-[#00C087]"
              />
            </div>
          </div>

          {/* Quick Target TP Multipliers */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] text-[#848E9C]">Quick Target TP:</span>
            {TARGET_MULTIPLIERS.map((m) => (
              <button
                key={m.label}
                type="button"
                onClick={() => handleApplyTargetMult(m.mult)}
                className="font-mono tabular-nums min-h-[34px] rounded-lg border border-[#2B3139] bg-[#0B0E11] px-2.5 text-[11px] font-semibold text-[#00C087] hover:border-[#00C087]/60"
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Live Preview */}
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3 text-center">
            <div>
              <span className="block text-[10px] text-[#848E9C]">Modal Baru</span>
              <span className="font-mono tabular-nums text-xs font-bold text-[#EAECEF]">
                {formatUsd(newCost)}
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-[#848E9C]">Nilai Live</span>
              <span className="font-mono tabular-nums text-xs font-bold text-[#F0B90B]">
                {formatUsd(currentValue)}
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-[#848E9C]">Unrealized PnL</span>
              <span
                className={`font-mono tabular-nums text-xs font-bold ${
                  newPnl >= 0 ? 'text-[#00C087]' : 'text-[#F6465D]'
                }`}
              >
                {formatUsd(newPnl, true)} ({formatPercent(newRoi, 1)})
              </span>
            </div>
          </div>

          {/* Optional USDT Cash Diff Sync */}
          <label className="flex min-h-[36px] cursor-pointer items-start gap-2 rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 py-2 text-xs text-[#EAECEF]">
            <input
              type="checkbox"
              checked={adjustUsdtDiff}
              onChange={(e) => setAdjustUsdtDiff(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#F0B90B]"
            />
            <span>
              Sesuaikan selisih modal (
              <strong className="font-mono tabular-nums text-[#F0B90B]">
                {formatUsd(-costDiff, true)}
              </strong>
              ) ke saldo Kas USDT
              <span className="block text-[10px] text-[#5E6673]">
                Biarkan tidak dicentang jika hanya memperbaiki salah ketik angka.
              </span>
            </span>
          </label>

          <div>
            <label className="mb-1 block text-xs text-[#848E9C]">Catatan Koreksi (Opsional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Misal: Koreksi Avg Buy sesuai riwayat Binance"
              className="min-h-[40px] w-full rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 text-xs text-[#EAECEF]"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(true)}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-[#F6465D]/40 bg-[#F6465D]/10 px-3 text-xs font-semibold text-[#F6465D] hover:bg-[#F6465D] hover:text-white"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Hapus Aset
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[42px] rounded-xl border border-[#2B3139] bg-[#1E2329] px-4 text-xs font-medium text-[#EAECEF]"
              >
                Batal
              </button>
              <button
                id="btn-save-edit-holding"
                type="button"
                onClick={handleSubmit}
                className="min-h-[42px] rounded-xl bg-[#F0B90B] px-4 text-xs font-bold text-[#0B0E11] hover:bg-[#F0B90B]/90"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={confirmDeleteOpen}
        title={`Hapus ${holding.baseAsset} dari Portofolio?`}
        description={`Aset ${holding.baseAsset} (${holding.quantity} ${holding.baseAsset}) akan dihapus dari daftar kepemilikan Spot tanpa mengubah saldo Kas USDT.`}
        confirmLabel="Ya, Hapus"
        danger
        onConfirm={() => {
          setConfirmDeleteOpen(false);
          onDelete(holding);
        }}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </>
  );
}
