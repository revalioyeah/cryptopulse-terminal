import type { FearGreedData } from '../../types';
import { buildFallbackFearGreed } from './mockData';

const FEAR_GREED_URL =
  (import.meta.env.VITE_FEAR_GREED_API_URL as string | undefined)?.trim() ||
  'https://api.alternative.me/fng/';

interface AlternativeMeResponse {
  data?: Array<{
    value: string;
    value_classification: string;
    timestamp: string;
  }>;
}

export async function fetchFearGreedIndex(): Promise<FearGreedData> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 6000);
  try {
    const sep = FEAR_GREED_URL.includes('?') ? '&' : '?';
    const res = await fetch(`${FEAR_GREED_URL}${sep}limit=2`, { signal: controller.signal });
    if (!res.ok) throw new Error(`Alternative.me HTTP ${res.status}`);
    const payload = (await res.json()) as AlternativeMeResponse;
    const latest = payload.data?.[0];
    if (!latest) throw new Error('Empty Fear & Greed response');

    const prev = payload.data?.[1];
    return {
      value: Number.parseInt(latest.value, 10),
      classification: latest.value_classification,
      timestamp: Number.parseInt(latest.timestamp, 10) * 1000,
      previousValue: prev ? Number.parseInt(prev.value, 10) : undefined,
      isFallback: false,
    };
  } catch {
    return buildFallbackFearGreed();
  } finally {
    window.clearTimeout(timer);
  }
}
