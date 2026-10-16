import { useState } from 'react';
import { useToast } from '../../app/toast';
import { exportBackup, markBackedUp } from '../../db/repo';
import { backupFilename } from '../../domain/backup';
import { todayISO } from '../../domain/dates';
import { shareOrDownload } from '../../pwa/files';

/** DATA-2 + DATA-6: JSON backup through the share sheet on phones, a download elsewhere. */
export function BackupNowButton({ small, primary }: { small?: boolean; primary?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={`btn ${small ? 'small' : ''} ${primary ? 'primary' : ''}`}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const b = await exportBackup();
          const r = await shareOrDownload(
            backupFilename(todayISO()),
            JSON.stringify(b, null, 1),
            'application/json',
          );
          if (r !== 'cancelled') {
            await markBackedUp();
            toast.show(`Backup of ${b.visits.length} visits ${r === 'shared' ? 'shared' : 'downloaded'}`);
          }
        } finally {
          setBusy(false);
        }
      }}
    >
      Back up now
    </button>
  );
}
