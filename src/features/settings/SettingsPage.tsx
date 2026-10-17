import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { eraseAllData, loadSampleData, removeSampleData, updateSettings } from '../../db/repo';
import { SCHEMA_VERSION } from '../../db/db';
import { isIOS, isStandalone, promptInstall, useCanInstall } from '../../pwa/install';
import { isPersisted, requestPersist } from '../../pwa/storage';
import { ConfirmButton, Segmented } from '../../components/ui';
import type { Theme } from '../../domain/types';
import { PrivacyRules } from '../log/PrivacyRules';
import { CatalogEditor } from './CatalogEditor';
import { DataSection } from './DataSection';
import { GoalsSection } from './GoalsSection';
import { SyncSection } from './SyncSection';
import { useSyncStatus } from '../../sync/controller';
import { LockSection } from './LockSection';

export function SettingsPage() {
  const { visits, settings } = useData();
  const toast = useToast();
  const canInstall = useCanInstall();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    void isPersisted().then(setPersisted);
  }, [visits.length]);
  const sampleCount = visits.filter((v) => v.isSample).length;
  const { hash } = useLocation();
  const sync = useSyncStatus();
  const shared = sync.email != null;
  // Links like /settings#goals land on that section.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  return (
    <div className="settings">
      <h2 style={{ fontSize: 30 }}>Settings</h2>

      <section className="panel" aria-labelledby="install-title">
        <h2 id="install-title">Install &amp; storage</h2>
        {isStandalone() ? (
          <p className="small">✓ Installed. Aurelle runs from your home screen and works offline.</p>
        ) : canInstall ? (
          <div className="actions">
            <button type="button" className="btn primary" onClick={() => void promptInstall()}>
              Install app
            </button>
            <span className="hint">Adds Aurelle to your home screen or desktop. It works fully offline.</span>
          </div>
        ) : isIOS() ? (
          <p className="small">
            <b>To install on iPhone or iPad:</b> open this page in Safari, tap Share, then Add to Home Screen.
          </p>
        ) : (
          <p className="small">
            To install, use your browser's "Install app" or "Add to Home Screen" menu item.
          </p>
        )}
        <div className="kv">
          <span className="muted">Storage</span>
          <span>
            {persisted == null
              ? 'Unknown in this browser'
              : persisted
                ? '✓ Storage: persistent'
                : '▲ Storage: may be cleared by the browser'}
            {persisted === false && (
              <>
                {' '}
                <button
                  type="button"
                  className="btn link"
                  onClick={() => void requestPersist().then(setPersisted)}
                >
                  Ask again
                </button>
              </>
            )}
          </span>
          <span className="muted">Visits on this device</span>
          <span className="mono">{visits.length}</span>
        </div>
        <p className="hint">
          On iPhone and iPad, Safari can delete data for websites you haven't added to the Home Screen, often
          after about a week without a visit. Install the app and keep regular backups.
          {shared
            ? ' This device syncs with your shared log, so a cleared device gets everything back after you sign in.'
            : ' Your log exists only on this device unless you sign in to sync.'}
        </p>
      </section>

      <SyncSection />

      <GoalsSection />

      <section className="panel" aria-labelledby="months-title">
        <h2 id="months-title">Monthly totals</h2>
        <p className="small">
          Numbers you track by the month: estimates for months you didn’t log visit by visit, days out of
          office and model appointments. Enter them one month at a time or upload a spreadsheet.
        </p>
        <div className="actions">
          <Link className="btn" to="/months">
            Open monthly totals
          </Link>
        </div>
      </section>

      <LockSection />
      <DataSection />

      <section className="panel" aria-labelledby="pref-title">
        <h2 id="pref-title">Appearance &amp; summary</h2>
        <Segmented<Theme>
          legend="Theme"
          name="theme"
          value={settings.theme}
          options={[
            { value: 'system', label: 'Match device' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          onChange={(theme) => void updateSettings({ theme })}
        />
        <div className="field" style={{ maxWidth: 280 }}>
          <label htmlFor="rolling">Rolling retention window</label>
          <select
            id="rolling"
            value={settings.rollingRetentionMonths}
            onChange={(e) => void updateSettings({ rollingRetentionMonths: Number(e.target.value) })}
          >
            {[3, 6, 12].map((m) => (
              <option key={m} value={m}>
                {m} months
              </option>
            ))}
          </select>
        </div>
      </section>

      <CatalogEditor />

      <section className="panel" aria-labelledby="sample-title">
        <h2 id="sample-title">Sample data</h2>
        <p className="small">
          {sampleCount
            ? `${sampleCount} made-up sample visits are loaded. They're flagged and can be removed without touching your own visits.`
            : 'Load about 120 made-up visits across last month and this month to explore the summary.'}
        </p>
        <div className="actions">
          {sampleCount ? (
            <ConfirmButton
              label="Remove sample data"
              confirmLabel="Tap again to remove"
              onConfirm={() => void removeSampleData().then((n) => toast.show(`Removed ${n} sample visits`))}
            />
          ) : (
            <button
              type="button"
              className="btn"
              onClick={() => void loadSampleData().then((n) => toast.show(`Loaded ${n} sample visits`))}
            >
              Load sample data
            </button>
          )}
        </div>
      </section>

      <section className="panel" aria-labelledby="privacy-title">
        <h2 id="privacy-title">Privacy</h2>
        <PrivacyRules />
        <p className="small">
          Aurelle is a personal record, not a medical record. Check your employment agreement before keeping a
          personal client log. It has no analytics and no tracking.{' '}
          {shared
            ? 'Because you signed in, your de-identified visits, monthly totals, goals and price lists sync to this app’s private database, where only the people you added can read them.'
            : 'Your visits never leave this device unless you sign in to sync, export or share them.'}
        </p>
      </section>

      <section className="panel" aria-labelledby="danger-title">
        <h2 id="danger-title">{shared ? 'Erase this device' : 'Erase everything'}</h2>
        <p className="small">
          {shared
            ? 'Deletes this device’s copy of the log and its settings. The shared log keeps everything, and this device downloads it again while you stay signed in. To delete entries for everyone, delete them one by one.'
            : 'Deletes every visit, price change and setting on this device. Make a backup first.'}
        </p>
        <div className="actions">
          <ConfirmButton
            label="Erase all data"
            confirmLabel="Tap again to erase"
            onConfirm={() => void eraseAllData()}
          />
        </div>
      </section>

      <p className="hint">
        Aurelle {__APP_VERSION__} · data format v{SCHEMA_VERSION}
      </p>
    </div>
  );
}
