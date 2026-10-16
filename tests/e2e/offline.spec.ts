import { expect, test } from '@playwright/test';
import { gotoTab, logVisit, startEmpty } from './helpers';

// Acceptance 1: after the first load, everything works with the network off.
test('works fully offline after first load', async ({ page, context }) => {
  await startEmpty(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Make sure the service worker controls the page before going offline.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Log a visit' })).toBeVisible();

  await logVisit(page, '2026-10-01', 'OF-01');
  await expect(page.getByText('Saved OF-01 · $468')).toBeVisible();

  const recent = page.getByRole('region', { name: 'Recent entries', exact: true });
  await recent.getByRole('button', { name: 'Edit OF-01 on 2026-10-01' }).click();
  await page.locator('#f-interval').fill('95');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Updated OF-01 · $468')).toBeVisible();

  await logVisit(page, '2026-10-02', 'OF-02');
  await expect(page.getByText('Saved OF-02 · $468')).toBeVisible();
  await recent.getByRole('button', { name: 'Delete OF-02 on 2026-10-02' }).click();
  await recent.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Entry deleted')).toBeVisible();

  // Summary and Settings are lazy-loaded chunks: they must come from the precache.
  await gotoTab(page, 'Summary');
  await expect(page.getByRole('radio', { name: 'Month', exact: true })).toBeChecked();
  await page.locator('#f-month').selectOption('2026-10');
  await expect(page.getByRole('heading', { name: 'October 2026' })).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();

  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download CSV' }).click(),
  ]);
  expect(dl.suggestedFilename()).toBe('chair-log-2026-10.csv');

  await gotoTab(page, 'Settings');
  await expect(page.getByRole('heading', { name: 'Backup & restore' })).toBeVisible();
});
