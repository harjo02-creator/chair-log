import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// NFR-3: WCAG 2.2 AA checks on every screen with real-looking data, in both themes.
for (const scheme of ['light', 'dark'] as const) {
  test(`no WCAG A/AA violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Chair Log' })).toBeVisible();
    const check = async (where: string) => {
      const r = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        r.violations.map((v) => `${where}: ${v.id} – ${v.nodes.length} × ${v.nodes[0]?.target.join(' ')}`),
      ).toEqual([]);
    };
    await check('onboarding');
    await page.getByRole('button', { name: 'Explore with sample data' }).click();
    await expect(page.getByText('Sample data.', { exact: false })).toBeVisible();
    for (const route of ['log', 'history', 'summary', 'clients', 'settings', 'report']) {
      await page.goto(`./#/${route}`);
      await page.waitForTimeout(600);
      await check(route);
    }
    await page.goto('./#/log');
    await page.locator('#f-id').fill('JOHN-01');
    await check('log with error');
  });
}
