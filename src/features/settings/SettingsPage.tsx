import { useEffect, useState } from 'react';
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

  return (
    <div className="settings">
      <h2 style={{ fontSize: 30 }}>Settings</h2>

      <section className="panel" aria-labelledby="install-title">
        <h2 id="install-title">Install &amp; storage</h2>
        {isStandalone() ? (
          <p className="small">✓ Installed. Chair Log runs from your home screen and works offline.</p>
        ) : canInstall ? (
          <div className="actions">
            <button type="button" className="btn primary" onClick={() => void promptInstall()}>
              Install app
            </button>
            <span className="hint">
              Adds Chair Log to your home screen or desktop. It works fully offline.
            </span>
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
          after about a week without a visit. Install the app and keep regular backups. Your log exists only
          on this device.
        </p>
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
          Chair Log is a personal record, not a medical record. Check your employment agreement before keeping
          a personal client log. It has no server, no analytics and no tracking: your visits never leave this
          device unless you export or share them.
        </p>
      </section>

      <section className="panel" aria-labelledby="danger-title">
        <h2 id="danger-title">Erase everything</h2>
        <p className="small">
          Deletes every visit, price change and setting on this device. Make a backup first.
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
        Chair Log {__APP_VERSION__} · data format v{SCHEMA_VERSION}
      </p>
    </div>
  );
}
