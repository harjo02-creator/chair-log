import { useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { updateSettings } from '../../db/repo';
import { hashPin, PIN_RE, verifyPin } from '../../domain/pin';
import { lockNow } from '../lock/LockScreen';

/** SUG-1: PIN-only app lock. */
export function LockSection() {
  const { settings } = useData();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const has = settings.pin != null;
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);

  const checkCurrent = async () => {
    if (has && !(await verifyPin(current, settings.pin!))) {
      setError('Current PIN is wrong.');
      return false;
    }
    return true;
  };
  const clear = () => {
    setCurrent('');
    setPin('');
    setConfirm('');
    setError('');
  };

  return (
    <section className="panel" aria-labelledby="lock-title">
      <h2 id="lock-title">App lock</h2>
      <p className="small">
        {has
          ? `Aurelle asks for your PIN when it opens and after ${settings.autoLockMinutes} minutes in the background.`
          : 'Set a 4–6 digit PIN so the log is hidden if your phone is handed around.'}{' '}
        The PIN can't be recovered. If you forget it, the only way back in is to erase the data on this device
        and restore a backup.
      </p>
      <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          if (!PIN_RE.test(pin)) return setError('PIN must be 4–6 digits.');
          if (pin !== confirm) return setError("The two PINs don't match.");
          if (!(await checkCurrent())) return;
          await updateSettings({ pin: await hashPin(pin) });
          toast.show(has ? 'PIN changed' : 'App lock is on');
          clear();
        }}
      >
        {has && (
          <div className="field">
            <label htmlFor="pin-cur">Current PIN</label>
            <input
              id="pin-cur"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={current}
              onChange={(e) => setCurrent(digits(e.target.value))}
            />
          </div>
        )}
        <div className="field">
          <label htmlFor="pin-new">{has ? 'New PIN' : 'PIN'}</label>
          <input
            id="pin-new"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={pin}
            onChange={(e) => setPin(digits(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="pin-confirm">Repeat PIN</label>
          <input
            id="pin-confirm"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(digits(e.target.value))}
          />
        </div>
        <div className="field" style={{ alignSelf: 'end' }}>
          <button type="submit" className="btn primary">
            {has ? 'Change PIN' : 'Turn on app lock'}
          </button>
        </div>
      </form>
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
      {has && (
        <div className="actions">
          <div className="field">
            <label htmlFor="autolock">Lock after time in background</label>
            <select
              id="autolock"
              value={settings.autoLockMinutes}
              onChange={(e) => void updateSettings({ autoLockMinutes: Number(e.target.value) })}
            >
              {[1, 5, 15, 30].map((m) => (
                <option key={m} value={m}>
                  {m} minute{m === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn" onClick={lockNow}>
            Lock now
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={async () => {
              if (!(await checkCurrent())) return;
              await updateSettings({ pin: null });
              toast.show('App lock is off');
              clear();
            }}
          >
            Turn off (needs current PIN)
          </button>
        </div>
      )}
    </section>
  );
}
