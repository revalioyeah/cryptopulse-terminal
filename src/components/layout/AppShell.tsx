import type { ReactNode } from 'react';
import {
  Activity,
  Bell,
  Briefcase,
  CandlestickChart,
  LayoutDashboard,
  Radar,
  Settings,
  ShieldCheck,
  Waves,
} from 'lucide-react';
import type { NavTabId } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTradingStore } from '../../store/useTradingStore';
import { formatPercent, formatPrice } from '../../utils/format';
import { WsStatusBadge } from './WsStatusBadge';
import { ToastContainer } from '../ui/ToastContainer';

interface NavItemConfig {
  id: NavTabId;
  label: string;
  mobileLabel: string;
  Icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItemConfig[] = [
  { id: 'dashboard', label: 'Dashboard', mobileLabel: 'Market', Icon: LayoutDashboard },
  { id: 'screener', label: 'Screener', mobileLabel: 'Screen', Icon: Radar },
  { id: 'analysis', label: 'Analisa Coin', mobileLabel: 'Analisa', Icon: CandlestickChart },
  { id: 'setup', label: 'Setup & Risk', mobileLabel: 'Setup', Icon: ShieldCheck },
  { id: 'whale', label: 'Whale Activity', mobileLabel: 'Whale', Icon: Waves },
  { id: 'portfolio', label: 'Portofolio Spot', mobileLabel: 'Porto', Icon: Briefcase },
];

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const wsStatus = useAppStore((s) => s.wsStatus);
  const btcCoin = useAppStore((s) => s.coinsMap.BTCUSDT);
  const scannerRunning = useAppStore((s) => s.scannerRunning);
  const openPriceAlertsModal = useAppStore((s) => s.openPriceAlertsModal);
  const openSettingsModal = useAppStore((s) => s.openSettingsModal);
  const openAnalysis = useAppStore((s) => s.openAnalysis);

  const scannerEnabled = useTradingStore((s) => s.scannerConfig.enabled);
  const activeAlertsCount = useSettingsStore(
    (s) => s.priceAlerts.filter((a) => a.active && !a.triggered).length,
  );

  const btcPositive = (btcCoin?.priceChangePercent24h ?? 0) >= 0;

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#0B0E11] text-[#EAECEF]">
      {/* Desktop Fixed Left Sidebar (>= 1024px) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-[#2B3139] bg-[#161A1E] lg:flex">
        <div className="flex items-center gap-3 border-b border-[#2B3139] px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0B0E11] border border-[#2B3139]">
            <Activity className="h-5 w-5 text-[#F0B90B]" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight text-[#EAECEF]">
              CryptoPulse
            </p>
            <p className="text-[11px] font-medium uppercase tracking-wider text-[#848E9C]">
              Terminal Pro
            </p>
          </div>
        </div>

        {/* Live BTC Mini Strip inside Sidebar */}
        {btcCoin && (
          <button
            type="button"
            onClick={() => openAnalysis('BTCUSDT')}
            className="mx-3 mt-3 flex items-center justify-between rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 py-2.5 text-left transition hover:border-[#F0B90B]/50"
          >
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#848E9C]">
                BTC / USDT
              </span>
              <p className="font-mono tabular-nums text-sm font-semibold text-[#EAECEF]">
                {formatPrice(btcCoin.price)}
              </p>
            </div>
            <span
              className={`font-mono tabular-nums rounded-md px-2 py-0.5 text-xs font-semibold ${
                btcPositive
                  ? 'bg-[#00C087]/15 text-[#00C087]'
                  : 'bg-[#F6465D]/15 text-[#F6465D]'
              }`}
            >
              {formatPercent(btcCoin.priceChangePercent24h)}
            </span>
          </button>
        )}

