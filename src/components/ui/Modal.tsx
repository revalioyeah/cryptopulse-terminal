import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  children: ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  maxWidthClass = 'max-w-lg',
  children,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`flex max-h-[90vh] w-full ${maxWidthClass} flex-col rounded-t-2xl border border-[#2B3139] bg-[#161A1E] shadow-2xl sm:rounded-2xl`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#2B3139] px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-[#EAECEF]">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-xs text-[#848E9C]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#2B3139] bg-[#1E2329] text-[#848E9C] transition hover:text-[#EAECEF]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="cp-scrollbar overflow-y-auto p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}
