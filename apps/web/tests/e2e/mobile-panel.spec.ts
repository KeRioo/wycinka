import { expect, test } from '@playwright/test';

const MOCK_PARCEL = {
  id: 'test-1',
  teryt: '141201_1.0001.6509',
  number: '6509',
  voivodeship: 'mazowieckie',
  county: 'warszawski',
  commune: 'Warszawa',
  region: '0001',
  region_name: 'Obręb 0001',
  area_m2: 1200,
  land_use: 'Ls',
  voivodeship_code: '14',
  county_code: '12',
  commune_code: '01',
  datasource: 'EGiB',
  geom: {
    type: 'Polygon',
    coordinates: [
      [
        [21.229, 52.15],
        [21.231, 52.15],
        [21.231, 52.152],
        [21.229, 52.152],
        [21.229, 52.15],
      ],
    ],
  },
  bbox: [21.229, 52.15, 21.231, 52.152],
  centroid: [21.23, 52.151],
  fetched_at: '2026-01-01T00:00:00Z',
};

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
  await context.route('**/api/v1/parcel**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ found: true, parcel: MOCK_PARCEL }),
    });
  });
}

async function ensureProject(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.getByTestId('map-container')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  const createBtn = page.getByTestId('create-first-project');
  const createVisible = await createBtn.isVisible().catch(() => false);
  if (createVisible) {
    await createBtn.click({ force: true });
    await expect(page.getByTestId('fab-add-tree')).toBeVisible({ timeout: 10_000 });
  }
}

test.describe('Mobile — AddTreePanel bottom sheet', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });

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
        setTimeout(() => success(mockPosition as GeolocationPosition), 50);
      };
      navigator.geolocation.watchPosition = (success: PositionCallback) => {
        setTimeout(() => success(mockPosition as GeolocationPosition), 50);
        return 1;
      };
      navigator.geolocation.clearWatch = () => undefined;
    });
    await mockBackend(context);
  });

  test('should open as a bottom sheet that does not cover the whole map', async ({ page }) => {
    await page.goto('/map');
    await ensureProject(page);
    await page.getByTestId('fab-add-tree').tap();

    const panel = page.getByTestId('add-tree-panel');
    await expect(panel).toBeVisible();
    await page.waitForTimeout(700);
    const box = await panel.boundingBox();
    const viewport = page.viewportSize();
    if (box === null || viewport === null) {
      throw new Error('panel box missing');
    }
    const heightRatio = box.height / viewport.height;
    expect(heightRatio).toBeGreaterThanOrEqual(0.55);
    expect(heightRatio).toBeLessThanOrEqual(0.65);
    expect(box.y).toBeGreaterThanOrEqual(viewport.height * 0.3);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);

    const arrowPad = page.getByTestId('nudge-right');
    await expect(arrowPad).toBeVisible();
    const padBox = await arrowPad.boundingBox();
    expect(padBox === null ? -1 : padBox.y).toBeGreaterThanOrEqual(viewport.height * 0.3);
  });

  test('should keep ArrowPad clickable and close via drag handle', async ({ page }) => {
    await page.goto('/map');
    await ensureProject(page);
    await page.getByTestId('fab-add-tree').tap();

    const nudgeStatus = page.getByTestId('nudge-status');
    await expect(nudgeStatus).toContainText('Przesunięcie:');
    await page.getByTestId('nudge-right').tap();
    await expect(nudgeStatus).toContainText(/\+0\.25/);

    await page.getByTestId('add-tree-drag-handle').tap();
    await expect(page.getByTestId('add-tree-panel')).not.toBeVisible({ timeout: 5_000 });
  });

  test('should center the map on the pending pin when locate button pressed', async ({ page }) => {
    await page.goto('/map');
    await ensureProject(page);
    await page.getByTestId('fab-add-tree').tap();

    const locate = page.getByTestId('focus-pending');
    await expect(locate).toBeVisible();
    await locate.tap();
    await page.waitForTimeout(800);

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const map = (
            window as unknown as { wycinkaMap?: { getCenter: () => { lat: number; lng: number } } }
          ).wycinkaMap;
          return map === undefined ? null : map.getCenter();
        }),
      )
      .toMatchObject({ lat: 52.2297, lng: 21.0122 });
  });
});

test.describe('Mobile — single parcel card', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test.beforeEach(async ({ context }) => {
    await mockBackend(context);
  });

  test('should show one compact parcel card collapsed with TERYT after map click', async ({
    page,
  }) => {
    await page.goto('/map');
    await ensureProject(page);
    await page.waitForTimeout(1500);
    await page.mouse.click(195, 422);

    const card = page.getByTestId('parcel-card');
    await expect(card).toBeVisible({ timeout: 10_000 });
    const box = await card.boundingBox();
    expect(box === null ? 999 : box.width).toBeLessThanOrEqual(390 * 0.7 + 8);
    await expect(card.locator('p.font-mono')).toContainText(MOCK_PARCEL.teryt);
    const mappopup = await page.locator('.maplibregl-popup').count();
    expect(mappopup).toBe(0);

    await page.getByTestId('parcel-card-toggle').tap();
    await expect(page.getByText('Szczegóły', { exact: false })).toBeHidden();
    await expect(card).toContainText('Użytek');
  });
});

test.describe('Desktop — regression', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (
        _success: PositionCallback,
        error: PositionErrorCallback,
      ) => {
        setTimeout(() => error(new GeolocationPositionError()), 50);
      };
      navigator.geolocation.watchPosition = (
        _success: PositionCallback,
        error: PositionErrorCallback,
      ) => {
        setTimeout(() => error(new GeolocationPositionError()), 50);
        return 1;
      };
      navigator.geolocation.clearWatch = () => undefined;
    });
    await mockBackend(context);
  });

  test('should open narrow right sidebar instead of fullscreen panel', async ({ page }) => {
    await page.goto('/map');
    await ensureProject(page);
    await page.getByTestId('fab-add-tree').click();

    const panel = page.getByTestId('add-tree-panel');
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    const viewport = page.viewportSize();
    if (box === null || viewport === null) {
      throw new Error('panel box missing');
    }
    expect(box.width).toBeGreaterThanOrEqual(320);
    expect(box.width).toBeLessThanOrEqual(400);
    expect(box.x + box.width).toBeGreaterThanOrEqual(viewport.width - 16);
    expect(box.height).toBeLessThanOrEqual(viewport.height);
  });

  test('should seed pending from parcel centroid when GPS denied', async ({ page }) => {
    await page.goto('/map');
    await ensureProject(page);
    await page.waitForTimeout(1500);
    await page.mouse.click(640, 360);

    await expect(page.getByTestId('parcel-card')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('fab-add-tree').click();
    await expect(page.getByTestId('add-tree-panel')).toBeVisible();
    const position = page.getByTestId('pending-position');
    await expect(position).toContainText('52.151');
    await expect(position).toContainText('21.23');
  });
});
