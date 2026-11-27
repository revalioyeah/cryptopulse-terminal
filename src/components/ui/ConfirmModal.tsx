import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Konfirmasi',
  cancelLabel = 'Batal',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} maxWidthClass="max-w-md">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            danger ? 'bg-[#F6465D]/15 text-[#F6465D]' : 'bg-[#F0B90B]/15 text-[#F0B90B]'
          }`}
        >
          <AlertTriangle className="h-5 w-5" />
        </div>
        <p className="text-sm leading-relaxed text-[#EAECEF]">{description}</p>
      </div>
      <div className="mt-5 flex items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[40px] rounded-lg border border-[#2B3139] bg-[#1E2329] px-4 text-sm font-medium text-[#EAECEF] transition hover:bg-[#2B3139]"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`min-h-[40px] rounded-lg px-4 text-sm font-semibold transition ${
            danger
              ? 'bg-[#F6465D] text-white hover:bg-[#F6465D]/90'
              : 'bg-[#F0B90B] text-[#0B0E11] hover:bg-[#F0B90B]/90'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
