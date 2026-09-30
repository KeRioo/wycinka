import { expect, test } from '@playwright/test';

test('home → map navigation flow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Wycinka Drzew');

  await page.getByRole('link', { name: /Otwórz mapę/i }).click();
  await expect(page).toHaveURL(/\/map$/);

  await expect(page.getByTestId('map-container')).toBeVisible({ timeout: 15_000 });
});
