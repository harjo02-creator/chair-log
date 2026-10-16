import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
  /** Stays until its action is used (e.g. "A new version is ready"). */
  persistent?: boolean;
}

interface ToastApi {
  show: (
    message: string,
    opts?: { action?: ToastItem['action']; persistent?: boolean; ms?: number },
  ) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const show = useCallback<ToastApi['show']>(
    (message, opts = {}) => {
      const id = ++nextId.current;
      setItems((xs) => [
        ...xs.filter((x) => x.persistent),
        { id, message, action: opts.action, persistent: opts.persistent },
      ]);
      if (!opts.persistent) setTimeout(() => dismiss(id), opts.ms ?? 2600);
      return id;
    },
    [dismiss],
  );
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {items.map((t) => (
          <div className="toast" key={t.id}>
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(ToastContext);
  if (!v) throw new Error('useToast outside ToastProvider');
  return v;
}
