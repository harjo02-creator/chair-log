import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';

const TABS = [
  { to: '/log', label: 'Log a visit', short: 'Log', icon: 'M12 5v14M5 12h14' },
  { to: '/history', label: 'History', short: 'History', icon: 'M4 6h16M4 12h16M4 18h10' },
  { to: '/summary', label: 'Summary', short: 'Summary', icon: 'M5 20V10M12 20V4M19 20v-7' },
  {
    to: '/settings',
    label: 'Settings',
    short: 'Settings',
    icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4',
  },
];

export function Layout() {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  const active = (to: string) => pathname === to || (to === '/history' && pathname.startsWith('/clients'));

  return (
    <>
      <a className="skip-link" href="#main" onClick={(e) => (e.preventDefault(), mainRef.current?.focus())}>
        Skip to content
      </a>
      <header className="top">
        <div className="wrap">
          <div className="brand">
            <h1>Chair Log</h1>
            <span>De-identified injector book of business</span>
          </div>
          <nav className="tabs" aria-label="Pages">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                className={() => (active(t.to) ? 'active' : '')}
                aria-current={active(t.to) ? 'page' : undefined}
              >
                {t.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <div className="wrap">
        <main id="main" ref={mainRef} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <nav className="bottom-tabs" aria-label="Pages">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={() => (active(t.to) ? 'active' : '')}
            aria-current={active(t.to) ? 'page' : undefined}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d={t.icon} />
            </svg>
            {t.short}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
