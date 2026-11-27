import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { ToastItem, ToastVariant } from '../../types';
import { useAppStore } from '../../store/useAppStore';

const VARIANT_STYLES: Record<
  ToastVariant,
  { border: string; iconColor: string; Icon: typeof Info }
> = {
  success: { border: 'border-[#00C087]/50', iconColor: 'text-[#00C087]', Icon: CheckCircle2 },
  error: { border: 'border-[#F6465D]/50', iconColor: 'text-[#F6465D]', Icon: XCircle },
  warning: { border: 'border-[#F0B90B]/50', iconColor: 'text-[#F0B90B]', Icon: AlertTriangle },
  info: { border: 'border-[#2B3139]', iconColor: 'text-[#EAECEF]', Icon: Info },
};

function ToastRow({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const { border, iconColor, Icon } = VARIANT_STYLES[toast.variant];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onDismiss(toast.id);
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border ${border} bg-[#161A1E]/95 p-3.5 shadow-2xl backdrop-blur-md`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconColor}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#EAECEF]">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 text-xs leading-relaxed text-[#848E9C]">{toast.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Tutup notifikasi"
        className="flex h-10 w-10 -mr-1.5 -mt-1.5 shrink-0 items-center justify-center rounded-lg text-[#848E9C] transition hover:bg-[#1E2329] hover:text-[#EAECEF]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useAppStore((s) => s.toasts);
  const dismissToast = useAppStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-3 top-16 z-50 flex w-[calc(100vw-24px)] max-w-sm flex-col gap-2 lg:right-5 lg:top-5">
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
}
