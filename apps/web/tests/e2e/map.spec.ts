import { expect, test } from '@playwright/test';
import { openProjectViaLauncher } from './helpers';

test.describe('MapPage na /app', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/version', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          api: '1.0.0',
          data: '2026-09-29',
          egib_source: 'geoportal.gov.pl',
          etag: 'test-etag',
        }),
      });
    });
  });

  test('should navigate to /app via launcher and show map container', async ({ page }) => {
    await openProjectViaLauncher(page);
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByTestId('map-container')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('app-header')).toBeVisible();
  });

  test('should redirect bare /app to start when no project exists', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await expect(page.getByTestId('start-new-project')).toBeVisible();
  });

  test('should show 404 for unknown routes', async ({ page }) => {
    const response = await page.goto('/this-does-not-exist');
    expect(response?.status()).toBe(200);
    await expect(page.getByText(/404/i)).toBeVisible();
  });
});
