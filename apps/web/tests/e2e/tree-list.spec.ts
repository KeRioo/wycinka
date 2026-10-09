import { expect, test, type Page } from '@playwright/test';

function buildMockPmtiles(): Uint8Array {
  const bytes = new Uint8Array(133);
  const v = new DataView(bytes.buffer);
  v.setUint16(0, 19792, true);
  v.setUint8(7, 3);
  v.setBigUint64(8, 127n, true);
  v.setBigUint64(16, 5n, true);
  v.setBigUint64(56, 132n, true);
  v.setBigUint64(64, 1n, true);
  v.setBigUint64(72, 1n, true);
  v.setBigUint64(80, 1n, true);
  v.setBigUint64(88, 1n, true);
  v.setUint8(99, 1);
  v.setUint8(101, 14);
  v.setInt32(102, 140_000_000, true);
  v.setInt32(106, 490_000_000, true);
  v.setInt32(110, 240_000_000, true);
  v.setInt32(114, 550_000_000, true);
  v.setUint8(118, 6);
  v.setInt32(119, 210_000_000, true);
  v.setInt32(123, 520_000_000, true);
  bytes[127] = 1;
  bytes[128] = 0;
  bytes[129] = 1;
  bytes[130] = 1;
  bytes[131] = 1;
  bytes[132] = 0;
  return bytes;
}

async function serveMockPmtiles(context: import('@playwright/test').BrowserContext): Promise<void> {
  const bytes = buildMockPmtiles();
  await context.route('**/api/v1/pmtiles/**', (route) => {
    const range = route.request().headers()['range'];
    const match = range === undefined ? null : /bytes=(\d+)-(\d+)/.exec(range);
    const start = match !== null ? Number(match[1] ?? '0') : 0;
    const end = match !== null ? Number(match[2] ?? '0') : bytes.length - 1;
    const clampedStart = Math.min(start, bytes.length - 1);
    const clampedEnd = Math.min(end, bytes.length - 1);
    const body = Buffer.from(bytes.slice(clampedStart, clampedEnd + 1));
    void route.fulfill({
      status: 206,
      headers: {
        'content-type': 'application/octet-stream',
        'content-range': `bytes ${clampedStart}-${clampedEnd}/${bytes.length}`,
        'accept-ranges': 'bytes',
        etag: '"mock-pmtiles-v1"',
      },
      body,
    });
  });
}

async function ensureProjectAndFab(page: Page): Promise<void> {
  await expect(page.getByTestId('map-container')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  for (let attempt = 0; attempt < 5; attempt++) {
    const fabVisible = await page
      .getByTestId('fab-add-tree')
      .isVisible()
      .catch(() => false);
    if (!fabVisible) {
      const createBtn = page.getByTestId('create-first-project');
      if (await createBtn.isVisible().catch(() => false)) {
        await createBtn.click({ force: true });
        await expect(page.getByText(/Brak projektu/)).not.toBeVisible({ timeout: 5_000 });
      }
      await page.waitForTimeout(1000);
    } else {
      break;
    }
  }
  await expect(page.getByTestId('fab-add-tree')).toBeVisible({ timeout: 10_000 });
}

async function saveFirstTree(page: Page): Promise<void> {
  await ensureProjectAndFab(page);
  await page.getByTestId('fab-add-tree').click();
  await expect(page.getByTestId('add-tree-panel')).toBeVisible();
  await page.getByTestId('nudge-right').click();
  await page.getByTestId('nudge-right').click();
  await page.getByTestId('tree-species').selectOption('Dąb');
  await page.getByTestId('tree-circumference').fill('85');
  const saveBtn = page.getByTestId('panel-save');
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();
  await expect(page.getByTestId('add-tree-panel')).not.toBeVisible({ timeout: 5_000 });
}

test.describe('Tree list and marker popup', () => {
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

    await serveMockPmtiles(context);
  });

  test('should list saved trees and open details popup from a row', async ({ page }) => {
    await page.goto('/map');
    await saveFirstTree(page);

    await page.getByTestId('tree-list-toggle').click();
    await expect(page.getByTestId('tree-list-panel')).toBeVisible();

    const row = page.getByTestId('tree-list-item');
    await expect(row).toHaveText(/Dąb/);
    await expect(row).toHaveText(/Obwód: 85 cm/);

    await row.locator('button').first().click();
    await expect(page.getByTestId('tree-popup')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('tree-popup')).toHaveText(/Dąb/);
    await expect(page.getByTestId('tree-popup')).toHaveText(/Obwód: 85 cm/);
    await expect(page.getByTestId('tree-popup')).toHaveText(/Data:/);
  });

  test('should start edit mode from the popup', async ({ page }) => {
    await page.goto('/map');
    await saveFirstTree(page);

    await page.getByTestId('tree-list-toggle').click();
    await page.getByTestId('tree-list-item').locator('button').first().click();
    await expect(page.getByTestId('tree-popup')).toBeVisible({ timeout: 5_000 });

    await page.getByTestId('tree-popup-edit').click();
    await expect(page.getByTestId('add-tree-panel')).toBeVisible();
    await expect(page.getByTestId('add-tree-panel')).toHaveText(/Edytuj drzewo/);
  });

  test('should delete a tree from the list panel', async ({ page }) => {
    await page.goto('/map');
    await saveFirstTree(page);

    await page.getByTestId('tree-list-toggle').click();
    await expect(page.getByTestId('tree-list-panel')).toBeVisible();

    await page
      .getByTestId('tree-list-item')
      .getByRole('button', { name: 'Usuń drzewo' })
      .click();
    await expect(page.getByTestId('tree-list-empty')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('tree-list-item')).toHaveCount(0);
  });

  test('should open the popup when a tree marker is clicked on the map', async ({ page }) => {
    await page.goto('/map');
    await saveFirstTree(page);

    await expect(page.getByTestId('map-container')).toHaveAttribute('data-loaded', 'true', {
      timeout: 15_000,
    });
    await page.waitForTimeout(500);

    const canvas = page.locator('canvas.maplibregl-canvas');
    const box = await canvas.boundingBox();
    if (box === null) {
      throw new Error('map canvas not found');
    }
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId('tree-popup')).toBeVisible({ timeout: 5_000 });
  });
});
