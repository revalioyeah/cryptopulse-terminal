import { useCallback, useEffect, useState } from 'react';
import type { WhaleTx } from '../types';
import {
  fetchInitialWhaleFeed,
  subscribeWhaleStream,
  type WhaleStreamStatus,
} from '../services/adapters/whaleAdapter';

export function useWhaleStream() {
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [streamStatus, setStreamStatus] = useState<WhaleStreamStatus>('connecting');
  const [transactions, setTransactions] = useState<WhaleTx[]>([]);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const initial = await fetchInitialWhaleFeed();
      setTransactions((prev) => {
        const map = new Map<string, WhaleTx>();
        for (const tx of [...prev, ...initial]) {
          map.set(tx.id, tx);
        }
        return Array.from(map.values())
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 150);
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    if (paused) return;
    const cleanup = subscribeWhaleStream(
      (tx) => {
        setTransactions((prev) => {
          if (prev.some((item) => item.id === tx.id)) return prev;
          return [tx, ...prev].slice(0, 150);
        });
      },
      (status) => setStreamStatus(status),
    );
    return cleanup;
  }, [paused]);

  return {
    transactions,
    loading,
    streamStatus,
    paused,
    refreshSnapshot: loadSnapshot,
    togglePause: () => setPaused((p) => !p),
  };
}
