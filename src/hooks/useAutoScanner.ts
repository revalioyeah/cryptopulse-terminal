import { useCallback, useEffect, useRef, useState } from 'react';
import type { AutoSignalLog, AutoSignalRule, Coin, SpotSetup, TradeSetup } from '../types';
import { fetchBinanceKlines } from '../services/adapters/binanceAdapter';
import { sendTelegramHtmlMessage } from '../services/adapters/telegramAdapter';
import { runBacktest } from '../services/backtestEngine';
import { detectSupportResistance } from '../services/indicators';
import { evaluateSpotQuality, generateSpotDcaPlan } from '../services/spotScoring';
import { useAppStore } from '../store/useAppStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTradingStore } from '../store/useTradingStore';
import { generateId } from '../utils/format';
import { calculateFuturesRisk, evaluateBtcBetaAlignment } from '../utils/riskCalc';
import { formatAutoScannerTelegram } from '../utils/telegramFormatters';

function matchesRule(coin: Coin, rule: AutoSignalRule): boolean {
  if (rule === 'MOMENTUM_BREAKOUT') {
    return coin.nearBreakout || (coin.priceChangePercent24h >= 2.5 && coin.volumeSpikeRatio >= 1.4);
  }
  if (rule === 'RSI_OVERSOLD_BOUNCE') {
    return coin.rsi14 <= 38 || (coin.priceChangePercent24h <= -2.5 && coin.rsi14 <= 44);
  }
  // HIGH_CONVICTION
  return (
    (coin.volumeSpikeRatio >= 1.5 && Math.abs(coin.oiChange24h) >= 4) ||
    Math.abs(coin.priceChangePercent24h) >= 4.5
  );
}

