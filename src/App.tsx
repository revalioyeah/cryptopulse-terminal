import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './components/layout/AppShell';
import { PriceAlertsModal } from './components/modals/PriceAlertsModal';
import { SettingsBackupModal } from './components/modals/SettingsBackupModal';
import { useBinanceStream } from './hooks/useBinanceStream';
import { useGlobalAutoScanner } from './hooks/useAutoScanner';
import { usePriceAlertWatcher } from './hooks/usePriceAlertWatcher';
import { AnalysisPage } from './pages/AnalysisPage';
import { DashboardPage } from './pages/DashboardPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { ScreenerPage } from './pages/ScreenerPage';
import { SetupRiskPage } from './pages/SetupRiskPage';
import { WhaleActivityPage } from './pages/WhaleActivityPage';
import { useAppStore } from './store/useAppStore';

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
