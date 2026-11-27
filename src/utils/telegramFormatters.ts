import type { AutoSignalLog, PriceAlert, SpotSetup, TradeSetup } from '../types';
import { formatPercent, formatPrice, formatUsd } from './format';

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * 1. Formatter HTML khusus Setup Futures
 */
export function formatFuturesSetupTelegram(setup: TradeSetup): string {
  const emoji = setup.direction === 'LONG' ? '🟢' : '🔴';
  const tpLines = setup.takeProfits
    .map((tp) => `• ${tp.label} (${tp.allocationPercent}%): <code>${formatPrice(tp.price)}</code>`)
    .join('\n');

  return [
    `${emoji} <b>FUTURES SETUP — ${escapeHtml(setup.symbol)} (${setup.direction})</b>`,
    `Timeframe: <code>${setup.timeframe.toUpperCase()}</code> | Leverage: <code>${setup.leverage}x</code>`,
    '────────────────────',
    `Entry Avg: <code>${formatPrice(setup.avgEntry)}</code> (${setup.entryMode})`,
    `Stop Loss: <code>${formatPrice(setup.stopLoss)}</code>`,
    tpLines,
    '────────────────────',
    `Risk (${setup.riskPercent}%): <code>${formatUsd(setup.riskAmountUsdt)}</code> | Size: <code>${formatUsd(setup.positionSizeUsdt)}</code>`,
    `Margin: <code>${formatUsd(setup.marginRequiredUsdt)}</code> | Est. Liq: <code>${formatPrice(setup.estimatedLiquidation)}</code>`,
    `R:R -> TP1 <code>1:${setup.rrTp1.toFixed(2)}</code> | TP2 <code>1:${setup.rrTp2.toFixed(2)}</code> | TP3 <code>1:${setup.rrTp3.toFixed(2)}</code>`,
    `BTC Beta: ${setup.btcBetaAligned ? '✅ Searah Trend BTC' : '⚠️ Counter-Trend BTC'}`,
    setup.notes ? `Catatan: <i>${escapeHtml(setup.notes)}</i>` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * 2. Formatter HTML khusus Setup Spot DCA & Moonbag
 */
export function formatSpotSetupTelegram(setup: SpotSetup): string {
  const layerLines = setup.layers
    .map(
      (l) =>
        `• Layer ${l.layer} (${l.allocationPercent}%): <code>${formatPrice(l.price)}</code> (${formatUsd(l.budgetUsdt)})`,
    )
    .join('\n');

  return [
    `🟡 <b>SPOT DCA &amp; MOONBAG — ${escapeHtml(setup.symbol)}</b>`,
    `Quality Score: <code>${setup.qualityScore}/100</code> | Tier: <b>${escapeHtml(setup.tier)}</b>`,
    '────────────────────',
    `Total Budget: <code>${formatUsd(setup.budgetUsdt)}</code>`,
    layerLines,
    `Proyeksi Avg Entry: <code>${formatPrice(setup.projectedAvgEntry)}</code>`,
    '────────────────────',
    `TP1: <code>${formatPrice(setup.tp1)}</code> (${formatPercent(setup.roiTp1Percent)})`,
    `TP2 (Balik Modal): <code>${formatPrice(setup.tp2)}</code> (${formatPercent(setup.roiTp2Percent)})`,
    `TP3 (Moonbag): <code>${formatPrice(setup.tp3)}</code> (${formatPercent(setup.roiTp3Percent)})`,
    `Jual <code>${setup.sellPercentAtTp2ForBreakEven.toFixed(1)}%</code> di TP2 -> 100% modal kembali; Est. Moonbag di TP3: <code>${formatUsd(setup.moonbagValueAtTp3Usdt)}</code>`,
    setup.notes ? `Catatan: <i>${escapeHtml(setup.notes)}</i>` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * 3. Formatter HTML khusus Auto-Signal Scanner Bot
 */
export function formatAutoScannerTelegram(log: AutoSignalLog): string {
  const modeLabel = log.mode === 'FUTURES' ? 'FUTURES (Backtest+ATR)' : 'SPOT DCA (3-Layer)';
  const icon = log.direction === 'SHORT' ? '🔴' : log.direction === 'ACCUMULATE' ? '🟡' : '🟢';

  return [
    `${icon} <b>AUTO-SCANNER SIGNAL — ${escapeHtml(log.symbol)}</b>`,
    `Mode: <code>${modeLabel}</code>`,
    `Rule: <code>${escapeHtml(log.rule)}</code> | Skor/Grade: <b>${escapeHtml(log.scoreOrGrade)}</b>`,
    '────────────────────',
    `Arah: <b>${log.direction}</b>`,
    `Harga Trigger: <code>${formatPrice(log.entryPrice)}</code>`,
    log.stopLoss ? `SL Estimasi: <code>${formatPrice(log.stopLoss)}</code>` : '',
    log.takeProfit ? `TP Utama: <code>${formatPrice(log.takeProfit)}</code>` : '',
    `Ringkasan: <i>${escapeHtml(log.summary)}</i>`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * 4. Formatter HTML khusus Price Alerts Real-Time
 */
export function formatPriceAlertTelegram(alert: PriceAlert, livePrice: number): string {
  const dirText = alert.condition === 'ABOVE' ? 'NAIK ≥' : 'TURUN ≤';
  const icon = alert.condition === 'ABOVE' ? '🚀' : '📉';

  return [
    `${icon} <b>PRICE ALERT TERPICU — ${escapeHtml(alert.symbol)}</b>`,
    '────────────────────',
    `Kondisi: <code>${dirText} ${formatPrice(alert.targetPrice)}</code>`,
    `Harga Live: <b><code>${formatPrice(livePrice)}</code></b>`,
    alert.note ? `Catatan: <i>${escapeHtml(alert.note)}</i>` : '',
    `Waktu: <code>${new Date().toLocaleString('id-ID')}</code>`,
  ]
    .filter(Boolean)
    .join('\n');
}
