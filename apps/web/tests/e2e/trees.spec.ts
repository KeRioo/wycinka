import { expect, test } from '@playwright/test';

async function ensureProjectAndFab(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.getByTestId('map-container')).toBeVisible({ timeout: 15_000 });
  // Wait for projects to load (avoid race with initial Dexie load)
  await page.waitForTimeout(500);
  for (let attempt = 0; attempt < 5; attempt++) {
    const createBtn = page.getByTestId('create-first-project');
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click({ force: true });
      await expect(page.getByText(/Brak projektu/)).not.toBeVisible({ timeout: 5_000 });
    }
    if (await page.getByTestId('fab-add-tree').isVisible().catch(() => false)) {
      break;
    }
    await page.waitForTimeout(500);
  }
  await expect(page.getByTestId('fab-add-tree')).toBeVisible({ timeout: 10_000 });
}

test.describe('FAB + tree capture flow', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      const mockPosition = {
        coords: {
          latitude: 52.2297,
          longitude: 21.0122,
          accuracy: 8,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      };
      navigator.geolocation.getCurrentPosition = (success: PositionCallback) => {
        setTimeout(() => {
          success(mockPosition as GeolocationPosition);
        }, 50);
      };
      navigator.geolocation.watchPosition = (success: PositionCallback) => {
        setTimeout(() => {
          success(mockPosition as GeolocationPosition);
        }, 50);
        return 1;
      };
      navigator.geolocation.clearWatch = () => {
        return undefined;
      };
    });

    await context.route('**/api/v1/version', async (route) => {
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

    await context.route('**/api/v1/pmtiles/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });
  });

  test('should open map, FAB, then capture tree with arrow nudges', async ({ page }) => {
    await page.goto('/map');
    await ensureProjectAndFab(page);

    await page.getByTestId('fab-add-tree').click();
    await expect(page.getByTestId('add-tree-panel')).toBeVisible();

    const nudgeStatus = page.getByTestId('nudge-status');
    await expect(nudgeStatus).toContainText(/Przesunięcie:/);

    await page.getByTestId('nudge-right').click();
    await page.getByTestId('nudge-right').click();
    await expect(nudgeStatus).toContainText(/\+0\.50/);

    await page.getByTestId('tree-species').selectOption('Dąb');
    await page.getByTestId('tree-circumference').fill('85');

    const saveBtn = page.getByTestId('panel-save');
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    await expect(page.getByTestId('add-tree-panel')).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('fab-add-tree')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('map-container')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('fab-add-tree')).toBeVisible({ timeout: 10_000 });
  });

  test('should cancel tree capture without writing', async ({ page }) => {
    await page.goto('/map');
    await ensureProjectAndFab(page);

    await page.getByTestId('fab-add-tree').click();
    await expect(page.getByTestId('add-tree-panel')).toBeVisible();

    await page.getByTestId('tree-species').selectOption('Buk');
    await page.getByTestId('tree-circumference').fill('60');
    await page.getByTestId('panel-cancel').click();

    await expect(page.getByTestId('add-tree-panel')).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('fab-add-tree')).toBeVisible();
  });

  test('should disable save button when form is invalid', async ({ page }) => {
    await page.goto('/map');
    await ensureProjectAndFab(page);

    await page.getByTestId('fab-add-tree').click();
    await expect(page.getByTestId('add-tree-panel')).toBeVisible();

    await expect(page.getByTestId('panel-save')).toBeDisabled();

    await page.getByTestId('tree-species').selectOption('Dąb');
    await expect(page.getByTestId('panel-save')).toBeDisabled();

    await page.getByTestId('tree-circumference').fill('50');
    await expect(page.getByTestId('panel-save')).toBeEnabled();
  });
});
