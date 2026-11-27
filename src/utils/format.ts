export function formatPrice(price: number): string {
  if (!Number.isFinite(price)) return '$0.00';
  const abs = Math.abs(price);
  if (abs === 0) return '$0.00';
  if (abs >= 1000) {
    return `$${price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  if (abs >= 1) {
    return `$${price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })}`;
  }
  if (abs >= 0.01) {
    return `$${price.toLocaleString('en-US', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 5,
    })}`;
  }
  if (abs >= 0.0001) {
    return `$${price.toFixed(6)}`;
  }
  return `$${price.toFixed(8)}`;
}

export function formatRawPrice(price: number): string {
  if (!Number.isFinite(price)) return '0';
  const abs = Math.abs(price);
  if (abs >= 1000) return price.toFixed(2);
  if (abs >= 1) return price.toFixed(4);
  if (abs >= 0.01) return price.toFixed(5);
  if (abs >= 0.0001) return price.toFixed(6);
  return price.toFixed(8);
}

export function formatCompactUsd(value: number): string {
  if (!Number.isFinite(value)) return '$0';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function formatUsd(value: number, showSign = false): string {
  if (!Number.isFinite(value)) return '$0.00';
  const sign = value < 0 ? '-' : showSign && value > 0 ? '+' : '';
  const abs = Math.abs(value);
  return `${sign}$${abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercent(value: number, decimals = 2, showSign = true): string {
  if (!Number.isFinite(value)) return '0.00%';
  const sign = showSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatQty(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (abs >= 1) return value.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return value.toFixed(6);
}

export function formatCountdown(targetMs: number, nowMs: number): string {
  const diff = Math.max(0, targetMs - nowMs);
  if (diff === 0) return 'LIVE NOW';
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  if (days > 0) {
    return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function generateId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
