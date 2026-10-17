import { useEffect, useState } from 'react';
import { signIn } from '../../sync/controller';
import { Monogram } from '../../components/Monogram';

/** First screen on a device that hasn't signed in. One sign-in per device; it stays signed in after. */
export function SignInScreen() {
  const [online, setOnline] = useState(navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return (
    <div className="center-screen">
      <main className="signin">
        <Monogram />
        <h1 className="wordmark">Aurelle</h1>
        <p className="tagline">Book of business</p>
        <p className="signin-lede">
          Your appointments, clients and production in one private log, on your phone and your laptop.
        </p>
        <button
          type="button"
          className="btn primary signin-btn"
          disabled={!online || busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await signIn(); // leaves for Google and comes back signed in
            } catch (e) {
              setBusy(false);
              setError(`Couldn’t reach Google sign-in. ${e instanceof Error ? e.message : ''}`.trim());
            }
          }}
        >
          <GoogleG />
          {busy ? 'Opening Google…' : 'Continue with Google'}
        </button>
        {!online && (
          <p className="hint" role="status">
            You’re offline. Connect to the internet once to sign in; after that Aurelle works offline too.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="signin-note">
          You stay signed in on this device. Clients are recorded by ID only, never by name, and only the
          people you invite can see your log.
        </p>
      </main>
    </div>
  );
}

/** Google's "G", drawn in its brand colours as their sign-in guidelines ask. */
function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true" className="google-g">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
