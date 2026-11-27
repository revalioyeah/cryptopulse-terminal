import { Activity, Radio, RefreshCw, WifiOff } from 'lucide-react';
import type { WsConnectionStatus } from '../../types';

interface WsStatusBadgeProps {
  status: WsConnectionStatus;
  compact?: boolean;
}

export function WsStatusBadge({ status, compact = false }: WsStatusBadgeProps) {
  const config = {
    connected: {
      dot: 'bg-[#00C087]',
      text: 'text-[#00C087]',
      label: 'Binance WS Live',
      shortLabel: 'LIVE',
      Icon: Radio,
    },
    connecting: {
      dot: 'bg-[#F0B90B]',
      text: 'text-[#F0B90B]',
      label: 'Menghubungkan WS...',
      shortLabel: 'SYNC',
      Icon: RefreshCw,
    },
    reconnecting: {
      dot: 'bg-[#F0B90B]',
      text: 'text-[#F0B90B]',
      label: 'Menyambung Ulang...',
      shortLabel: 'RETRY',
      Icon: RefreshCw,
    },
    fallback: {
      dot: 'bg-[#F0B90B]',
      text: 'text-[#F0B90B]',
      label: 'Simulated Live Feed',
      shortLabel: 'SIM',
      Icon: WifiOff,
    },
  }[status];

  if (compact) {
    return (
      <span
        title={config.label}
        className="inline-flex items-center gap-1.5 rounded-md border border-[#2B3139] bg-[#1E2329] px-2 py-1 text-[11px] font-medium"
      >
        <span className={`h-2 w-2 rounded-full ${config.dot}`} />
        <span className={`font-mono tabular-nums ${config.text}`}>{config.shortLabel}</span>
      </span>
    );
  }

  const Icon = config.Icon;
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 py-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`h-2 w-2 shrink-0 rounded-full ${config.dot}`} />
        <span className="truncate text-xs font-medium text-[#EAECEF]">{config.label}</span>
      </div>
      {status === 'connected' ? (
        <Activity className="h-3.5 w-3.5 shrink-0 text-[#00C087]" />
      ) : (
        <Icon className={`h-3.5 w-3.5 shrink-0 ${config.text}`} />
      )}
    </div>
  );
}
