import { expect, type Page } from '@playwright/test';

export async function startEmpty(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Start with an empty log' }).click();
  await expect(page.getByRole('heading', { name: 'Log a visit' })).toBeVisible();
}

export async function logVisit(page: Page, date: string, clientId: string) {
  await page.locator('#f-date').fill(date);
  await page.locator('#f-id').fill(clientId);
  await page.getByRole('button', { name: 'Save visit' }).click();
}

export async function gotoTab(page: Page, name: 'Log' | 'History' | 'Insights' | 'Value' | 'Settings') {
  const full = {
    Log: 'Log a visit',
    History: 'History',
    Insights: 'Insights',
    Value: 'Employer value',
    Settings: 'Settings',
  }[name];
  const nav = page.getByRole('navigation', { name: 'Pages' });
  // Header tabs on desktop, bottom tabs on phones; only one set is visible.
  await nav
    .getByRole('link', { name: new RegExp(`^(${full}|${name})$`) })
    .filter({ visible: true })
    .first()
    .click();
}