export function useAutoScanner() {
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const scanningRef = useRef(false);

  const scannerConfig = useTradingStore((s) => s.scannerConfig);
  const scannerLogs = useTradingStore((s) => s.scannerLogs);
  const updateScannerConfig = useTradingStore((s) => s.updateScannerConfig);

  const scanNow = useCallback(async (manual = false) => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setIsScanning(true);

    try {
      const appState = useAppStore.getState();
      const tradingState = useTradingStore.getState();
      const settingsState = useSettingsStore.getState();
      const config = tradingState.scannerConfig;
      const now = Date.now();
      const cooldownMs = config.cooldownSeconds * 1000;

      const candidates = appState.coins
        .filter((c) => {
          const lastHit = tradingState.scannerCooldowns[c.symbol] ?? 0;
          if (now - lastHit < cooldownMs) return false;
          return matchesRule(c, config.rule);
        })
        .sort((a, b) => b.volumeSpikeRatio * Math.abs(b.priceChangePercent24h) - a.volumeSpikeRatio * Math.abs(a.priceChangePercent24h));

      // Fallback to top volume-momentum coin on manual scan if strict filter yielded 0 off-cooldown
      const pool =
        candidates.length > 0
          ? candidates.slice(0, 2)
          : manual
            ? appState.coins
                .filter((c) => now - (tradingState.scannerCooldowns[c.symbol] ?? 0) >= cooldownMs)
                .slice(0, 1)
            : [];

      if (pool.length === 0) {
        if (manual) {
          appState.pushToast(
            'Scan Selesai — Belum Ada Sinyal Baru',
            'Semua kandidat masih dalam jendela Anti-Spam Cooldown atau belum memenuhi aturan.',
            'info',
          );
        }
        setLastScanAt(now);
        return;
      }

      const btcCoin = appState.coinsMap.BTCUSDT;
      let signalsFound = 0;

      for (const coin of pool) {
        const { candles } = await fetchBinanceKlines(coin.symbol, '1h', 300, coin.price);
        let newLog: AutoSignalLog;

        if (config.mode === 'FUTURES') {
          const strategy =
            config.rule === 'MOMENTUM_BREAKOUT'
              ? 'breakout_volume'
              : config.rule === 'RSI_OVERSOLD_BOUNCE'
                ? 'rsi_reversal'
                : 'ema_pullback';

          const bt = runBacktest(candles, {
            symbol: coin.symbol,
            strategy,
            timeframe: '1h',
            targetRR: 2.2,
            atrMultiplier: 1.5,
            feeRate: 0.001,
          });

          const direction =
            config.rule === 'RSI_OVERSOLD_BOUNCE' ? 'LONG' : bt.suggestedDirection;
          const entry = coin.price;
          const slDist = Math.max(bt.atrValue * 1.5, entry * 0.012);
          const stopLoss = direction === 'LONG' ? entry - slDist : entry + slDist;
          const tp1 = direction === 'LONG' ? entry + slDist * 1.5 : entry - slDist * 1.5;
          const tp2 = direction === 'LONG' ? entry + slDist * 2.4 : entry - slDist * 2.4;
          const tp3 = direction === 'LONG' ? entry + slDist * 3.5 : entry - slDist * 3.5;

          const risk = calculateFuturesRisk({
            direction,
            entries: [{ price: entry, weightPercent: 100 }],
            stopLoss,
            takeProfits: [
              { label: 'TP1', price: tp1, allocationPercent: 40 },
              { label: 'TP2', price: tp2, allocationPercent: 35 },
              { label: 'TP3', price: tp3, allocationPercent: 25 },
            ],
            accountEquity: config.defaultFuturesEquity,
            riskPercent: config.defaultRiskPercent,
            leverage: 8,
          });

          const beta = evaluateBtcBetaAlignment(
            coin.symbol,
            direction,
            btcCoin?.priceChangePercent24h ?? 0,
          );

          newLog = {
            id: generateId('sig'),
            symbol: coin.symbol,
            baseAsset: coin.baseAsset,
            mode: 'FUTURES',
            rule: config.rule,
            direction,
            entryPrice: entry,
            stopLoss: Number(stopLoss.toPrecision(6)),
            takeProfit: Number(tp2.toPrecision(6)),
            scoreOrGrade: `Grade ${bt.grade} · WR ${bt.winRate}%`,
            summary: `Backtest PF ${bt.profitFactor} | ATR SL | Vol Spike ${(coin.volumeSpikeRatio * 100).toFixed(0)}% | RSI ${coin.rsi14}`,
            telegramSent: false,
            savedToJournal: false,
            createdAt: now,
          };

          if (config.autoSaveJournal) {
            const setup: TradeSetup = {
              id: generateId('fut'),
              symbol: coin.symbol,
              baseAsset: coin.baseAsset,
              direction,
              timeframe: '1h',
              entryMode: 'SINGLE',
              entries: [{ price: entry, weightPercent: 100 }],
              avgEntry: entry,
              stopLoss: Number(stopLoss.toPrecision(6)),
              takeProfits: [
                { label: 'TP1', price: Number(tp1.toPrecision(6)), allocationPercent: 40 },
                { label: 'TP2', price: Number(tp2.toPrecision(6)), allocationPercent: 35 },
                { label: 'TP3', price: Number(tp3.toPrecision(6)), allocationPercent: 25 },
              ],
              accountEquity: config.defaultFuturesEquity,
              riskPercent: config.defaultRiskPercent,
              leverage: 8,
              riskAmountUsdt: risk.riskAmountUsdt,
              positionSizeUsdt: risk.positionSizeUsdt,
              positionQty: risk.positionQty,
              marginRequiredUsdt: risk.marginRequiredUsdt,
              estimatedLiquidation: risk.estimatedLiquidation,
              rrTp1: risk.rrTp1,
              rrTp2: risk.rrTp2,
              rrTp3: risk.rrTp3,
              btcBetaAligned: beta.aligned,
              confluenceChecks: [`Auto-Bot: ${config.rule}`, `Backtest Grade ${bt.grade}`],
              notes: newLog.summary,
              status: 'Waiting',
              source: 'AutoBot',
              createdAt: now,
              updatedAt: now,
            };
            useTradingStore.getState().addFuturesSetup(setup);
            newLog.savedToJournal = true;
          }
        } else {
          // SPOT_DCA mode: Spot Quality Score + 3-Layer DCA
          const quality = evaluateSpotQuality(coin, candles);
          const { supports } = detectSupportResistance(candles);
          const plan = generateSpotDcaPlan(coin.price, config.defaultSpotBudget, supports);

          newLog = {
            id: generateId('sig'),
            symbol: coin.symbol,
            baseAsset: coin.baseAsset,
            mode: 'SPOT_DCA',
            rule: config.rule,
            direction: 'ACCUMULATE',
            entryPrice: Number(plan.projectedAvgEntry.toPrecision(6)),
            takeProfit: plan.tp2,
            scoreOrGrade: `${quality.totalScore}/100 (${quality.tier})`,
            summary: `3-Layer DCA (20/30/50%) · Avg ${plan.projectedAvgEntry.toPrecision(5)} · Balik modal TP2 jual ${plan.sellPercentAtTp2ForBreakEven}%`,
            telegramSent: false,
            savedToJournal: false,
            createdAt: now,
          };

          if (config.autoSaveJournal) {
            const spotSetup: SpotSetup = {
              id: generateId('spot'),
              symbol: coin.symbol,
              baseAsset: coin.baseAsset,
              budgetUsdt: config.defaultSpotBudget,
              qualityScore: quality.totalScore,
              tier: quality.tier,
              layers: plan.layers,
              projectedAvgEntry: plan.projectedAvgEntry,
              tp1: plan.tp1,
              tp2: plan.tp2,
              tp3: plan.tp3,
              roiTp1Percent: plan.roiTp1Percent,
              roiTp2Percent: plan.roiTp2Percent,
              roiTp3Percent: plan.roiTp3Percent,
              sellPercentAtTp2ForBreakEven: plan.sellPercentAtTp2ForBreakEven,
              moonbagQty: plan.moonbagQty,
              moonbagValueAtTp3Usdt: plan.moonbagValueAtTp3Usdt,
              notes: `Auto-Bot Spot DCA (${config.rule})`,
              status: 'Waiting',
              source: 'AutoBot',
              createdAt: now,
              updatedAt: now,
            };
            useTradingStore.getState().addSpotSetup(spotSetup);
            newLog.savedToJournal = true;
          }
        }

        const shouldAutoSend =
          (config.autoSendTelegram ||
            (settingsState.telegramConfig.enabled && settingsState.telegramConfig.autoSendScanner)) &&
          Boolean(settingsState.telegramConfig.botToken && settingsState.telegramConfig.chatId);

        if (shouldAutoSend) {
          const res = await sendTelegramHtmlMessage(
            settingsState.telegramConfig,
            formatAutoScannerTelegram(newLog),
          );
          newLog.telegramSent = res.ok;
          if (!res.ok) {
            appState.pushToast('Auto-Kirim Telegram Gagal', res.message, 'error');
          }
        }

        useTradingStore.getState().setSymbolCooldown(coin.symbol, now);
        useTradingStore.getState().addScannerLog(newLog);
        signalsFound += 1;
      }

      setLastScanAt(now);
      if (signalsFound > 0) {
        appState.pushToast(
          `Auto-Scanner: ${signalsFound} Sinyal Ditemukan`,
          `Mode ${config.mode === 'FUTURES' ? 'Futures' : 'Spot DCA'} telah dicatat di Log Sinyal.`,
          'success',
        );
      }
    } finally {
      scanningRef.current = false;
      setIsScanning(false);
    }
  }, []);

  // Periodic background scanner interval with strict unmount cleanup
  useEffect(() => {
    if (!scannerConfig.enabled) return;
    const intervalMs = Math.max(15, scannerConfig.intervalSeconds) * 1000;
    const timer = window.setInterval(() => {
      void scanNow(false);
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [scannerConfig.enabled, scannerConfig.intervalSeconds, scanNow]);

  const resendSignalToTelegram = useCallback(async (log: AutoSignalLog) => {
    const { telegramConfig } = useSettingsStore.getState();
    const { pushToast, openSettingsModal } = useAppStore.getState();

    if (!telegramConfig.botToken || !telegramConfig.chatId) {
      pushToast(
        'Telegram Belum Dikonfigurasi',
        'Isi Bot Token & Chat ID di Settings & Backup untuk mengirim sinyal.',
        'warning',
      );
      openSettingsModal();
      return;
    }

    const res = await sendTelegramHtmlMessage(telegramConfig, formatAutoScannerTelegram(log));
    if (res.ok) {
      useTradingStore.getState().markScannerLogTelegramSent(log.id);
      pushToast('Sinyal Terkirim ke Telegram', `${log.symbol} (${log.direction}) berhasil diteruskan.`, 'success');
    } else {
      pushToast('Gagal Kirim Telegram', res.message, 'error');
    }
  }, []);

  return {
    scannerConfig,
    scannerLogs,
    isScanning,
    lastScanAt,
    updateScannerConfig,
    scanNow,
    resendSignalToTelegram,
  };
}
