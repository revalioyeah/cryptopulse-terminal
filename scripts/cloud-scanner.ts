import { appendFileSync } from 'node:fs';
import { fetchBinanceTickers24h } from '../src/services/adapters/binanceAdapter';
import { sendTelegramHtmlMessage } from '../src/services/adapters/telegramAdapter';
import { runFuturesProScan } from '../src/services/scannerEngine';
import type { AutoSignalConfig, Coin, PriceAlert, TradeSetup } from '../src/types';
import { formatPrice } from '../src/utils/format';
import {
  formatAutoScannerTelegram,
  formatPriceAlertTelegram,
} from '../src/utils/telegramFormatters';

const GIST_API_BASE = 'https://api.github.com/gists';
const GIST_FILENAME = 'cryptopulse-sync.json';

interface GistStateFile {
  app: 'CryptoPulse Terminal';
  schemaVersion: 1;
  exportedAt: number;
  trading: {
    watchlist: string[];
    futuresSetups: TradeSetup[];
    spotSetups: unknown[];
    maxDailySlHits: number;
    scannerConfig: Partial<AutoSignalConfig>;
    scannerLogs: Array<Record<string, unknown>>;
    scannerCooldowns: Record<string, number>;
  };
  portfolio: Record<string, unknown>;
  settings: {
    priceAlerts: PriceAlert[];
    telegramConfig: {
      botToken: string;
      chatId: string;
      enabled: boolean;
      autoSendFutures: boolean;
      autoSendSpot: boolean;
      autoSendScanner: boolean;
      autoSendAlerts: boolean;
    };
  };
}

interface GitHubGistRaw {
  id?: string;
  updated_at?: string;
  files?: Record<string, { content?: string; truncated?: boolean; raw_url?: string }>;
}

const DEFAULT_CLOUD_SCANNER_CONFIG: AutoSignalConfig = {
  enabled: true,
  intervalSeconds: 1800,
  mode: 'FUTURES',
  rule: 'HIGH_CONVICTION',
  timeframe: '1h',
  directionFilter: 'BOTH',
  universeScope: 'TOP_100',
  minVolume24hUsd: 10_000_000,
  minBacktestGrade: 'B+',
  minProfitFactor: 1.15,
  minConfluenceScore: 65,
  requireBtcAlignment: true,
  defaultLeverage: 5,
  minSpotScore: 68,
  minMcapFdvRatio: 0.55,
  autoAddWatchlist: false,
  cooldownSeconds: 10_800, // 3 hours anti-spam default for 24/7 cloud runs
  autoSendTelegram: true,
  autoSaveJournal: false,
  defaultFuturesEquity: 5000,
  defaultRiskPercent: 1.0,
  defaultSpotBudget: 1000,
};

async function loadCloudGist(
  gistToken: string,
  explicitGistId?: string,
): Promise<{ gistId: string; state: GistStateFile } | null> {
  const token = gistToken.trim();
  if (!token) return null;

  let gistId = explicitGistId?.trim() || '';

  // Auto-discover CryptoPulse Private Gist if Gist ID not explicitly provided
  if (!gistId) {
    const listRes = await fetch(`${GIST_API_BASE}?per_page=100&_t=${Date.now()}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
      },
    });
    if (!listRes.ok) {
      console.warn(`[CloudScanner] Gagal daftar Gist (HTTP ${listRes.status})`);
      return null;
    }
    const list = (await listRes.json()) as GitHubGistRaw[];
    const match = list
      .filter((g) => Boolean(g.id && g.files && g.files[GIST_FILENAME]))
      .sort((a, b) => (Date.parse(b.updated_at ?? '') || 0) - (Date.parse(a.updated_at ?? '') || 0))[0];
    if (!match?.id) {
      console.warn(`[CloudScanner] File ${GIST_FILENAME} belum ditemukan di Gist akun ini.`);
      return null;
    }
    gistId = match.id;
  }

  const res = await fetch(`${GIST_API_BASE}/${encodeURIComponent(gistId)}?_t=${Date.now()}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    console.warn(`[CloudScanner] Gagal membaca Gist ${gistId} (HTTP ${res.status})`);
    return null;
  }

  const data = (await res.json()) as GitHubGistRaw;
  const file = data.files?.[GIST_FILENAME];
  if (!file) return null;

  let raw = file.content ?? '';
  if (file.truncated && file.raw_url) {
    const rawRes = await fetch(file.raw_url);
    if (rawRes.ok) raw = await rawRes.text();
  }

  const parsed = JSON.parse(raw) as Partial<GistStateFile>;
  if (parsed.app !== 'CryptoPulse Terminal' || !parsed.trading || !parsed.settings) {
    console.warn('[CloudScanner] Format Gist bukan backup CryptoPulse v1.');
    return null;
  }

  return { gistId, state: parsed as GistStateFile };
}

async function saveCloudGist(
  gistToken: string,
  gistId: string,
  state: GistStateFile,
): Promise<boolean> {
  const res = await fetch(`${GIST_API_BASE}/${encodeURIComponent(gistId)}`, {
    method: 'PATCH',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${gistToken.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify({ ...state, exportedAt: Date.now() }, null, 2),
        },
      },
    }),
  });
  return res.ok;
}

