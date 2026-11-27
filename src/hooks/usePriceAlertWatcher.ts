import { useEffect, useRef } from 'react';
import { sendTelegramHtmlMessage } from '../services/adapters/telegramAdapter';
import { useAppStore } from '../store/useAppStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { formatPrice } from '../utils/format';
import { formatPriceAlertTelegram } from '../utils/telegramFormatters';

/**
 * Global hook yang memantau harga live dari stream Binance terhadap seluruh Price Alerts aktif.
 * Saat terpicu: tandai triggered (anti-spam), tampilkan Toast internal, dan teruskan ke Telegram bila aktif.
 */
export function usePriceAlertWatcher(): void {
  const coinsMap = useAppStore((s) => s.coinsMap);
  const priceAlerts = useSettingsStore((s) => s.priceAlerts);
  const markAlertTriggered = useSettingsStore((s) => s.markAlertTriggered);
  const processingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const activeAlerts = priceAlerts.filter((a) => a.active && !a.triggered);
    if (activeAlerts.length === 0) return;

    const { pushToast } = useAppStore.getState();
    const { telegramConfig } = useSettingsStore.getState();

    for (const alert of activeAlerts) {
      if (processingRef.current.has(alert.id)) continue;
      const coin = coinsMap[alert.symbol];
      if (!coin || coin.price <= 0) continue;

      const hit =
        alert.condition === 'ABOVE'
          ? coin.price >= alert.targetPrice
          : coin.price <= alert.targetPrice;

      if (!hit) continue;

      processingRef.current.add(alert.id);
      markAlertTriggered(alert.id, coin.price);

      const dirLabel = alert.condition === 'ABOVE' ? 'Naik ≥' : 'Turun ≤';
      pushToast(
        `Price Alert Terpicu: ${alert.baseAsset} ${dirLabel} ${formatPrice(alert.targetPrice)}`,
        `Harga live: ${formatPrice(coin.price)}${alert.note ? ` · ${alert.note}` : ''}`,
        'warning',
      );

      if (
        telegramConfig.enabled &&
        telegramConfig.autoSendAlerts &&
        telegramConfig.botToken &&
        telegramConfig.chatId
      ) {
        void sendTelegramHtmlMessage(
          telegramConfig,
          formatPriceAlertTelegram(alert, coin.price),
        );
      }
    }
  }, [coinsMap, priceAlerts, markAlertTriggered]);
}
