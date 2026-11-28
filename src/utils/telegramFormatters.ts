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
 * 3. Formatter HTML khusus Auto-Signal Scanner Bot (Pro)
 */
export function formatAutoScannerTelegram(log: AutoSignalLog): string {
  const modeLabel =
    log.mode === 'FUTURES'
      ? `FUTURES PRO (${(log.timeframe ?? '1h').toUpperCase()})`
      : 'SPOT 100-COIN FUNNEL (3-Layer DCA)';
  const icon = log.direction === 'SHORT' ? '🔴' : log.direction === 'ACCUMULATE' ? '🟡' : '🟢';

  const metricsLine =
    log.mode === 'FUTURES'
      ? [
          log.rsiReal !== undefined ? `RSI(14): <code>${log.rsiReal}</code>` : '',
          log.adxReal !== undefined ? `ADX: <code>${log.adxReal}</code>` : '',
          log.rrRatio !== undefined ? `R:R TP2: <code>1:${log.rrRatio.toFixed(2)}</code>` : '',
          log.fundingRate8h !== undefined
            ? `Funding 8h: <code>${log.fundingRate8h >= 0 ? '+' : ''}${log.fundingRate8h.toFixed(3)}%</code>`
            : '',
          log.openInterestChange24h !== undefined
            ? `OI 24h: <code>${log.openInterestChange24h >= 0 ? '+' : ''}${log.openInterestChange24h.toFixed(1)}%</code>`
            : '',
          log.rsVsBtc24h !== undefined
            ? `RS vs BTC: <code>${log.rsVsBtc24h >= 0 ? '+' : ''}${log.rsVsBtc24h}%</code>`
            : '',
        ]
          .filter(Boolean)
          .join(' | ')
      : [
          log.rsVsBtc7d !== undefined
            ? `RS vs BTC 7D: <code>${log.rsVsBtc7d >= 0 ? '+' : ''}${log.rsVsBtc7d}%</code>`
            : '',
          log.mcapFdvPercent !== undefined ? `Float MCap/FDV: <code>${log.mcapFdvPercent}%</code>` : '',
          log.rsiReal !== undefined ? `RSI 1D: <code>${log.rsiReal}</code>` : '',
        ]
          .filter(Boolean)
          .join(' | ');

  const reasonsBlock =
    log.reasons && log.reasons.length > 0
      ? `Konfluensi:\n${log.reasons.map((r) => `• ${escapeHtml(r)}`).join('\n')}`
      : '';

  const entryBlock =
    log.entry2 && log.entry3
      ? [
          log.poiLabel ? `Zona POI (Limit): <b>${escapeHtml(log.poiLabel)}</b>` : '',
          `Limit Entry 1 (40%): <code>${formatPrice(log.entryPrice)}</code>`,
          `Limit Entry 2 (35%): <code>${formatPrice(log.entry2)}</code>`,
          `Limit Entry 3 (25%): <code>${formatPrice(log.entry3)}</code>`,
        ]
          .filter(Boolean)
          .join('\n')
      : `Harga Trigger / Avg DCA: <code>${formatPrice(log.entryPrice)}</code>`;

  return [
    `${icon} <b>CRYPTOPULSE SCANNER PRO — ${escapeHtml(log.symbol)}</b>`,
    `Mode: <code>${escapeHtml(modeLabel)}</code>`,
    `Rule: <code>${escapeHtml(log.rule)}</code> | <b>${escapeHtml(log.scoreOrGrade)}</b>`,
    '────────────────────',
    `Arah: <b>${log.direction}</b>`,
    entryBlock,
    log.stopLoss ? `Stop Loss (Invalidasi POI): <code>${formatPrice(log.stopLoss)}</code>` : '',
    log.takeProfit ? `Target TP2 Utama: <code>${formatPrice(log.takeProfit)}</code>` : '',
    metricsLine,
    reasonsBlock,
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