function writeStepSummary(markdown: string): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  try {
    appendFileSync(summaryPath, `${markdown}\n`, 'utf8');
  } catch {
    // Ignore outside Actions
  }
}

export async function main(): Promise<void> {
  const startedAt = Date.now();
  const dryRun = process.env.DRY_RUN === 'true';
  const forceSummary = process.env.FORCE_SUMMARY === 'true';
  const syncGistToken = process.env.SYNC_GIST_TOKEN?.trim() || '';
  const syncGistIdEnv = process.env.SYNC_GIST_ID?.trim() || '';

  console.log('=== CryptoPulse Terminal — 24/7 Cloud Auto-Scanner (30m Cron) ===');
  console.log(`UTC Time: ${new Date().toISOString()} | DryRun: ${dryRun} | ForceSummary: ${forceSummary}`);

  // 1) Load live Binance Spot + Verified Binance Futures Perpetual list
  const tickerRes = await fetchBinanceTickers24h();
  if (tickerRes.isFallback || tickerRes.coins.length === 0) {
    console.error('[CloudScanner] Gagal mengambil data Binance live — membatalkan scan agar tidak mengirim sinyal palsu.');
    process.exitCode = 1;
    return;
  }

  const coins = tickerRes.coins;
  const coinsMap: Record<string, Coin> = Object.fromEntries(coins.map((c) => [c.symbol, c]));
  const futuresCount = coins.filter((c) => c.hasFutures).length;
  console.log(`[Market] Loaded ${coins.length} Binance Spot pairs (${futuresCount} verified Futures Perpetuals).`);

  // 2) Load user's Private GitHub Gist state if SYNC_GIST_TOKEN is configured
  const cloudGist = syncGistToken ? await loadCloudGist(syncGistToken, syncGistIdEnv) : null;
  if (cloudGist) {
    console.log(`[Gist] Terhubung ke Private Gist ${cloudGist.gistId.slice(0, 8)}...`);
  } else {
    console.log('[Gist] Tidak terhubung (mode standalone menggunakan GitHub Secrets).');
  }

  // Resolve Telegram credentials (Secrets take priority, fallback to Private Gist config)
  const botToken =
    process.env.TELEGRAM_BOT_TOKEN?.trim() ||
    cloudGist?.state.settings.telegramConfig?.botToken?.trim() ||
    '';
  const chatId =
    process.env.TELEGRAM_CHAT_ID?.trim() ||
    cloudGist?.state.settings.telegramConfig?.chatId?.trim() ||
    '';
  const telegramReady = Boolean(botToken && chatId);

  if (!telegramReady && !dryRun) {
    console.warn(
      '[Telegram] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID belum diset di GitHub Secrets maupun di Private Gist. Scan tetap berjalan (log only).',
    );
  }

  let gistDirty = false;
  let alertsTriggeredCount = 0;

  // 3) Evaluate Active Price Alerts from Private Gist against live Binance prices
  if (cloudGist && Array.isArray(cloudGist.state.settings.priceAlerts)) {
    const alerts = cloudGist.state.settings.priceAlerts;
    for (const alert of alerts) {
      if (!alert.active || alert.triggered) continue;
      const liveCoin = coinsMap[alert.symbol];
      if (!liveCoin || liveCoin.price <= 0) continue;

      const hit =
        alert.condition === 'ABOVE'
          ? liveCoin.price >= alert.targetPrice
          : liveCoin.price <= alert.targetPrice;
      if (!hit) continue;

      alert.active = false;
      alert.triggered = true;
      alert.triggeredAt = Date.now();
      alert.triggeredPrice = liveCoin.price;
      gistDirty = true;
      alertsTriggeredCount += 1;

      console.log(
        `[Alert] TRIGGERED ${alert.symbol} (${alert.condition} ${formatPrice(alert.targetPrice)}) @ live ${formatPrice(liveCoin.price)}`,
      );

      if (telegramReady && !dryRun) {
        const res = await sendTelegramHtmlMessage(
          { botToken, chatId },
          formatPriceAlertTelegram(alert, liveCoin.price),
        );
        console.log(`[Telegram Alert] ${alert.symbol}: ${res.ok ? 'SENT' : `FAILED (${res.message})`}`);
      }
    }
  }

  // 4) Run Institutional 6-Layer Futures Pro Scanner (LONG & SHORT + SMC Limit Pullback POI)
  const mergedConfig: AutoSignalConfig = {
    ...DEFAULT_CLOUD_SCANNER_CONFIG,
    ...(cloudGist?.state.trading.scannerConfig ?? {}),
    mode: 'FUTURES',
    cooldownSeconds: Math.max(
      1800,
      cloudGist?.state.trading.scannerConfig?.cooldownSeconds ??
        DEFAULT_CLOUD_SCANNER_CONFIG.cooldownSeconds,
    ),
  };

  const watchlist = cloudGist?.state.trading.watchlist ?? [
    'BTCUSDT',
    'ETHUSDT',
    'SOLUSDT',
    'BNBUSDT',
    'XRPUSDT',
    'SUIUSDT',
  ];
  const cooldowns = { ...(cloudGist?.state.trading.scannerCooldowns ?? {}) };

  const output = await runFuturesProScan(
    coins,
    coinsMap,
    watchlist,
    cooldowns,
    mergedConfig,
    (label, pct) => {
      console.log(`[Scan ${pct}%] ${label}`);
    },
  );

  console.log(
    `[Scan Complete] BTC HTF (${output.report.htfTimeframe.toUpperCase()}): ${output.report.btcHtfTrend} | Universe: ${output.report.universeCount} | Evaluated: ${output.report.evaluatedCount} | Passed: ${output.signals.length}`,
  );

  let signalsSentCount = 0;

  for (const item of output.signals) {
    let sent = false;
    if (telegramReady && !dryRun) {
      const res = await sendTelegramHtmlMessage(
        { botToken, chatId },
        formatAutoScannerTelegram(item.log),
      );
      sent = res.ok;
      if (res.ok) signalsSentCount += 1;
      console.log(
        `[Telegram Signal] ${item.log.direction} ${item.log.symbol} (${item.log.scoreOrGrade}): ${res.ok ? 'SENT' : `FAILED (${res.message})`}`,
      );
    } else {
      console.log(
        `[DryRun/NoTelegram Signal] ${item.log.direction} ${item.log.symbol} @ ${formatPrice(item.log.entryPrice)} | SL ${formatPrice(item.log.stopLoss ?? 0)} | TP ${formatPrice(item.log.takeProfit ?? 0)} | ${item.log.scoreOrGrade}`,
      );
    }

    if (cloudGist) {
      item.log.telegramSent = sent;
      cloudGist.state.trading.scannerCooldowns = {
        ...(cloudGist.state.trading.scannerCooldowns ?? {}),
        [item.log.symbol]: Date.now(),
      };
      cloudGist.state.trading.scannerLogs = [
        item.log as unknown as Record<string, unknown>,
        ...(cloudGist.state.trading.scannerLogs ?? []),
      ].slice(0, 60);

      if (mergedConfig.autoSaveJournal) {
        cloudGist.state.trading.futuresSetups = [
          item.setup,
          ...(cloudGist.state.trading.futuresSetups ?? []),
        ];
        item.log.savedToJournal = true;
      }
      gistDirty = true;
    }
  }

  // Optional manual test digest when user runs workflow manually with force_summary=true
  if (forceSummary && signalsSentCount === 0 && telegramReady && !dryRun) {
    const btcPrice = coinsMap.BTCUSDT?.price ?? 0;
    const topAudits = output.report.audits
      .slice(0, 5)
      .map(
        (a) =>
          `• <b>${a.baseAsset}</b> (${a.direction}) — Skor ${a.confluenceScore}/100 · Grade ${a.backtestGrade} · ${a.passed ? '✅ LOLOS' : `⛔ ${a.rejectReason ?? 'Belum penuh'}`}`,
      )
      .join('\n');

    const digestHtml = [
      '<b>🛰️ CryptoPulse Cloud Scanner 24/7 — Laporan Test</b>',
      '────────────────────',
      `BTC Live: <code>${formatPrice(btcPrice)}</code> · HTF (${output.report.htfTimeframe.toUpperCase()}): <b>${output.report.btcHtfTrend}</b>`,
      `Pair Futures Dipindai: <code>${output.report.universeCount}</code> (Evaluasi mendalam: ${output.report.evaluatedCount})`,
      `Sinyal Lolos 6-Layer: <code>${output.signals.length}</code> · Alert Terpicu: <code>${alertsTriggeredCount}</code>`,
      '',
      '<b>Top 5 Kandidat Audit:</b>',
      topAudits || '• Tidak ada kandidat lolos filter likuiditas.',
      '',
      '<i>Bot 24/7 aktif otomatis tiap 30 menit — hanya mengirim sinyal saat seluruh filter 6-Layer terpenuhi.</i>',
    ].join('\n');

    const res = await sendTelegramHtmlMessage({ botToken, chatId }, digestHtml);
    console.log(`[Telegram Test Digest] ${res.ok ? 'SENT' : `FAILED (${res.message})`}`);
  }

  // 5) Persist updated logs, cooldowns, setups, and triggered alerts back to Private Gist
  if (cloudGist && gistDirty && !dryRun) {
    const saved = await saveCloudGist(syncGistToken, cloudGist.gistId, cloudGist.state);
    console.log(`[Gist Sync] Update Private Gist: ${saved ? 'SUCCESS' : 'FAILED'}`);
  }

  // 6) Write GitHub Actions Job Summary
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  const rows = output.report.audits
    .map(
      (a) =>
        `| **${a.baseAsset}** | ${a.direction} | ${a.confluenceScore}/100 | ${a.backtestGrade} (PF ${a.profitFactor.toFixed(2)}) | ${a.rsi14} | ${a.adx14} | ${a.passed ? '✅ LOLOS' : `⛔ ${a.rejectReason ?? '-'}`} |`,
    )
    .join('\n');

  writeStepSummary(
    [
      `## ⚡ CryptoPulse 24/7 Cloud Auto-Scanner Report`,
      `- **UTC:** \`${new Date().toISOString()}\` (${elapsedSec}s)`,
      `- **BTC Live:** \`${formatPrice(coinsMap.BTCUSDT?.price ?? 0)}\` | **BTC HTF (${output.report.htfTimeframe.toUpperCase()}):** \`${output.report.btcHtfTrend}\``,
      `- **Universe:** ${output.report.universeCount} Binance Futures Perpetual pairs | **Evaluated:** ${output.report.evaluatedCount}`,
      `- **Signals Passed:** **${output.signals.length}** (Telegram sent: **${signalsSentCount}**) | **Price Alerts Triggered:** **${alertsTriggeredCount}**`,
      '',
      '| Coin | Bias | Skor | Backtest | RSI | ADX | Status |',
      '| :--- | :---: | :---: | :---: | :---: | :---: | :--- |',
      rows,
    ].join('\n'),
  );
}

main().catch((err) => {
  console.error('[CloudScanner] Fatal error:', err);
  process.exitCode = 1;
});
