import { expect, test } from '@playwright/test';
import { openProjectViaLauncherWithFab } from './helpers';

async function mockBackend(context: import('@playwright/test').BrowserContext): Promise<void> {
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
}

function mockGeolocation(context: import('@playwright/test').BrowserContext): void {
  void context.addInitScript(() => {
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
      setTimeout(() => success(mockPosition as GeolocationPosition), 50);
    };
    navigator.geolocation.watchPosition = (success: PositionCallback) => {
      setTimeout(() => success(mockPosition as GeolocationPosition), 50);
      return 1;
    };
    navigator.geolocation.clearWatch = () => undefined;
  });
}

test.describe('AddTreePanel v2 — kompresja §12.4 (desktop)', () => {
  test.beforeEach(async ({ context }) => {
    mockGeolocation(context);
    await mockBackend(context);
  });

  test('should keep Zapisz/Anuluj in the header above the form', async ({ page }) => {
    await openProjectViaLauncherWithFab(page);
    await page.getByTestId('fab-add-tree').click();

    const panel = page.getByTestId('add-tree-panel');
    await expect(panel).toBeVisible();

    const header = page.getByTestId('add-tree-header');
    await expect(header.getByTestId('panel-save')).toBeVisible();
    await expect(header.getByTestId('panel-cancel')).toBeVisible();

    const saveTop = await page.getByTestId('panel-save').boundingBox();
    const formTop = await page.getByTestId('tree-species').boundingBox();
    if (saveTop === null || formTop === null) {
      throw new Error('bounding boxes missing');
    }
    expect(saveTop.y).toBeLessThan(formTop.y);
  });

  test('should remember species and circumference for the next tree', async ({ page }) => {
    await openProjectViaLauncherWithFab(page);
    await page.getByTestId('fab-add-tree').click();

    const panel = page.getByTestId('add-tree-panel');
    await expect(panel).toBeVisible();
    await page.getByTestId('tree-species').selectOption('Sosna');
    await page.getByTestId('tree-circumference').fill('95');

    const save = page.getByTestId('panel-save');
    await expect(save).toBeEnabled();
    await save.click();
    await expect(panel).not.toBeVisible({ timeout: 5_000 });

    const fab = page.getByTestId('fab-add-tree');
    await expect(fab).toBeVisible();
    await fab.click();

    await expect(panel).toBeVisible();
    await expect(page.getByTestId('tree-species')).toHaveValue('Sosna');
    await expect(page.getByTestId('tree-circumference')).toHaveValue('95');
  });

  test('should adjust circumference with plus and minus steppers', async ({ page }) => {
    await openProjectViaLauncherWithFab(page);
    await page.getByTestId('fab-add-tree').click();

    const panel = page.getByTestId('add-tree-panel');
    await expect(panel).toBeVisible();
    await page.getByTestId('tree-circumference').fill('85');

    await page.getByTestId('circumference-minus').click();
    await expect(page.getByTestId('tree-circumference')).toHaveValue('80');

    await page.getByTestId('circumference-plus').click();
    await expect(page.getByTestId('tree-circumference')).toHaveValue('85');
  });

  test('should refresh pending position to current GPS and reset manual offset', async ({
    page,
  }) => {
    await openProjectViaLauncherWithFab(page);
    await page.getByTestId('fab-add-tree').click();

    const panel = page.getByTestId('add-tree-panel');
    await expect(panel).toBeVisible();
    await page.getByTestId('nudge-right').click();
    await page.getByTestId('nudge-right').click();
    await expect(page.getByTestId('nudge-status')).toContainText(/\+0\.50/);

    await page.getByTestId('panel-gps-refresh').click();
    await expect(page.getByTestId('nudge-status')).toContainText(/\+0\.00\s*m/);
    await expect(page.getByTestId('pending-position')).toContainText('52.22970');
  });
});

test.describe('AddTreePanel v2 — GPS odmówiony (desktop)', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      const deniedError = {
        code: 1,
        message: 'User denied Geolocation',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as unknown as GeolocationPositionError;
      navigator.geolocation.getCurrentPosition = (
        _success: PositionCallback,
        error: PositionErrorCallback,
      ) => {
        setTimeout(() => error(deniedError), 50);
      };
      navigator.geolocation.watchPosition = (
        _success: PositionCallback,
        error: PositionErrorCallback,
      ) => {
        setTimeout(() => error(deniedError), 50);
        return 1;
      };
      navigator.geolocation.clearWatch = () => undefined;
    });
    await mockBackend(context);
  });

  test('should disable GPS refresh button when GPS is unavailable', async ({ page }) => {
    await openProjectViaLauncherWithFab(page);
    await page.getByTestId('fab-add-tree').click();

    const panel = page.getByTestId('add-tree-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('gps-indicator-error')).toBeVisible();
    await expect(page.getByTestId('panel-gps-refresh')).toBeDisabled();
  });
});

test.describe('AddTreePanel v2 — mobile (bottom sheet)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test.beforeEach(async ({ context }) => {
    mockGeolocation(context);
    await mockBackend(context);
  });

  test('should render compressed bottom sheet with all form inputs visible', async ({ page }) => {
    await openProjectViaLauncherWithFab(page);
    await page.getByTestId('fab-add-tree').tap();

    const panel = page.getByTestId('add-tree-panel');
    await expect(panel).toBeVisible();
    await page.waitForTimeout(700);

    const viewport = page.viewportSize();
    const box = await panel.boundingBox();
    if (box === null || viewport === null) {
      throw new Error('panel box missing');
    }
    const heightRatio = box.height / viewport.height;
    expect(heightRatio).toBeLessThanOrEqual(0.55);

    await expect(page.getByTestId('tree-species')).toBeVisible();
    await expect(page.getByTestId('tree-circumference')).toBeVisible();
    await expect(page.getByTestId('circumference-plus')).toBeVisible();
    await expect(page.getByTestId('panel-save')).toBeVisible();
  });
});
