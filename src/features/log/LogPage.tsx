import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { deleteVisit, removeSampleData, updateSettings } from '../../db/repo';
import { byDateDesc, dueForRebook } from '../../domain/clients';
import { todayISO } from '../../domain/dates';
import { ConfirmButton } from '../../components/ui';
import { isIOS, isStandalone } from '../../pwa/install';
import { BackupNowButton } from '../settings/backupActions';
import { VisitForm } from './VisitForm';
import { VisitTable } from './VisitTable';

const BACKUP_EVERY_DAYS = 14;

export function LogPage() {
  const { visits, catalogs, settings } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editing = params.get('edit');

  const recent = useMemo(() => [...visits].sort(byDateDesc).slice(0, 12), [visits]);
  const hasSample = visits.some((v) => v.isSample);
  const realCount = visits.filter((v) => !v.isSample).length;
  const due = useMemo(() => dueForRebook(visits, catalogs, todayISO()), [visits, catalogs]);

  const now = Date.now();
  const backupStale =
    !settings.lastBackupAt || now - Date.parse(settings.lastBackupAt) > BACKUP_EVERY_DAYS * 86_400_000;
  const snoozed =
    settings.backupReminderSnoozedUntil && Date.parse(settings.backupReminderSnoozedUntil) > now;
  const showBackup = realCount >= 10 && backupStale && !snoozed;
  const showIosHint = isIOS() && !isStandalone() && !settings.iosInstallHintDismissed;

  return (
    <>
      {hasSample && (
        <div className="banner" role="region" aria-label="Sample data">
          <span>
            <b>Sample data.</b> Made-up visits are loaded so you can explore. Remove them before you log real
            visits.
          </span>
          <span className="spacer">
            <ConfirmButton
              label="Remove sample data"
              confirmLabel="Tap again to remove"
              onConfirm={() => void removeSampleData().then((n) => toast.show(`Removed ${n} sample visits`))}
            />
          </span>
        </div>
      )}
      {showBackup && (
        <div className="banner" role="region" aria-label="Backup reminder">
          <span>
            <b>Back up your log.</b>{' '}
            {settings.lastBackupAt
              ? `Your last backup was more than ${BACKUP_EVERY_DAYS} days ago.`
              : "You haven't made a backup yet."}{' '}
            If this phone is lost or the browser clears its data, the log is gone.
          </span>
          <span className="spacer">
            <BackupNowButton small />
            <button
              type="button"
              className="btn small ghost"
              onClick={() =>
                void updateSettings({
                  backupReminderSnoozedUntil: new Date(now + 3 * 86_400_000).toISOString(),
                })
              }
            >
              Later
            </button>
          </span>
        </div>
      )}
      {showIosHint && (
        <div className="banner info" role="region" aria-label="Install">
          <span>
            <b>Install Aurelle:</b> tap Share, then Add to Home Screen. Installed apps keep their data; Safari
            can clear data for sites you don't install.
          </span>
          <span className="spacer">
            <button
              type="button"
              className="btn small ghost"
              onClick={() => void updateSettings({ iosInstallHintDismissed: true })}
            >
              Got it
            </button>
          </span>
        </div>
      )}

      <VisitForm editing={editing} onDone={() => navigate('/log', { replace: true })} />

      <section className="panel" aria-labelledby="recent-title">
        <div className="section-head">
          <h2 id="recent-title">Recent entries</h2>
          <span className="hint">
            {visits.length} visit{visits.length === 1 ? '' : 's'} in log, showing latest {recent.length} ·{' '}
            <Link to="/history">See all</Link>
            {due.length > 0 && (
              <>
                {' · '}
                <Link to="/clients">
                  {due.length} client{due.length === 1 ? '' : 's'} due for rebook
                </Link>
              </>
            )}
          </span>
        </div>
        <VisitTable
          caption="Recent entries"
          visits={recent}
          catalogs={catalogs}
          empty="No visits yet. Log the first one above."
          onEdit={(v) => navigate(`/log?edit=${v.uid}`)}
          onDelete={(v) => void deleteVisit(v.uid).then(() => toast.show('Entry deleted'))}
        />
      </section>
    </>
  );
}
