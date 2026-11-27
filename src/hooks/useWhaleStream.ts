import { useEffect, useState } from 'react';
import type { WhaleTx } from '../types';
import { buildInitialWhaleFeed, subscribeWhaleStream } from '../services/adapters/whaleAdapter';
import { useAppStore } from '../store/useAppStore';

export function useWhaleStream() {
  const [paused, setPaused] = useState(false);
  const [transactions, setTransactions] = useState<WhaleTx[]>(() =>
    buildInitialWhaleFeed(useAppStore.getState().coinsMap),
  );

  useEffect(() => {
    if (paused) return;
    const cleanup = subscribeWhaleStream(
      () => useAppStore.getState().coinsMap,
      (tx) => {
        setTransactions((prev) => [tx, ...prev].slice(0, 80));
      },
    );
    return cleanup;
  }, [paused]);

  return {
    transactions,
    paused,
    togglePause: () => setPaused((p) => !p),
  };
}
