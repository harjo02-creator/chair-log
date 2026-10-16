import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DataProvider, useData } from './data';
import { ToastProvider } from './toast';
import { applyTheme } from './theme';
import { Layout } from './Layout';
import { UpdatePrompt } from '../pwa/UpdatePrompt';
import { LogPage } from '../features/log/LogPage';
import { HistoryPage } from '../features/history/HistoryPage';

import { ClientsPage, ClientPage } from '../features/clients/ClientsPage';
import { Onboarding } from '../features/onboarding/Onboarding';
import { LockScreen, LOCK_EVENT } from '../features/lock/LockScreen';

// Charts and settings load on first visit to those screens, so the Log screen opens fast.
const SummaryPage = lazy(() =>
  import('../features/summary/SummaryPage').then((m) => ({ default: m.SummaryPage })),
);
const ReportPage = lazy(() =>
  import('../features/summary/ReportPage').then((m) => ({ default: m.ReportPage })),
);
const SettingsPage = lazy(() =>
  import('../features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const page = (el: ReactNode) => <Suspense fallback={<p className="muted">Loading…</p>}>{el}</Suspense>;

export function App() {
  return (
    <ToastProvider>
      <UpdatePrompt />
      <DataProvider fallback={<div className="center-screen muted">Loading…</div>}>
        <ThemeSync />
        <LockGate>
          <OnboardingGate>
            <HashRouter>
              <Routes>
                <Route element={<Layout />}>
                  <Route path="/log" element={<LogPage />} />
                  <Route path="/history" element={<HistoryPage />} />
                  <Route path="/summary" element={page(<SummaryPage />)} />
                  <Route path="/report" element={page(<ReportPage />)} />
                  <Route path="/clients" element={<ClientsPage />} />
                  <Route path="/clients/:clientId" element={<ClientPage />} />
                  <Route path="/settings" element={page(<SettingsPage />)} />
                  <Route path="*" element={<Navigate to="/log" replace />} />
                </Route>
              </Routes>
            </HashRouter>
          </OnboardingGate>
        </LockGate>
      </DataProvider>
    </ToastProvider>
  );
}

function ThemeSync() {
  const { settings } = useData();
  useEffect(() => applyTheme(settings.theme), [settings.theme]);
  return null;
}

function OnboardingGate({ children }: { children: ReactNode }) {
  const { settings } = useData();
  return settings.onboardingDone ? <>{children}</> : <Onboarding />;
}

/** SUG-1: locked on launch when a PIN is set, and again after N minutes in the background. */
function LockGate({ children }: { children: ReactNode }) {
  const { settings } = useData();
  const hasPin = settings.pin != null;
  const [locked, setLocked] = useState(hasPin);
  const hiddenAt = useRef<number | null>(null);

  // After "Forgot PIN" erases everything there is no PIN, so a PIN set later must not lock at once.
  useEffect(() => {
    if (!hasPin) setLocked(false);
  }, [hasPin]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now();
      else if (
        hasPin &&
        hiddenAt.current &&
        Date.now() - hiddenAt.current >= settings.autoLockMinutes * 60_000
      )
        setLocked(true);
    };
    const onLock = () => hasPin && setLocked(true);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener(LOCK_EVENT, onLock);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener(LOCK_EVENT, onLock);
    };
  }, [hasPin, settings.autoLockMinutes]);

  if (hasPin && locked) return <LockScreen onUnlock={() => setLocked(false)} />;
  return <>{children}</>;
}
