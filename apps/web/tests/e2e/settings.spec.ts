import { expect, test, type Page } from '@playwright/test';

async function createActiveProject(page: Page): Promise<void> {
  await page.goto('/projects');
  await expect(page.getByTestId('new-project')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(300);
  await page.getByTestId('new-project').click();
  await expect(page.getByTestId('map-container')).toBeVisible({ timeout: 15_000 });
}

async function openSettings(page: Page): Promise<void> {
  await page.goto('/settings');
  await expect(page.getByTestId('species-editor')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(300);
}

function speciesInput(page: Page, index: number) {
  return page.getByLabel(`Nazwa gatunku ${String(index)}`, { exact: true });
}

test.describe('Settings flows (BACKLOG C)', () => {
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
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });
  });

  test('should add, remove and reorder species with persistence after reload', async ({ page }) => {
    await createActiveProject(page);
    await openSettings(page);

    const defaultCount = 17;
    await expect(page.getByLabel(/^Nazwa gatunku \d+$/)).toHaveCount(defaultCount);

    await page.getByLabel('Usuń gatunek Dąb').click();
    await expect(page.getByLabel(/^Nazwa gatunku \d+$/)).toHaveCount(defaultCount - 1);
    await expect(speciesInput(page, 1)).toHaveValue('Buk');

    await page.getByTestId('species-add').click();
    const lastInput = speciesInput(page, defaultCount);
    await lastInput.fill('Wierzba biała');

    await page.getByLabel('Przenieś Sosna w górę').click();
    await expect(speciesInput(page, 1)).toHaveValue('Sosna');
    await expect(speciesInput(page, 2)).toHaveValue('Buk');

    await page.getByTestId('species-save').click();
    await expect(page.getByTestId('species-saved')).toBeVisible();

    await page.reload();
    await openSettings(page);
    await expect(page.getByLabel(/^Nazwa gatunku \d+$/)).toHaveCount(defaultCount);
    await expect(speciesInput(page, 1)).toHaveValue('Sosna');
    await expect(speciesInput(page, 2)).toHaveValue('Buk');
    await expect(speciesInput(page, defaultCount)).toHaveValue('Wierzba biała');
    await expect(page.getByLabel('Usuń gatunek Dąb')).toHaveCount(0);
  });

  test('should override ranges and PDF prefs with persistence after reload', async ({ page }) => {
    await createActiveProject(page);
    await openSettings(page);

    await page.getByLabel('Przedział 1 od').fill('10');
    await page.getByLabel('Etykieta przedziału 1').fill('< 50 cm od 10');
    await page.getByTestId('ranges-save').click();
    await expect(page.getByTestId('ranges-saved')).toBeVisible();

    await page.getByTestId('config-layout-combined').check();
    await page.getByTestId('config-pref-separate').check();
    await page.getByTestId('config-marker-base').fill('5');
    await page.getByTestId('pdf-prefs-save').click();
    await expect(page.getByTestId('pdf-prefs-saved')).toBeVisible();

    await page.reload();
    await openSettings(page);

    await expect(page.getByLabel('Przedział 1 od')).toHaveValue('10');
    await expect(page.getByLabel('Etykieta przedziału 1')).toHaveValue('< 50 cm od 10');
    await expect(page.getByTestId('config-layout-combined')).toBeChecked();
    await expect(page.getByTestId('config-pref-separate')).toBeChecked();
    await expect(page.getByTestId('config-marker-base')).toHaveValue('5');
  });

  test('should export and import backup with overwrite mode roundtrip', async ({ page }) => {
    await createActiveProject(page);
    await openSettings(page);

    await page.getByLabel('Przedział 1 od').fill('25');
    await page.getByTestId('ranges-save').click();
    await expect(page.getByTestId('ranges-saved')).toBeVisible();

    await page.goto('/projects');
    await page.waitForTimeout(300);
    await page.getByTestId('new-project').click();
    await expect(page.getByTestId('map-container')).toBeVisible({ timeout: 15_000 });

    await page.goto('/settings');
    await expect(page.getByTestId('backup-panel')).toBeVisible({ timeout: 15_000 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('backup-export').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^wycinka-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const backupPath = await download.path();

    await page.setInputFiles('[data-testid="backup-file-input"]', backupPath);
    await page.getByText('Nadpisz — usuń obecną zawartość i wgraj plik').click();
    await page.getByTestId('backup-import').click();

    await expect(page.getByTestId('backup-success')).toContainText('nadpisanie');
    await expect(page.getByTestId('backup-success')).toContainText('projekty 2');

    await page.goto('/projects');
    await page.waitForTimeout(500);
    await expect(page.getByTestId('project-card')).toHaveCount(2);

    await page
      .getByTestId('project-card')
      .filter({ hasText: 'Projekt 1' })
      .getByTestId('project-open')
      .click();
    await expect(page.getByTestId('map-container')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('link', { name: 'Ustawienia' }).click();
    await expect(page.getByTestId('ranges-editor')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel('Przedział 1 od')).toHaveValue('25', { timeout: 15_000 });
  });
});
