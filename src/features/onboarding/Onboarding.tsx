import { useState } from 'react';
import { loadSampleData, updateSettings } from '../../db/repo';
import { PrivacyRules } from '../log/PrivacyRules';
import { Monogram } from '../../components/Monogram';
import { syncConfigured } from '../../sync/config';

/** PRIV-7: one-time note that this is a personal record, not a medical record. */
export function Onboarding() {
  const [busy, setBusy] = useState(false);
  const start = async (withSample: boolean) => {
    setBusy(true);
    if (withSample) await loadSampleData();
    await updateSettings({ onboardingDone: true });
  };
  return (
    <div className="center-screen">
      <div className="center-card panel">
        <Monogram size={56} />
        <div className="eyebrow">Welcome to</div>
        <h1 className="wordmark">Aurelle</h1>
        <p>
          A private log of your own book of business: production, average ticket, retention, rebook rate and
          how much of your chair you fill yourself.
        </p>
        <div className="callout warn">
          <p>
            <b>This is a personal record, not a medical record.</b> Keep charting in the clinic's system.
            Before you keep a personal client log, check your employment agreement for rules about client
            information. Aurelle does not give legal advice.
          </p>
        </div>
        <PrivacyRules />
        <p className="small muted">
          {syncConfigured
            ? 'Your log syncs to your private account, so it’s on every device you sign in on. Only people you invite can see it.'
            : 'Everything stays on this device. Nothing is sent anywhere unless you export it yourself.'}
        </p>
        <div className="actions">
          <button type="button" className="btn primary" disabled={busy} onClick={() => start(false)}>
            Start with an empty log
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => start(true)}>
            Explore with sample data
          </button>
        </div>
        <p className="small muted">
          Sample visits are made up and clearly flagged. Remove them before you log real visits. To restore a
          backup, start with an empty log and open Settings.
        </p>
      </div>
    </div>
  );
}
