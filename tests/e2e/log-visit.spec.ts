import { expect, test } from '@playwright/test';
import { gotoTab, logVisit, startEmpty } from './helpers';

// Sample data and default months depend on "today", so pin it.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-15T12:00:00'));
});

test('log, auto-fill, edit and delete a visit', async ({ page }) => {
  await startEmpty(page);

  // Acceptance 4: privacy validation.
  const id = page.locator('#f-id');
  await id.fill('JOHN-01');
  await expect(
    page.getByText('That looks like a name or number. Use initials + client number only, like CH-01.'),
  ).toBeVisible();
  await id.fill('5551234');
  await expect(page.getByText('That looks like a name or number.', { exact: false })).toBeVisible();
  await id.fill('jd01');
  await id.blur();
  await expect(id).toHaveValue('JD01');
  await expect(page.getByText('Format: 2–3 initials, a dash, then a client number (CH-01).')).toBeVisible();
  await id.fill('ABC-123');
  await expect(page.getByText('New to this log.', { exact: false })).toBeVisible();

  // First CH-01 visit, as a referral.
  await page.locator('#f-date').fill('2026-07-08');
  await id.fill('ch-01');
  await page.getByText('Referral (word of mouth)').click();
  await page.getByRole('button', { name: 'Save visit' }).click();
  await expect(page.getByText('Saved CH-01 · $468')).toBeVisible();

  // Acceptance 2: returning client.
  await page.locator('#f-date').fill('2026-10-14');
  await id.fill('CH-01');
  await expect(page.getByText('Returning client. Last seen Jul 8 for Upper Face Tox.')).toBeVisible();
  await expect(page.locator('#f-interval')).toHaveValue('98');
  await expect(page.getByRole('radio', { name: 'Repeat' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Referral (word of mouth)' })).toBeChecked();

  // Acceptance 3: ticket math.
  const total = page.locator('.tk-total b');
  await expect(total).toHaveText('$468');
  await page.getByRole('button', { name: '+ Add product' }).click();
  await expect(page.getByLabel('Product 2', { exact: true })).toHaveValue('restylane-kysse');
  await expect(total).toHaveText('$1,218');
  await page.locator('#f-retail').selectOption({ label: 'Growth Factor Serum ($180)' });
  await expect(total).toHaveText('$1,218');
  await page.getByRole('button', { name: 'Save visit' }).click();
  await expect(page.getByText('Saved CH-01 · $1,218')).toBeVisible();

  // LOG-16 duplicate warning.
  await logVisit(page, '2026-10-14', 'CH-01');
  await expect(page.getByText('CH-01 already has a visit on Oct 14. Save anyway?')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Clear form' }).click();

  // Edit the October visit: drop retail, rebook No.
  const recent = page.getByRole('region', { name: 'Recent entries', exact: true });
  await expect(recent.getByRole('row')).toHaveCount(3);
  await recent.getByRole('button', { name: 'Edit CH-01 on 2026-10-14' }).click();
  await expect(page.getByRole('heading', { name: 'Edit visit' })).toBeVisible();
  await page.locator('.seg label', { hasText: /^No$/ }).click();
  await expect(page.getByRole('radio', { name: 'No', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Updated CH-01 · $1,218')).toBeVisible();
  await expect(recent.getByText('✕ No')).toBeVisible();

  // Delete with the inline two-step confirm.
  await recent.getByRole('button', { name: 'Delete CH-01 on 2026-07-08' }).click();
  await recent.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Entry deleted')).toBeVisible();
  await expect(recent.getByRole('row')).toHaveCount(2);

  // History and summary see the visit.
  await gotoTab(page, 'History');
  await expect(page.getByText('1 visit · $1,218 service gross')).toBeVisible();
  await gotoTab(page, 'Summary');
  await expect(page.getByRole('heading', { name: 'October 2026' })).toBeVisible();
  await expect(page.locator('.pitch')).toContainText(
    'In October I completed 1 appointment for 1 unique client, producing $1,398',
  );
});

test('sample data, summary charts and CSV export', async ({ page }) => {
  // Keep a copy of the last Blob handed to a download link so the test can read the CSV.
  await page.addInitScript(() => {
    const orig = URL.createObjectURL;
    URL.createObjectURL = (b: Blob | MediaSource) => {
      (window as unknown as { __lastBlob: unknown }).__lastBlob = b;
      return orig(b);
    };
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Explore with sample data' }).click();
  await expect(page.getByText('Sample data.', { exact: false })).toBeVisible();
  await gotoTab(page, 'Summary');
  await expect(page.getByRole('heading', { name: 'September 2026' })).toBeVisible();
  await expect(page.locator('.kpi')).toHaveCount(8);
  await expect(page.locator('canvas')).toHaveCount(7);

  // View as table toggle.
  await page.getByRole('button', { name: 'View as table' }).first().click();
  await expect(page.getByRole('cell', { name: 'Sep 1–6' })).toBeVisible();

  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download CSV' }).click(),
  ]);
  expect(dl.suggestedFilename()).toBe('chair-log-2026-09.csv');
  const bytes = await page.evaluate(async () =>
    Array.from(new Uint8Array(await (window as unknown as { __lastBlob: Blob }).__lastBlob.arrayBuffer())),
  );
  // UTF-8 byte-order mark so Excel opens "Juvéderm" correctly.
  expect(bytes.slice(0, 3)).toEqual([0xef, 0xbb, 0xbf]);
  const text = Buffer.from(bytes.slice(3)).toString('utf8');
  expect(text.split('\r\n')[0]).toBe(
    'Date,Client ID,Visit Type,Source,Primary Treatment Area,Product & Quantity,Retail Add-on,Retail $,Est. Ticket Gross,Rebooked,Treatment Interval (Days)',
  );

  await page.getByRole('link', { name: 'Book of Business one-pager' }).click();
  await expect(page.getByRole('button', { name: 'Print / Save as PDF' })).toBeVisible();
});
