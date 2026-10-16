import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Chip } from '../domain/metrics';

/** A real radio group styled as pills (LOG-2, NFR-3). */
export function Segmented<T extends string>(props: {
  legend: ReactNode;
  name: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <fieldset className={`field ${props.className ?? ''}`}>
      <legend>{props.legend}</legend>
      <div className="seg">
        {props.options.map((o) => (
          <span key={o.value}>
            <input
              type="radio"
              id={`${id}-${o.value}`}
              name={`${props.name}-${id}`}
              value={o.value}
              checked={props.value === o.value}
              onChange={() => props.onChange(o.value)}
            />
            <label htmlFor={`${id}-${o.value}`}>{o.label}</label>
          </span>
        ))}
      </div>
    </fieldset>
  );
}

/** Status chip: always icon + text, never color alone. */
export function ChipView({ chip }: { chip: Chip | null }) {
  if (!chip) return null;
  return (
    <span className={`chip ${chip.tone === 'neutral' ? '' : chip.tone}`}>
      <span aria-hidden="true">{chip.icon}</span>
      {chip.text}
    </span>
  );
}

/** Inline two-step confirm: first tap arms it for 3 s (LOG-12). No browser confirm() dialogs. */
export function ConfirmButton(props: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  className?: string;
  ariaLabel?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className={`btn small danger ${armed ? 'armed' : ''} ${props.className ?? ''}`}
      aria-label={armed ? undefined : props.ariaLabel}
      onClick={() => {
        if (armed) {
          clearTimeout(timer.current);
          setArmed(false);
          props.onConfirm();
        } else {
          setArmed(true);
          timer.current = setTimeout(() => setArmed(false), 3000);
        }
      }}
    >
      {armed ? (props.confirmLabel ?? 'Confirm') : props.label}
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
