import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ActivityLog, PortfolioSnapshot, SpotHolding } from '../types';
import { generateId } from '../utils/format';

export interface PortfolioPersistedData {
  usdtBalance: number;
  autoDeductUsdtOnBuy: boolean;
  autoCreditUsdtOnSell: boolean;
  holdings: SpotHolding[];
  activityLogs: ActivityLog[];
  snapshots: PortfolioSnapshot[];
}

interface BuyDcaInput {
  symbol: string;
  baseAsset: string;
  name: string;
  quantity: number;
  buyPrice: number;
  targetSellPrice: number;
  note?: string;
}

interface PartialSellInput {
  holdingId: string;
  sellPercent: number; // 1 - 100
  sellPrice: number;
  note?: string;
}

interface EditHoldingInput {
  holdingId: string;
  quantity: number;
  avgBuyPrice: number;
  targetSellPrice: number;
  adjustUsdtDiff?: boolean;
  note?: string;
}

interface PortfolioState extends PortfolioPersistedData {
  demoCleanedV2?: boolean;
  setUsdtBalance: (amount: number, note?: string) => void;
  depositUsdt: (amount: number, note?: string) => void;
  withdrawUsdt: (amount: number, note?: string) => boolean;
  setAutoDeductUsdtOnBuy: (enabled: boolean) => void;
  setAutoCreditUsdtOnSell: (enabled: boolean) => void;
  buyOrDcaSpot: (input: BuyDcaInput) => { ok: boolean; error?: string };
  editHolding: (input: EditHoldingInput) => { ok: boolean; error?: string };
  partialSellSpot: (input: PartialSellInput) => { ok: boolean; realizedPnl?: number; error?: string };
  deleteHolding: (holdingId: string) => void;
  addActivityLog: (entry: Omit<ActivityLog, 'id'>) => void;
  recordSnapshot: (coinValueUsdt: number) => void;
  resetPortfolio: (options?: { initialUsdtBalance?: number; clearFuturesHistory?: boolean }) => void;
  hydratePortfolio: (data: Partial<PortfolioPersistedData>) => void;
}

const LEGACY_DEMO_HOLDING_IDS = new Set(['hold_btc', 'hold_sol', 'hold_tao']);
const LEGACY_DEMO_LOG_PREFIX = 'act_seed_';

