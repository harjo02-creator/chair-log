import { useEffect, useState } from 'react';
import type { Theme } from '../domain/types';

export function applyTheme(theme: Theme) {
  const el = document.documentElement;
  if (theme === 'system') delete el.dataset.theme;
  else el.dataset.theme = theme;
}

/** Changes whenever the effective theme changes, so charts can re-read CSS tokens. */
export function useThemeKey(theme: Theme): string {
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return theme === 'system' ? (dark ? 'dark' : 'light') : theme;
}

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function prefersReducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
