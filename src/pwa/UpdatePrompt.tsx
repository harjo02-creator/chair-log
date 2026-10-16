import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useToast } from '../app/toast';

/** PWA-3: a new version waits until she taps Reload. Never reloads mid-entry on its own. */
export function UpdatePrompt() {
  const toast = useToast();
  const shown = useRef(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Check for a new build every hour while the app stays open.
      if (reg) setInterval(() => reg.update().catch(() => undefined), 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    if (!needRefresh || shown.current) return;
    shown.current = true;
    toast.show('A new version is ready.', {
      persistent: true,
      action: { label: 'Reload', onClick: () => void updateServiceWorker(true) },
    });
  }, [needRefresh, toast, updateServiceWorker]);

  return null;
}