export const usePortfolioStore = create<PortfolioState>()(
  persist(
    (set, get) => ({
      usdtBalance: 0,
      autoDeductUsdtOnBuy: true,
      autoCreditUsdtOnSell: true,
      holdings: [],
      activityLogs: [],
      snapshots: [],
      demoCleanedV2: true,

      setUsdtBalance: (amount, note) => {
        const safe = Math.max(0, Number(amount.toFixed(2)));
        set((state) => ({
          usdtBalance: safe,
          activityLogs: [
            {
              id: generateId('act'),
              category: 'USDT_CASH',
              action: 'USDT_SET_BALANCE',
              amountUsdt: safe,
              note: note || `Penyesuaian saldo kas USDT ke $${safe.toLocaleString('en-US')}`,
              timestamp: Date.now(),
            },
            ...state.activityLogs,
          ],
        }));
      },

      depositUsdt: (amount, note) => {
        if (amount <= 0) return;
        const safe = Number(amount.toFixed(2));
        set((state) => ({
          usdtBalance: Number((state.usdtBalance + safe).toFixed(2)),
          activityLogs: [
            {
              id: generateId('act'),
              category: 'USDT_CASH',
              action: 'USDT_DEPOSIT',
              amountUsdt: safe,
              note: note || 'Deposit kas USDT ke exchange',
              timestamp: Date.now(),
            },
            ...state.activityLogs,
          ],
        }));
      },

      withdrawUsdt: (amount, note) => {
        const state = get();
        if (amount <= 0 || amount > state.usdtBalance) return false;
        const safe = Number(amount.toFixed(2));
        set({
          usdtBalance: Number((state.usdtBalance - safe).toFixed(2)),
          activityLogs: [
            {
              id: generateId('act'),
              category: 'USDT_CASH',
              action: 'USDT_WITHDRAW',
              amountUsdt: safe,
              note: note || 'Penarikan kas USDT dari exchange',
              timestamp: Date.now(),
            },
            ...state.activityLogs,
          ],
        });
        return true;
      },

      setAutoDeductUsdtOnBuy: (enabled) => set({ autoDeductUsdtOnBuy: enabled }),
      setAutoCreditUsdtOnSell: (enabled) => set({ autoCreditUsdtOnSell: enabled }),

      buyOrDcaSpot: (input) => {
        const state = get();
        const totalCost = input.quantity * input.buyPrice;
        if (input.quantity <= 0 || input.buyPrice <= 0) {
          return { ok: false, error: 'Jumlah coin dan harga beli harus lebih dari 0.' };
        }
        if (state.autoDeductUsdtOnBuy && totalCost > state.usdtBalance + 0.01) {
          return {
            ok: false,
            error: `Saldo kas USDT ($${state.usdtBalance.toFixed(2)}) tidak cukup untuk pembelian $${totalCost.toFixed(2)}.`,
          };
        }

        const existing = state.holdings.find((h) => h.symbol === input.symbol);
        const now = Date.now();
        let nextHoldings: SpotHolding[];

        if (existing) {
          const newQty = existing.quantity + input.quantity;
          const newCost = existing.totalCostUsdt + totalCost;
          const newAvg = newCost / newQty;
          nextHoldings = state.holdings.map((h) =>
            h.symbol === input.symbol
              ? {
                  ...h,
                  quantity: newQty,
                  totalCostUsdt: newCost,
                  avgBuyPrice: newAvg,
                  targetSellPrice: input.targetSellPrice > 0 ? input.targetSellPrice : h.targetSellPrice,
                  updatedAt: now,
                }
              : h,
          );
        } else {
          nextHoldings = [
            {
              id: generateId('hold'),
              symbol: input.symbol,
              baseAsset: input.baseAsset,
              name: input.name,
              quantity: input.quantity,
              avgBuyPrice: input.buyPrice,
              totalCostUsdt: totalCost,
              targetSellPrice:
                input.targetSellPrice > 0 ? input.targetSellPrice : input.buyPrice * 1.35,
              realizedPnlUsdt: 0,
              updatedAt: now,
            },
            ...state.holdings,
          ];
        }

        const nextUsdt = state.autoDeductUsdtOnBuy
          ? Math.max(0, Number((state.usdtBalance - totalCost).toFixed(2)))
          : state.usdtBalance;

        const logEntry: ActivityLog = {
          id: generateId('act'),
          category: 'SPOT',
          action: existing ? 'SPOT_DCA' : 'SPOT_BUY',
          symbol: input.symbol,
          baseAsset: input.baseAsset,
          quantity: input.quantity,
          price: input.buyPrice,
          amountUsdt: Number(totalCost.toFixed(2)),
          note:
            input.note?.trim() ||
            (existing ? `DCA tambah posisi ${input.baseAsset}` : `Pembelian awal ${input.baseAsset}`),
          timestamp: now,
        };

        set({
          holdings: nextHoldings,
          usdtBalance: nextUsdt,
          activityLogs: [logEntry, ...state.activityLogs],
        });

        return { ok: true };
      },

      partialSellSpot: (input) => {
        const state = get();
        const holding = state.holdings.find((h) => h.id === input.holdingId);
        if (!holding) return { ok: false, error: 'Aset tidak ditemukan.' };
        if (input.sellPercent <= 0 || input.sellPercent > 100 || input.sellPrice <= 0) {
          return { ok: false, error: 'Persentase dan harga jual tidak valid.' };
        }

        const fraction = input.sellPercent / 100;
        const qtySold = holding.quantity * fraction;
        const proceedsUsdt = qtySold * input.sellPrice;
        const costBasisSold = holding.totalCostUsdt * fraction;
        const realizedPnl = Number((proceedsUsdt - costBasisSold).toFixed(2));
        const now = Date.now();

        const isFullClose = input.sellPercent >= 99.99;
        const nextHoldings = isFullClose
          ? state.holdings.filter((h) => h.id !== holding.id)
          : state.holdings.map((h) =>
              h.id === holding.id
                ? {
                    ...h,
                    quantity: Math.max(0, h.quantity - qtySold),
                    totalCostUsdt: Math.max(0, h.totalCostUsdt - costBasisSold),
                    realizedPnlUsdt: Number((h.realizedPnlUsdt + realizedPnl).toFixed(2)),
                    updatedAt: now,
                  }
                : h,
            );

        const nextUsdt = state.autoCreditUsdtOnSell
          ? Number((state.usdtBalance + proceedsUsdt).toFixed(2))
          : state.usdtBalance;

        const logEntry: ActivityLog = {
          id: generateId('act'),
          category: 'SPOT',
          action: 'SPOT_SELL_TP',
          symbol: holding.symbol,
          baseAsset: holding.baseAsset,
          quantity: qtySold,
          price: input.sellPrice,
          amountUsdt: Number(proceedsUsdt.toFixed(2)),
          pnlUsdt: realizedPnl,
          note:
            input.note?.trim() ||
            `Jual / TP ${input.sellPercent}% ${holding.baseAsset} (${realizedPnl >= 0 ? '+' : ''}$${realizedPnl.toFixed(2)})`,
          timestamp: now,
        };

        set({
          holdings: nextHoldings,
          usdtBalance: nextUsdt,
          activityLogs: [logEntry, ...state.activityLogs],
        });

        return { ok: true, realizedPnl };
      },

      editHolding: (input) => {
        const state = get();
        const holding = state.holdings.find((h) => h.id === input.holdingId);
        if (!holding) return { ok: false, error: 'Aset tidak ditemukan.' };
        if (
          !Number.isFinite(input.quantity) ||
          input.quantity <= 0 ||
          !Number.isFinite(input.avgBuyPrice) ||
          input.avgBuyPrice <= 0
        ) {
          return { ok: false, error: 'Jumlah coin dan Average Buy Price harus lebih dari 0.' };
        }

        const newTotalCost = Number((input.quantity * input.avgBuyPrice).toFixed(4));
        const costDiff = newTotalCost - holding.totalCostUsdt;
        let nextUsdt = state.usdtBalance;

        if (input.adjustUsdtDiff) {
          if (costDiff > 0 && costDiff > state.usdtBalance + 0.01) {
            return {
              ok: false,
              error: `Saldo kas USDT ($${state.usdtBalance.toFixed(2)}) tidak cukup untuk selisih tambah modal $${costDiff.toFixed(2)}.`,
            };
          }
          nextUsdt = Math.max(0, Number((state.usdtBalance - costDiff).toFixed(2)));
        }

        const safeTarget =
          Number.isFinite(input.targetSellPrice) && input.targetSellPrice > 0
            ? input.targetSellPrice
            : holding.targetSellPrice;
        const now = Date.now();

        const nextHoldings = state.holdings.map((h) =>
          h.id === holding.id
            ? {
                ...h,
                quantity: input.quantity,
                avgBuyPrice: input.avgBuyPrice,
                totalCostUsdt: newTotalCost,
                targetSellPrice: safeTarget,
                updatedAt: now,
              }
            : h,
        );

        const logEntry: ActivityLog = {
          id: generateId('act'),
          category: 'SPOT',
          action: 'SPOT_EDIT',
          symbol: holding.symbol,
          baseAsset: holding.baseAsset,
          quantity: input.quantity,
          price: input.avgBuyPrice,
          amountUsdt: Number(newTotalCost.toFixed(2)),
          note:
            input.note?.trim() ||
            `Koreksi data ${holding.baseAsset}: Qty ${input.quantity}, Avg $${input.avgBuyPrice}`,
          timestamp: now,
        };

        set({
          holdings: nextHoldings,
          usdtBalance: nextUsdt,
          activityLogs: [logEntry, ...state.activityLogs],
        });

        return { ok: true };
      },

      deleteHolding: (holdingId) =>
        set((state) => ({
          holdings: state.holdings.filter((h) => h.id !== holdingId),
        })),

      addActivityLog: (entry) =>
        set((state) => ({
          activityLogs: [{ ...entry, id: generateId('act') }, ...state.activityLogs],
        })),

      recordSnapshot: (coinValueUsdt) =>
        set((state) => {
          const nowUnix = Math.floor(Date.now() / 1000);
          const totalValueUsdt = Number((coinValueUsdt + state.usdtBalance).toFixed(2));
          const last = state.snapshots[state.snapshots.length - 1];
          // Avoid duplicate points with identical second; update latest if within 1 hour
          if (last && nowUnix - last.time < 3600) {
            const updated = [...state.snapshots];
            updated[updated.length - 1] = {
              time: last.time,
              totalValueUsdt,
              coinValueUsdt: Number(coinValueUsdt.toFixed(2)),
              usdtBalance: state.usdtBalance,
            };
            return { snapshots: updated };
          }
          return {
            snapshots: [
              ...state.snapshots,
              {
                time: nowUnix,
                totalValueUsdt,
                coinValueUsdt: Number(coinValueUsdt.toFixed(2)),
                usdtBalance: state.usdtBalance,
              },
            ].slice(-120),
          };
        }),

      resetPortfolio: (options) => {
        const initialUsdt = Math.max(0, Number((options?.initialUsdtBalance ?? 0).toFixed(2)));
        const clearFutures = options?.clearFuturesHistory ?? true;
        const nowUnix = Math.floor(Date.now() / 1000);

        set((state) => {
          const keptLogs = clearFutures
            ? []
            : state.activityLogs.filter((l) => l.category === 'FUTURES');

          const freshLogs: ActivityLog[] =
            initialUsdt > 0
              ? [
                  {
                    id: generateId('act'),
                    category: 'USDT_CASH',
                    action: 'USDT_SET_BALANCE',
                    amountUsdt: initialUsdt,
                    note: `Reset portofolio — Saldo awal Kas USDT $${initialUsdt.toLocaleString('en-US')}`,
                    timestamp: Date.now(),
                  },
                  ...keptLogs,
                ]
              : keptLogs;

          return {
            usdtBalance: initialUsdt,
            holdings: [],
            activityLogs: freshLogs,
            snapshots: [
              {
                time: nowUnix - 3600,
                totalValueUsdt: initialUsdt,
                coinValueUsdt: 0,
                usdtBalance: initialUsdt,
              },
              {
                time: nowUnix,
                totalValueUsdt: initialUsdt,
                coinValueUsdt: 0,
                usdtBalance: initialUsdt,
              },
            ],
          };
        });
      },

      hydratePortfolio: (data) =>
        set((state) => ({
          usdtBalance: typeof data.usdtBalance === 'number' ? data.usdtBalance : state.usdtBalance,
          autoDeductUsdtOnBuy:
            typeof data.autoDeductUsdtOnBuy === 'boolean'
              ? data.autoDeductUsdtOnBuy
              : state.autoDeductUsdtOnBuy,
          autoCreditUsdtOnSell:
            typeof data.autoCreditUsdtOnSell === 'boolean'
              ? data.autoCreditUsdtOnSell
              : state.autoCreditUsdtOnSell,
          holdings: Array.isArray(data.holdings) ? data.holdings : state.holdings,
          activityLogs: Array.isArray(data.activityLogs) ? data.activityLogs : state.activityLogs,
          snapshots: Array.isArray(data.snapshots) ? data.snapshots : state.snapshots,
        })),
    }),
    {
      name: 'cryptopulse-portfolio-v1',
      version: 2,
      migrate: (persistedState) => {
        const persisted = (persistedState ?? {}) as Partial<PortfolioState>;
        const rawHoldings = Array.isArray(persisted.holdings) ? persisted.holdings : [];
        const rawLogs = Array.isArray(persisted.activityLogs) ? persisted.activityLogs : [];
        const hasUserLogs = rawLogs.some((l) => !l.id.startsWith(LEGACY_DEMO_LOG_PREFIX));
        const hasUserHoldings = rawHoldings.some((h) => !LEGACY_DEMO_HOLDING_IDS.has(h.id));

        if (!hasUserLogs && !hasUserHoldings && (rawHoldings.length > 0 || rawLogs.length > 0)) {
          return {
            ...persisted,
            usdtBalance: 0,
            holdings: [],
            activityLogs: [],
            snapshots: [],
            demoCleanedV2: true,
          };
        }

        return {
          ...persisted,
          demoCleanedV2: true,
        };
      },
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<PortfolioState>;
        if (!persisted.demoCleanedV2) {
          const rawHoldings = Array.isArray(persisted.holdings) ? persisted.holdings : [];
          const rawLogs = Array.isArray(persisted.activityLogs) ? persisted.activityLogs : [];
          const hasUserLogs = rawLogs.some((l) => !l.id.startsWith(LEGACY_DEMO_LOG_PREFIX));
          const hasUserHoldings = rawHoldings.some((h) => !LEGACY_DEMO_HOLDING_IDS.has(h.id));

          // If the user has never edited/added real portfolio data, clear the old prototype seed cleanly
          if (!hasUserLogs && !hasUserHoldings && (rawHoldings.length > 0 || rawLogs.length > 0)) {
            return {
              ...currentState,
              ...persisted,
              usdtBalance: 0,
              holdings: [],
              activityLogs: [],
              snapshots: [],
              demoCleanedV2: true,
            };
          }
        }

        return {
          ...currentState,
          ...persisted,
          demoCleanedV2: true,
        };
      },
    },
  ),
);
