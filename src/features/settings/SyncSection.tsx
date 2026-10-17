import { useEffect, useState } from 'react';
import { useToast } from '../../app/toast';
import { fmtLongDate } from '../../domain/format';
import { syncConfigured } from '../../sync/config';
import { signOut, syncLabel, syncNow, useSyncStatus, type SignOutResult } from '../../sync/controller';
import { ConfirmButton } from '../../components/ui';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Sync status, the people who share this log, and signing out. Sign-in itself is the launch screen. */
export function SyncSection() {
  const s = useSyncStatus();
  const toast = useToast();
  const [members, setMembers] = useState<string[] | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState<Exclude<SignOutResult, { ok: true }> | null>(null);

  useEffect(() => {
    if (!s.bookId) return setMembers(null);
    let live = true;
    void import('../../sync/supabase')
      .then((m) => m.listMembers(s.bookId!))
      .then((list) => live && setMembers(list))
      .catch(() => live && setMembers(null));
    return () => {
      live = false;
    };
  }, [s.bookId]);

  if (!syncConfigured || !s.email) return null;

  const add = async () => {
    const e = email.trim().toLowerCase();
    if (!EMAIL.test(e)) return setError('Enter an email address, like name@gmail.com.');
    try {
      const m = await import('../../sync/supabase');
      await m.addMember(s.bookId!, e, s.email!);
      setMembers(await m.listMembers(s.bookId!));
      setEmail('');
      setError('');
      toast.show(`${e} can now sign in and share this log`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const remove = async (who: string) => {
    const m = await import('../../sync/supabase');
    await m.removeMember(s.bookId!, who);
    setMembers(await m.listMembers(s.bookId!));
    toast.show(`Removed ${who}`);
  };

  return (
    <section className="panel" aria-labelledby="sync-title" id="sync">
      <h2 id="sync-title">Sync across devices</h2>
      <>
        <div className="kv">
          <span className="muted">Signed in as</span>
          <span>{s.email}</span>
          <span className="muted">Status</span>
          <span role="status">
            {syncLabel(s) || '—'}
            {s.lastSyncedAt && s.phase !== 'syncing' && (
              <span className="hint">
                {' '}
                · last synced {fmtLongDate(s.lastSyncedAt.slice(0, 10))}{' '}
                {new Date(s.lastSyncedAt).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            )}
          </span>
        </div>
        {s.phase === 'error' && s.message && (
          <p className="error" role="alert">
            {s.message}. Your entries are safe on this device and will sync when this is fixed.
          </p>
        )}
        <div className="actions">
          <button
            type="button"
            className="btn"
            onClick={() => void syncNow()}
            disabled={s.phase === 'syncing'}
          >
            Sync now
          </button>
          <ConfirmButton
            label="Sign out"
            confirmLabel="Tap again to sign out"
            onConfirm={() => void signOut().then((r) => (r.ok ? setBlocked(null) : setBlocked(r)))}
          />
        </div>
        <p className="hint">
          Signing out sends any last changes, then removes the log from this device. It stays safe in your
          shared log and comes back when you sign in again.
        </p>
        {blocked && (
          <div className="callout warn" role="alert" style={{ display: 'grid', gap: 8 }}>
            <p>
              {blocked.pending} change{blocked.pending === 1 ? ' hasn’t' : 's haven’t'} reached your shared
              log yet{blocked.offline ? ' because this device is offline' : ''}. Connect and tap Sync now,
              then sign out, so nothing is lost.
            </p>
            <div className="actions">
              <ConfirmButton
                label={`Sign out and discard ${blocked.pending} change${blocked.pending === 1 ? '' : 's'}`}
                confirmLabel="Tap again to discard and sign out"
                onConfirm={() => void signOut(true)}
              />
            </div>
          </div>
        )}

        <h3 style={{ marginTop: 8 }}>People with access</h3>
        {members == null ? (
          <p className="hint">{s.phase === 'offline' ? 'Go online to see who has access.' : 'Loading…'}</p>
        ) : (
          <ul className="members">
            {members.map((m) => (
              <li key={m}>
                <span>{m}</span>
                {m === s.email ? (
                  <span className="hint">You</span>
                ) : (
                  <ConfirmButton
                    label="Remove"
                    confirmLabel="Tap again to remove"
                    ariaLabel={`Remove ${m}`}
                    onConfirm={() => void remove(m)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        <form
          className="member-add"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <div className="field">
            <label htmlFor="member-email">Add someone by their Google email</label>
            <input
              id="member-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button type="submit" className="btn" disabled={!s.bookId}>
            Add
          </button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="hint">
          Everyone listed can see, add, change and delete everything in this log. They sign in with Google
          using the email you add.
        </p>
      </>
    </section>
  );
}