        {/* 6 Main Navigation Items */}
        <nav aria-label="Menu Utama" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                id={`nav-desktop-${id}`}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex min-h-[42px] w-full items-center gap-3 rounded-xl px-3.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-[#F0B90B]/12 text-[#F0B90B]'
                    : 'text-[#848E9C] hover:bg-[#1E2329] hover:text-[#EAECEF]'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#F0B90B]' : ''}`} />
                <span className="truncate">{label}</span>
                {id === 'screener' && (scannerEnabled || scannerRunning) && (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#00C087]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#00C087]">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00C087]" />
                    {scannerRunning ? 'Scan' : 'ON'}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Shortcuts: Price Alerts, Settings & Backup + WS Status */}
        <div className="space-y-2 border-t border-[#2B3139] p-3">
          <button
            id="btn-desktop-alerts"
            type="button"
            onClick={() => openPriceAlertsModal()}
            className="flex min-h-[40px] w-full items-center justify-between rounded-xl border border-[#2B3139] bg-[#1E2329] px-3 text-xs font-medium text-[#EAECEF] transition hover:border-[#F0B90B]/50"
          >
            <span className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-[#F0B90B]" />
              Price Alerts
            </span>
            <span className="font-mono tabular-nums rounded-md bg-[#0B0E11] px-2 py-0.5 text-[11px] font-semibold text-[#F0B90B]">
              {activeAlertsCount}
            </span>
          </button>

          <button
            id="btn-desktop-settings"
            type="button"
            onClick={openSettingsModal}
            className="flex min-h-[40px] w-full items-center gap-2 rounded-xl border border-[#2B3139] bg-[#1E2329] px-3 text-xs font-medium text-[#EAECEF] transition hover:border-[#F0B90B]/50"
          >
            <Settings className="h-4 w-4 text-[#848E9C]" />
            <span>Settings &amp; Backup</span>
          </button>

          <WsStatusBadge status={wsStatus} />
        </div>
      </aside>

      {/* Mobile Sticky Top Header (< 1024px) */}
      <header className="safe-area-pt sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-[#2B3139] bg-[#161A1E]/95 px-3 py-2 backdrop-blur-md lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#2B3139] bg-[#0B0E11]">
            <Activity className="h-4 w-4 text-[#F0B90B]" />
          </div>
          {btcCoin && (
            <button
              type="button"
              onClick={() => openAnalysis('BTCUSDT')}
              className="flex min-h-[40px] min-w-0 flex-col justify-center text-left"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#848E9C]">
                  BTC
                </span>
                <span
                  className={`font-mono tabular-nums text-[10px] font-semibold ${
                    btcPositive ? 'text-[#00C087]' : 'text-[#F6465D]'
                  }`}
                >
                  {formatPercent(btcCoin.priceChangePercent24h)}
                </span>
              </div>
              <span className="font-mono tabular-nums truncate text-xs font-bold text-[#EAECEF]">
                {formatPrice(btcCoin.price)}
              </span>
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <WsStatusBadge status={wsStatus} compact />

          <button
            id="btn-mobile-alerts"
            type="button"
            onClick={() => openPriceAlertsModal()}
            aria-label="Price Alerts"
            className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-[#2B3139] bg-[#1E2329] text-[#EAECEF]"
          >
            <Bell className="h-4 w-4 text-[#F0B90B]" />
            {activeAlertsCount > 0 && (
              <span className="font-mono tabular-nums absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#F0B90B] px-1 text-[10px] font-bold text-[#0B0E11]">
                {activeAlertsCount}
              </span>
            )}
          </button>

          <button
            id="btn-mobile-settings"
            type="button"
            onClick={openSettingsModal}
            aria-label="Settings dan Backup"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#2B3139] bg-[#1E2329] text-[#EAECEF]"
          >
            <Settings className="h-4 w-4 text-[#848E9C]" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="min-w-0 max-w-full pb-24 lg:pb-8 lg:pl-64">
        <div className="mx-auto w-full max-w-[1440px] px-3 py-4 sm:px-5 lg:px-6 lg:py-6">
          {children}
        </div>
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (6 tabs, >= 40px touch target, env(safe-area-inset-bottom)) */}
      <nav
        aria-label="Navigasi Bawah"
        className="safe-area-pb fixed inset-x-0 bottom-0 z-30 border-t border-[#2B3139] bg-[#161A1E]/95 backdrop-blur-md lg:hidden"
      >
        <div className="grid grid-cols-6 px-1 py-1">
          {NAV_ITEMS.map(({ id, mobileLabel, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                id={`nav-mobile-${id}`}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 text-[10px] font-medium transition ${
                  isActive ? 'text-[#F0B90B]' : 'text-[#848E9C]'
                }`}
              >
                <span className="relative">
                  <Icon className={`h-4 w-4 ${isActive ? 'text-[#F0B90B]' : ''}`} />
                  {id === 'screener' && (scannerEnabled || scannerRunning) && (
                    <span className="absolute -right-1 -top-1 h-2 w-2 animate-pulse rounded-full bg-[#00C087]" />
                  )}
                </span>
                <span className="max-w-full truncate">{mobileLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Internal Toast Queue */}
      <ToastContainer />
    </div>
  );
}
