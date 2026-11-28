import { appendFileSync } from 'node:fs';
import { fetchBinanceTickers24h } from '../src/services/adapters/binanceAdapter';
import { sendTelegramHtmlMessage } from '../src/services/adapters/telegramAdapter';
import { runFuturesProScan, runSpot100FunnelScan } from '../src/services/scannerEngine';
import type {
  AutoSignalConfig,
  AutoSignalMode,
  Coin,
  FuturesScanReport,
  PriceAlert,
  SpotFunnelReport,
  SpotSetup,
  TradeSetup,
} from '../src/types';
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
    spotSetups: SpotSetup[];
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
  mode: 'BOTH',
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
  cooldownSeconds: 10_800, // 3 hours anti-spam default for Futures 24/7 cloud runs
  autoSendTelegram: true,
  autoSaveJournal: false,
  defaultFuturesEquity: 5000,
  defaultRiskPercent: 1.0,
  defaultSpotBudget: 1000,
};

function resolveCloudScanMode(raw?: string): AutoSignalMode {
  const normalized = raw?.trim().toUpperCase();
  if (normalized === 'FUTURES' || normalized === 'SPOT_DCA' || normalized === 'BOTH') {
    return normalized;
  }
  return 'BOTH';
}

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
  const effectiveMode = resolveCloudScanMode(process.env.SCAN_MODE);
  const syncGistToken = process.env.SYNC_GIST_TOKEN?.trim() || '';
  const syncGistIdEnv = process.env.SYNC_GIST_ID?.trim() || '';

  console.log('=== CryptoPulse Terminal — 24/7 Cloud Auto-Scanner (30m Cron) ===');
  console.log(
    `UTC Time: ${new Date().toISOString()} | Mode: ${effectiveMode} | DryRun: ${dryRun} | ForceSummary: ${forceSummary}`,
  );

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

  // Build merged scanner config (Cloud always runs BOTH Futures + Spot by default unless SCAN_MODE overrides)
  const mergedConfig: AutoSignalConfig = {
    ...DEFAULT_CLOUD_SCANNER_CONFIG,
    ...(cloudGist?.state.trading.scannerConfig ?? {}),
    mode: effectiveMode,
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
  const rawCooldowns = { ...(cloudGist?.state.trading.scannerCooldowns ?? {}) };

  const shouldRunFutures = effectiveMode === 'BOTH' || effectiveMode === 'FUTURES';
  const shouldRunSpot = effectiveMode === 'BOTH' || effectiveMode === 'SPOT_DCA';

  let futuresReport: FuturesScanReport | null = null;
  let futuresSignalsCount = 0;
  let futuresSentCount = 0;

  // 4A) Run Institutional 6-Layer Futures Pro Scanner (LONG & SHORT + SMC Limit Pullback POI)
  if (shouldRunFutures) {
    const futuresOutput = await runFuturesProScan(
      coins,
      coinsMap,
      watchlist,
      rawCooldowns,
      mergedConfig,
      (label, pct) => {
        console.log(`[Futures ${pct}%] ${label}`);
      },
    );

    futuresReport = futuresOutput.report;
    futuresSignalsCount = futuresOutput.signals.length;

    console.log(
      `[Futures Complete] BTC HTF (${futuresReport.htfTimeframe.toUpperCase()}): ${futuresReport.btcHtfTrend} | Universe: ${futuresReport.universeCount} | Evaluated: ${futuresReport.evaluatedCount} | Passed: ${futuresSignalsCount}`,
    );

    for (const item of futuresOutput.signals) {
      let sent = false;
      if (telegramReady && !dryRun) {
        const res = await sendTelegramHtmlMessage(
          { botToken, chatId },
          formatAutoScannerTelegram(item.log),
        );
        sent = res.ok;
        if (res.ok) futuresSentCount += 1;
        console.log(
          `[Telegram Futures] ${item.log.direction} ${item.log.symbol} (${item.log.scoreOrGrade}): ${res.ok ? 'SENT' : `FAILED (${res.message})`}`,
        );
      } else {
        console.log(
          `[DryRun/NoTelegram Futures] ${item.log.direction} ${item.log.symbol} @ ${formatPrice(item.log.entryPrice)} | SL ${formatPrice(item.log.stopLoss ?? 0)} | TP ${formatPrice(item.log.takeProfit ?? 0)} | ${item.log.scoreOrGrade}`,
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
  }

  let spotReport: SpotFunnelReport | null = null;
  let spotSignalsCount = 0;
  let spotSentCount = 0;

  // 4B) Run 100-Coin Institutional Spot Accumulation Funnel (Outperformance → Tokenomics → Trend 1D/4H → Watchlist + 3-Layer DCA)
  if (shouldRunSpot) {
    // Dedicated Spot cooldown namespace (SPOT:<symbol>) with >= 6h cooldown to prevent 30m Spot DCA spam
    const spotCooldowns: Record<string, number> = {};
    for (const [key, ts] of Object.entries(rawCooldowns)) {
      if (key.startsWith('SPOT:')) {
        spotCooldowns[key.slice(5)] = ts;
      }
    }

    const spotConfig: AutoSignalConfig = {
      ...mergedConfig,
      cooldownSeconds: Math.max(21_600, mergedConfig.cooldownSeconds),
    };

    const spotOutput = await runSpot100FunnelScan(
      coins,
      coinsMap,
      spotCooldowns,
      spotConfig,
      true,
      (label, pct) => {
        console.log(`[Spot 100 ${pct}%] ${label}`);
      },
    );

    spotReport = spotOutput.report;
    spotSignalsCount = spotOutput.signals.length;

    console.log(
      `[Spot Complete] Top ${spotReport.initialCount} → Outperf: ${spotReport.afterOutperformance} → Tokenomic: ${spotReport.afterTokenomics} → Trend 1D/4H: ${spotReport.afterTrend} → Watchlist Ready: ${spotReport.watchlistReady} | New Signals: ${spotSignalsCount}`,
    );

    if (cloudGist && mergedConfig.autoAddWatchlist) {
      const readySymbols = spotReport.candidates
        .filter((c) => c.stageReached === 'WATCHLIST_READY')
        .map((c) => c.symbol);
      if (readySymbols.length > 0) {
        const mergedWl = Array.from(
          new Set([...(cloudGist.state.trading.watchlist ?? []), ...readySymbols]),
        );
        if (mergedWl.length !== (cloudGist.state.trading.watchlist ?? []).length) {
          cloudGist.state.trading.watchlist = mergedWl;
          gistDirty = true;
        }
      }
    }

    for (const item of spotOutput.signals) {
      let sent = false;
      if (telegramReady && !dryRun) {
        const res = await sendTelegramHtmlMessage(
          { botToken, chatId },
          formatAutoScannerTelegram(item.log),
        );
        sent = res.ok;
        if (res.ok) spotSentCount += 1;
        console.log(
          `[Telegram Spot DCA] ${item.log.symbol} (${item.log.scoreOrGrade}): ${res.ok ? 'SENT' : `FAILED (${res.message})`}`,
        );
      } else {
        console.log(
          `[DryRun/NoTelegram Spot DCA] ${item.log.symbol} | DCA Avg ${formatPrice(item.log.entryPrice)} | TP2 ${formatPrice(item.log.takeProfit ?? 0)} | ${item.log.scoreOrGrade}`,
        );
      }

      if (cloudGist) {
        item.log.telegramSent = sent;
        cloudGist.state.trading.scannerCooldowns = {
          ...(cloudGist.state.trading.scannerCooldowns ?? {}),
          [`SPOT:${item.log.symbol}`]: Date.now(),
        };
        cloudGist.state.trading.scannerLogs = [
          item.log as unknown as Record<string, unknown>,
          ...(cloudGist.state.trading.scannerLogs ?? []),
        ].slice(0, 60);

        if (mergedConfig.autoSaveJournal) {
          cloudGist.state.trading.spotSetups = [
            item.spotSetup,
            ...(cloudGist.state.trading.spotSetups ?? []),
          ];
          item.log.savedToJournal = true;
        }
        gistDirty = true;
      }
    }
  }

  const totalSentCount = futuresSentCount + spotSentCount;

  // Optional manual test digest when user runs workflow manually with force_summary=true
  if (forceSummary && totalSentCount === 0 && telegramReady && !dryRun) {
    const btcPrice = coinsMap.BTCUSDT?.price ?? 0;
    const digestLines: string[] = [
      '<b>🛰️ CryptoPulse Cloud Scanner 24/7 — Laporan Test (Futures + Spot)</b>',
      '────────────────────',
      `BTC Live: <code>${formatPrice(btcPrice)}</code> · Mode: <b>${effectiveMode}</b>`,
    ];

    if (futuresReport) {
      const topAudits = futuresReport.audits
        .slice(0, 4)
        .map(
          (a) =>
            `• <b>${a.baseAsset}</b> (${a.direction}) — Skor ${a.confluenceScore}/100 · Grade ${a.backtestGrade} · ${a.passed ? '✅ LOLOS' : `⛔ ${a.rejectReason ?? 'Belum penuh'}`}`,
        )
        .join('\n');

      digestLines.push(
        '',
        `<b>⚡ Futures Pro 6-Layer (${futuresReport.htfTimeframe.toUpperCase()} BTC: ${futuresReport.btcHtfTrend})</b>`,
        `Pair Dipindai: <code>${futuresReport.universeCount}</code> (Evaluasi: ${futuresReport.evaluatedCount}) · Lolos: <code>${futuresSignalsCount}</code>`,
        topAudits || '• Tidak ada kandidat lolos filter likuiditas.',
      );
    }

    if (spotReport) {
      const topSpot = spotReport.candidates
        .filter((c) => c.stageReached === 'WATCHLIST_READY')
        .slice(0, 4)
        .map(
          (c) =>
            `• <b>${c.baseAsset}</b> (${c.tier ?? 'Growth'}) — Skor ${c.finalScore}/100 · RS 7D ${c.rsVsBtc7d >= 0 ? '+' : ''}${c.rsVsBtc7d}% · Float ${Math.round(c.mcapFdvRatio * 100)}%`,
        )
        .join('\n');

      digestLines.push(
        '',
        '<b>🎯 Spot 100-Coin 4-Stage Funnel</b>',
        `<code>${spotReport.initialCount}</code> → Outperf <code>${spotReport.afterOutperformance}</code> → Tokenomic <code>${spotReport.afterTokenomics}</code> → Trend <code>${spotReport.afterTrend}</code> → Layak Watchlist <code>${spotReport.watchlistReady}</code>`,
        topSpot || '• Belum ada koin Spot yang memenuhi seluruh 4 tahap saat ini.',
      );
    }

    digestLines.push(
      '',
      `Price Alerts Terpicu: <code>${alertsTriggeredCount}</code>`,
      '<i>Bot 24/7 aktif otomatis tiap 30 menit — memindai Futures Pro 6-Layer & Spot 100-Coin Funnel sekaligus.</i>',
    );

    const res = await sendTelegramHtmlMessage({ botToken, chatId }, digestLines.join('\n'));
    console.log(`[Telegram Test Digest] ${res.ok ? 'SENT' : `FAILED (${res.message})`}`);
  }

  // 5) Persist updated logs, cooldowns, setups, and triggered alerts back to Private Gist
  if (cloudGist && gistDirty && !dryRun) {
    const saved = await saveCloudGist(syncGistToken, cloudGist.gistId, cloudGist.state);
    console.log(`[Gist Sync] Update Private Gist: ${saved ? 'SUCCESS' : 'FAILED'}`);
  }

  // 6) Write GitHub Actions Job Summary
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  const summaryParts: string[] = [
    `## ⚡ CryptoPulse 24/7 Cloud Auto-Scanner Report`,
    `- **UTC:** \`${new Date().toISOString()}\` (${elapsedSec}s) | **Mode:** \`${effectiveMode}\``,
    `- **BTC Live:** \`${formatPrice(coinsMap.BTCUSDT?.price ?? 0)}\` | **Price Alerts Triggered:** **${alertsTriggeredCount}**`,
  ];

  if (futuresReport) {
    const futRows = futuresReport.audits
      .map(
        (a) =>
          `| **${a.baseAsset}** | ${a.direction} | ${a.confluenceScore}/100 | ${a.backtestGrade} (PF ${a.profitFactor.toFixed(2)}) | ${a.rsi14} | ${a.adx14} | ${a.passed ? '✅ LOLOS' : `⛔ ${a.rejectReason ?? '-'}`} |`,
      )
      .join('\n');

    summaryParts.push(
      '',
      `### Futures Pro 6-Layer (BTC HTF ${futuresReport.htfTimeframe.toUpperCase()}: \`${futuresReport.btcHtfTrend}\`)`,
      `- **Universe:** ${futuresReport.universeCount} Binance Futures Perpetual pairs | **Evaluated:** ${futuresReport.evaluatedCount} | **Passed:** **${futuresSignalsCount}** (Telegram sent: **${futuresSentCount}**)`,
      '',
      '| Coin | Bias | Skor | Backtest | RSI | ADX | Status |',
      '| :--- | :---: | :---: | :---: | :---: | :---: | :--- |',
      futRows,
    );
  }

  if (spotReport) {
    const spotRows = spotReport.candidates
      .slice(0, 12)
      .map(
        (c) =>
          `| **${c.baseAsset}** | #${c.marketCapRank} | ${c.rsVsBtc7d >= 0 ? '+' : ''}${c.rsVsBtc7d}% | ${Math.round(c.mcapFdvRatio * 100)}% | ${c.trend1d ?? '-'} / ${c.trend4h ?? '-'} | ${c.finalScore}/100 | ${c.stageReached === 'WATCHLIST_READY' ? `✅ ${c.tier ?? 'Watchlist'}` : `⛔ ${c.rejectReason ?? c.stageReached}`} |`,
      )
      .join('\n');

    summaryParts.push(
      '',
      `### Spot 100-Coin 4-Stage Accumulation Funnel`,
      `- **Pipeline:** ${spotReport.initialCount} → Outperformance: **${spotReport.afterOutperformance}** → Tokenomic: **${spotReport.afterTokenomics}** → Trend 1D/4H: **${spotReport.afterTrend}** → Layak Watchlist: **${spotReport.watchlistReady}** | **New Signals:** **${spotSignalsCount}** (Telegram sent: **${spotSentCount}**)`,
      '',
      '| Coin | Rank | RS 7D vs BTC | MCap/FDV | 1D / 4H | Skor | Status |',
      '| :--- | :---: | :---: | :---: | :---: | :---: | :--- |',
      spotRows,
    );
  }

  writeStepSummary(summaryParts.join('\n'));
}

main().catch((err) => {
  console.error('[CloudScanner] Fatal error:', err);
  process.exitCode = 1;
});
