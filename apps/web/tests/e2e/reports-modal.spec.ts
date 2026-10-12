import { expect, test } from '@playwright/test';
import { openProjectViaLauncher, openProjectViaLauncherWithFab } from './helpers';

test.describe('Redesign v2 — modale ustawień i raportów (§12.3)', () => {
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

  test('should open settings modal from menu with editors and no print options', async ({
    page,
  }) => {
    await openProjectViaLauncher(page);

    await page.getByTestId('app-menu').click();
    await page.getByTestId('menu-settings').click();

    await expect(page.getByTestId('settings-modal')).toBeVisible();
    await expect(page.getByTestId('species-editor')).toBeVisible();
    await expect(page.getByTestId('ranges-editor')).toBeVisible();

    await expect(page.getByTestId('pdf-prefs-editor')).toHaveCount(0);
    await expect(page.getByTestId('config-layout-single')).toHaveCount(0);
    await expect(page.getByTestId('pdf-preview-svg')).toHaveCount(0);
    await expect(page.getByTestId('pdf-export-generate')).toHaveCount(0);

    await page.getByTestId('settings-close').click();
    await expect(page.getByTestId('settings-modal')).not.toBeVisible();
  });

  test('should persist print prefs per project after reload', async ({ page }) => {
    await openProjectViaLauncher(page);

    await page.getByTestId('app-menu').click();
    await page.getByTestId('menu-reports').click();

    await expect(page.getByTestId('reports-modal')).toBeVisible();
    await expect(page.getByTestId('pdf-preview-svg')).toBeVisible();
    await expect(page.getByTestId('pdf-pref-separate')).not.toBeChecked();
    await expect(page.getByTestId('reports-generate')).toBeDisabled();

    await page.getByTestId('pdf-pref-separate').check();
    await page.getByTestId('pdf-layout-one-per-page').check();
    await page.getByTestId('reports-close').click();
    await expect(page.getByTestId('reports-modal')).not.toBeVisible();

    await page.waitForTimeout(300);
    await page.reload();
    await expect(page.getByTestId('map-container')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('app-menu').click();
    await page.getByTestId('menu-reports').click();
    await expect(page.getByTestId('reports-modal')).toBeVisible();
    await expect(page.getByTestId('pdf-pref-separate')).toBeChecked();
    await expect(page.getByTestId('pdf-layout-one-per-page')).toBeChecked();
  });

  test('should generate a PDF from the reports modal after adding a tree', async ({ page }) => {
    await openProjectViaLauncherWithFab(page);

    await page.getByTestId('fab-add-tree').click();
    await expect(page.getByTestId('add-tree-panel')).toBeVisible();
    await page.getByTestId('tree-species').selectOption('Dąb');
    await page.getByTestId('tree-circumference').fill('85');
    await page.getByTestId('panel-save').click();
    await expect(page.getByTestId('add-tree-panel')).not.toBeVisible({ timeout: 5_000 });

    await page.getByTestId('app-menu').click();
    await page.getByTestId('menu-reports').click();
    await expect(page.getByTestId('reports-modal')).toBeVisible();
    await expect(page.getByTestId('reports-generate')).toBeEnabled();

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('reports-generate').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^wycinka-.*\.pdf$/);
  });
});
