import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { DataProvider, useData } from './data';
import { ToastProvider } from './toast';
import { applyTheme } from './theme';
import { Layout } from './Layout';
import { UpdatePrompt } from '../pwa/UpdatePrompt';
import { requestSync, startSync, useSyncStatus } from '../sync/controller';
import { syncConfigured } from '../sync/config';
import { SignInScreen } from '../features/auth/SignInScreen';
import { LogPage } from '../features/log/LogPage';
import { HistoryPage } from '../features/history/HistoryPage';

import { ClientsPage, ClientPage } from '../features/clients/ClientsPage';
import { Onboarding } from '../features/onboarding/Onboarding';
import { LockScreen, LOCK_EVENT } from '../features/lock/LockScreen';

// Charts and settings load on first visit to those screens, so the Log screen opens fast.
const InsightsPage = lazy(() =>
  import('../features/insights/InsightsPage').then((m) => ({ default: m.InsightsPage })),
);
const ValuePage = lazy(() => import('../features/value/ValuePage').then((m) => ({ default: m.ValuePage })));
const MonthsPage = lazy(() =>
  import('../features/months/MonthsPage').then((m) => ({ default: m.MonthsPage })),
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
        <SyncDriver />
        <AuthGate>
          <LockGate>
            <OnboardingGate>
              <HashRouter>
                <Routes>
                  <Route element={<Layout />}>
                    <Route path="/log" element={<LogPage />} />
                    <Route path="/history" element={<HistoryPage />} />
                    <Route path="/insights" element={page(<InsightsPage />)} />
                    <Route path="/summary" element={<SummaryRedirect />} />
                    <Route path="/value" element={page(<ValuePage />)} />
                    <Route path="/months" element={page(<MonthsPage />)} />
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
        </AuthGate>
      </DataProvider>
    </ToastProvider>
  );
}

/** Summary became Insights; keep old links and bookmarks (with their period) working. */
function SummaryRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/insights${search}`} replace />;
}

/** Starts background sync (when this build has a Supabase project) and nudges it after edits. */
function SyncDriver() {
  const { visits, catalogs, monthRecords, goals } = useData();
  useEffect(() => startSync(), []);
  useEffect(
    () => requestSync(),
    [visits, catalogs.products, catalogs.areas, catalogs.retail, monthRecords, goals],
  );
  return null;
}

/**
 * With a Supabase project, Google sign-in comes first. The session is saved on the device, so this
 * screen shows once per device; later launches (online or not) go straight in.
 */
function AuthGate({ children }: { children: ReactNode }) {
  const s = useSyncStatus();
  if (!syncConfigured) return <>{children}</>;
  if (!s.authChecked) return <div className="center-screen muted">Loading…</div>;
  if (!s.email) return <SignInScreen />;
  return <>{children}</>;
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
