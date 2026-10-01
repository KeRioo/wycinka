import { expect, test } from '@playwright/test';

test.describe('MapPage', () => {
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

  test('should render header and navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /Wycinka Drzew/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Mapa/i })).toBeVisible();
  });

  test('should navigate to /map and show map container', async ({ page }) => {
    await page.goto('/map');
    await expect(page).toHaveURL(/\/map$/);
    await expect(page.getByTestId('map-container')).toBeVisible({ timeout: 15_000 });
  });

  test('should show hero CTA on home page', async ({ page }) => {
    await page.goto('/');
    const cta = page.getByRole('link', { name: /Otwórz mapę/i });
    await expect(cta).toBeVisible();
  });

  test('should show 404 for unknown routes', async ({ page }) => {
    const response = await page.goto('/this-does-not-exist');
    expect(response?.status()).toBe(200);
    await expect(page.getByText(/404/i)).toBeVisible();
  });
});
