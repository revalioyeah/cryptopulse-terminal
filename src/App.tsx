import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './components/layout/AppShell';
import { PriceAlertsModal } from './components/modals/PriceAlertsModal';
import { SettingsBackupModal } from './components/modals/SettingsBackupModal';
import { ConfirmModal } from './components/ui/ConfirmModal';
import { useGlobalAutoScanner } from './hooks/useAutoScanner';
import { useBinanceStream } from './hooks/useBinanceStream';
import { useCloudSync } from './hooks/useCloudSync';
import { usePriceAlertWatcher } from './hooks/usePriceAlertWatcher';
import { AnalysisPage } from './pages/AnalysisPage';
import { DashboardPage } from './pages/DashboardPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { ScreenerPage } from './pages/ScreenerPage';
import { SetupRiskPage } from './pages/SetupRiskPage';
import { WhaleActivityPage } from './pages/WhaleActivityPage';
import { useAppStore } from './store/useAppStore';
import { formatDateTime, formatUsd } from './utils/format';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function TerminalApp() {
  useBinanceStream();
  usePriceAlertWatcher();
  useGlobalAutoScanner();
  const { incomingPrompt, confirmIncomingPrompt, cancelIncomingPrompt } = useCloudSync();

  const activeTab = useAppStore((s) => s.activeTab);

  return (
    <AppShell>
      {activeTab === 'dashboard' && <DashboardPage />}
      {activeTab === 'screener' && <ScreenerPage />}
      {activeTab === 'analysis' && <AnalysisPage />}
      {activeTab === 'setup' && <SetupRiskPage />}
      {activeTab === 'whale' && <WhaleActivityPage />}
      {activeTab === 'portfolio' && <PortfolioPage />}

      <PriceAlertsModal />
      <SettingsBackupModal />

      <ConfirmModal
        open={Boolean(incomingPrompt)}
        title={
          incomingPrompt?.kind === 'CLOUD_PAIR'
            ? 'Hubungkan Cloud Sync dari Perangkat Lain?'
            : 'Terapkan Data Sync dari Perangkat Lain?'
        }
        description={
          incomingPrompt?.kind === 'CLOUD_PAIR'
            ? `Link pairing Cloud Sync terdeteksi (Gist ${incomingPrompt.gistId.slice(0, 8)}...). Aktifkan Auto-Sync dua arah dan tarik data terbaru dari Cloud sekarang?`
            : incomingPrompt?.kind === 'SNAPSHOT'
              ? `Snapshot (${formatDateTime(incomingPrompt.summary.exportedAt)}) berisi ${incomingPrompt.summary.holdingsCount} aset spot, Kas ${formatUsd(incomingPrompt.summary.usdtBalance)}, ${incomingPrompt.summary.futuresSetupsCount + incomingPrompt.summary.spotSetupsCount} setup jurnal, ${incomingPrompt.summary.watchlistCount} watchlist, dan ${incomingPrompt.summary.alertsCount} alerts. Data lokal saat ini akan ditimpa.`
              : ''
        }
        confirmLabel={
          incomingPrompt?.kind === 'CLOUD_PAIR' ? 'Hubungkan & Tarik Data' : 'Terapkan Sync'
        }
        onConfirm={() => void confirmIncomingPrompt()}
        onCancel={cancelIncomingPrompt}
      />
    </AppShell>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TerminalApp />
    </QueryClientProvider>
  );
}
