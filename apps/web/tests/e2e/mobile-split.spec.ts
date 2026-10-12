import { expect, test } from '@playwright/test';
import { openProjectViaLauncherWithFab } from './helpers';

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

function installGpsInitScript(
  context: import('@playwright/test').BrowserContext,
  denied: boolean,
): void {
  void context.addInitScript((gpsDenied: boolean) => {
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
    navigator.geolocation.getCurrentPosition = (
      successCb: PositionCallback,
      errorCb?: PositionErrorCallback,
    ) => {
      setTimeout(() => {
        if (gpsDenied && errorCb) {
          errorCb(Object.assign(new GeolocationPositionError(), { code: 1, message: 'denied' }));
        } else {
          successCb(mockPosition as GeolocationPosition);
        }
      }, 50);
    };
    navigator.geolocation.watchPosition = (
      successCb: PositionCallback,
      errorCb?: PositionErrorCallback,
    ) => {
      setTimeout(() => {
        if (gpsDenied && errorCb) {
          errorCb(Object.assign(new GeolocationPositionError(), { code: 1, message: 'denied' }));
        } else {
          successCb(mockPosition as GeolocationPosition);
        }
      }, 50);
      return 1;
    };
    navigator.geolocation.clearWatch = () => undefined;
  }, denied);
}

async function addTreePanelBox(page: import('@playwright/test').Page) {
  return page.getByTestId('add-tree-panel').boundingBox();
}

async function mapBox(page: import('@playwright/test').Page) {
  return page.getByTestId('map-container').boundingBox();
}

test.describe('Mobile — bottom-half split panels (§12.6)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test.beforeEach(async ({ context }) => {
    installGpsInitScript(context, false);
    await mockBackend(context);
  });

  test('should open add-tree panel in the lower half with the map squeezed into the upper half', async ({
    page,
  }) => {
    await openProjectViaLauncherWithFab(page);
    await page.getByTestId('fab-add-tree').tap();

    const viewport = page.viewportSize();
    if (viewport === null) {
      throw new Error('viewport missing');
    }
    const minPanelTop = viewport.height * 0.48;
    const mapTestId = page.getByTestId('map-container');

    await expect
      .poll(async () => {
        const box = await addTreePanelBox(page);
        const mb = await mapBox(page);
        if (box === null || mb === null) {
          return null;
        }
        return box.y < minPanelTop || mb.y + mb.height > box.y + 2 ? null : box.y + box.height;
      })
      .toBeGreaterThan(0);
    await expect(page.getByTestId('add-tree-panel')).toBeVisible();

    const box = await addTreePanelBox(page);
    const mb = await mapBox(page);
    if (box === null || mb === null) {
      throw new Error('panel or map box missing');
    }
    expect(box.y).toBeGreaterThanOrEqual(minPanelTop);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(mb.y + mb.height).toBeLessThanOrEqual(box.y + 2);
    expect(mb.height).toBeGreaterThanOrEqual(200);

    await expect(page.getByTestId('fab-add-tree')).toBeVisible();
  });

  test('should open the tree list in the lower half and restore the map when closed', async ({
    page,
  }) => {
    await openProjectViaLauncherWithFab(page);
    const viewport = page.viewportSize();
    if (viewport === null) {
      throw new Error('viewport missing');
    }
    const minPanelTop = viewport.height * 0.48;

    const toggle = page.getByTestId('tree-list-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText('Drzewa');
    await toggle.tap();

    const panel = page.getByTestId('tree-list-panel');
    await expect(panel).toBeVisible();
    await expect
      .poll(async () => {
        const box = await panel.boundingBox();
        const mb = await mapBox(page);
        if (box === null || mb === null) {
          return null;
        }
        return box.y < minPanelTop || mb.y + mb.height > box.y + 2 ? null : box.y;
      })
      .toBeGreaterThan(0);
    const box = await panel.boundingBox();
    const mb = await mapBox(page);
    if (box === null || mb === null) {
      throw new Error('panel or map box missing');
    }
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);

    await page.getByTestId('tree-list-close').tap();
    await expect(panel).not.toBeVisible({ timeout: 5_000 });
    await expect.poll(async () => {
      const restored = await mapBox(page);
      return restored === null ? 0 : restored.y + restored.height;
    }).toBeGreaterThanOrEqual(viewport.height * 0.9);
  });
});

test.describe('Desktop — regression (1280×720, drawers without split)', () => {
  test.beforeEach(async ({ context }) => {
    installGpsInitScript(context, true);
    await mockBackend(context);
  });

  test('should keep add-tree as a right sidebar and the map at full height', async ({ page }) => {
    await openProjectViaLauncherWithFab(page);
    await page.getByTestId('fab-add-tree').click();

    const panel = page.getByTestId('add-tree-panel');
    await expect(panel).toBeVisible();
    const viewport = page.viewportSize();
    const box = await panel.boundingBox();
    const mb = await mapBox(page);
    if (viewport === null || box === null || mb === null) {
      throw new Error('boxes missing');
    }
    expect(box.width).toBeGreaterThanOrEqual(320);
    expect(box.width).toBeLessThanOrEqual(400);
    expect(box.x + box.width).toBeGreaterThanOrEqual(viewport.width - 16);
    expect(mb.y + mb.height).toBeGreaterThanOrEqual(viewport.height - 2);
    expect(page.getByTestId('panel-spacer')).toHaveCount(0);
  });

  test('should keep the tree list as a right drawer and the map at full height', async ({
    page,
  }) => {
    await openProjectViaLauncherWithFab(page);
    await page.getByTestId('tree-list-toggle').click();

    const panel = page.getByTestId('tree-list-panel');
    await expect(panel).toBeVisible();
    const viewport = page.viewportSize();
    const box = await panel.boundingBox();
    const mb = await mapBox(page);
    if (viewport === null || box === null || mb === null) {
      throw new Error('boxes missing');
    }
    expect(box.x + box.width).toBeGreaterThanOrEqual(viewport.width - 16);
    expect(box.width).toBeLessThanOrEqual(400);
    expect(mb.y + mb.height).toBeGreaterThanOrEqual(viewport.height - 2);
    expect(box.y).toBeLessThan(viewport.height * 0.3);
  });
});
