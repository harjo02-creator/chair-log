import { useEffect, useRef, useState } from 'react';
import { useData } from '../../app/data';
import { eraseAllData } from '../../db/repo';
import { verifyPin } from '../../domain/pin';
import { ConfirmButton } from '../../components/ui';
import { Monogram } from '../../components/Monogram';

export const LOCK_EVENT = 'chairlog:lock';
export const lockNow = () => window.dispatchEvent(new Event(LOCK_EVENT));

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { settings } = useData();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fails, setFails] = useState(0);
  const [forgot, setForgot] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const submit = async (value: string) => {
    if (!settings.pin || busy) return;
    setBusy(true);
    const ok = await verifyPin(value, settings.pin);
    setBusy(false);
    if (ok) return onUnlock();
    const n = fails + 1;
    setFails(n);
    setPin('');
    setError('Wrong PIN. Try again.');
    // Slow down guessing after a few misses.
    if (n >= 5) {
      setBusy(true);
      setTimeout(() => setBusy(false), Math.min(30, 2 ** (n - 4)) * 1000);
    }
  };

  return (
    <div className="center-screen">
      <form
        className="center-card panel"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(pin);
        }}
      >
        <Monogram size={56} />
        <div className="eyebrow">Locked</div>
        <h1 className="wordmark">Aurelle</h1>
        <label htmlFor="pin">Enter your PIN</label>
        <input
          ref={input}
          id="pin"
          className="pin-input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="\d*"
          maxLength={6}
          value={pin}
          aria-invalid={error ? true : undefined}
          aria-describedby="pin-error"
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '');
            setPin(v);
            setError('');
          }}
        />
        <span id="pin-error" className="error" role="alert">
          {error}
        </span>
        <button className="btn primary" type="submit" disabled={busy || pin.length < 4}>
          Unlock
        </button>
        {!forgot ? (
          <button type="button" className="btn ghost small" onClick={() => setForgot(true)}>
            Forgot PIN?
          </button>
        ) : (
          <div className="callout warn">
            <p>
              The PIN can't be recovered. The only way in is to erase everything on this device, then restore
              your last backup from Settings.
            </p>
            <ConfirmButton
              label="Erase all data"
              confirmLabel="Tap again to erase"
              onConfirm={() => void eraseAllData()}
            />
          </div>
        )}
      </form>
    </div>
  );
}
