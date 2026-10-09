import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MINIMAL_PMTILES = readFileSync(
  join(new URL('.', import.meta.url).pathname, 'fixtures/minimal.pmtiles'),
);

const GPS = { lat: 52.2297, lng: 21.0122 };
const VERTEX = { lat: 52.2297, lng: 21.01223 };

const PARCEL_RESPONSE = {
  found: true,
  parcel: {
    id: '146501_2.0001.12',
    teryt: '146501_2.0001.12',
    number: '12',
    voivodeship: 'mazowieckie',
    county: 'Piaseczyński',
    commune: 'Konstancin-Jeziorna',
    region: '0001',
    region_name: 'Obręb 0001',
    area_m2: 2500,
    land_use: 'Ls',
    geom: {
      type: 'Polygon',
      coordinates: [
        [
          [VERTEX.lng, VERTEX.lat],
          [21.0139, 52.2306],
          [21.0105, 52.2306],
          [21.0105, 52.2289],
          [VERTEX.lng, VERTEX.lat],
        ],
      ],
    },
    bbox: [21.0105, 52.2289, 21.0139, 52.2306],
    centroid: [GPS.lng, GPS.lat],
    fetched_at: '2026-10-09T03:00:00Z',
    voivodeship_code: '14',
    county_code: '65',
    commune_code: '01',
    datasource: 'uldk',
  },
};

async function ensureProjectAndFab(page: Page): Promise<void> {
  await expect(page.getByTestId('map-container')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  for (let attempt = 0; attempt < 5; attempt++) {
    const createBtn = page.getByTestId('create-first-project');
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click({ force: true });
      await expect(page.getByText(/Brak projektu/)).not.toBeVisible({ timeout: 5_000 });
    }
    if (
      await page
        .getByTestId('fab-add-tree')
        .isVisible()
        .catch(() => false)
    ) {
      break;
    }
    await page.waitForTimeout(500);
  }
  await expect(page.getByTestId('fab-add-tree')).toBeVisible({ timeout: 10_000 });
}

interface MapHandle {
  project(lngLat: [number, number]): { x: number; y: number };
  getContainer(): HTMLElement;
  panBy(delta: [number, number], options?: { animate?: boolean }): void;
  isMoving(): boolean;
}

async function waitForMapIdle(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const map = (window as unknown as Record<string, MapHandle | undefined>).wycinkaMap;
    if (map === undefined) {
      return false;
    }
    map.panBy([0, 0], { animate: false });
    return !map.isMoving();
  });
}

test.describe('Snap-to-vertex pinezki', () => {
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

    await context.route('**/api/v1/version', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          api: '1.0.0',
          data: '2026-10-09',
          egib_source: 'geoportal.gov.pl',
          etag: 'test-etag',
        }),
      }),
    );

    await context.route('**/api/v1/pmtiles/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        body: MINIMAL_PMTILES,
      }),
    );

    await context.route('**/api/v1/parcel**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PARCEL_RESPONSE),
      }),
    );
  });

  test('should snap pending pin to a parcel vertex on drop and save there', async ({ page }) => {
    await page.goto('/map');
    await ensureProjectAndFab(page);

    await page.getByTestId('map-container').click({ position: { x: 640, y: 300 } });
    await expect(page.getByText('Wybrana działka')).toBeVisible({ timeout: 10_000 });
    await waitForMapIdle(page);

    await page.getByTestId('fab-add-tree').click();
    await expect(page.getByTestId('add-tree-panel')).toBeVisible();
    await expect(page.getByTestId('pending-position')).toHaveText(
      `${GPS.lat.toFixed(5)}, ${GPS.lng.toFixed(5)}`,
    );

    const pin = await page.evaluate(
      ({ gpLat, gpLng, targetY }) => {
        const map = (window as unknown as Record<string, MapHandle | undefined>).wycinkaMap;
        if (map === undefined) {
          throw new Error('map not ready');
        }
        const point = map.project([gpLng, gpLat]);
        const rect = map.getContainer().getBoundingClientRect();
        const pinY = rect.top + point.y;
        map.panBy([0, pinY - targetY], { animate: false });
        const shifted = map.project([gpLng, gpLat]);
        return { x: rect.left + shifted.x, y: rect.top + shifted.y };
      },
      { gpLat: GPS.lat, gpLng: GPS.lng, targetY: 90 },
    );
    await page.waitForTimeout(400);

    await page.mouse.move(pin.x, pin.y);
    await page.mouse.down();
    await expect(page.getByTestId('snap-indicator')).toBeVisible({ timeout: 5_000 });
    await page.mouse.up();

    await expect(page.getByTestId('pending-position')).toHaveText(
      `${VERTEX.lat.toFixed(5)}, ${VERTEX.lng.toFixed(5)}`,
      { timeout: 5_000 },
    );

    await page.getByTestId('tree-species').selectOption('Dąb');
    await page.getByTestId('tree-circumference').fill('92');
    await page.getByTestId('panel-save').click();
    await expect(page.getByTestId('add-tree-panel')).not.toBeVisible({ timeout: 5_000 });

    const trees = await page.evaluate(
      () =>
        new Promise<Array<{ lat: number; lng: number }>>((resolve, reject) => {
          const openRequest = indexedDB.open('wycinka');
          openRequest.onerror = () => reject(openRequest.error);
          openRequest.onsuccess = () => {
            const database = openRequest.result;
            const transaction = database.transaction('trees', 'readonly');
            const request = transaction.objectStore('trees').getAll();
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              database.close();
              resolve(request.result as Array<{ lat: number; lng: number }>);
            };
          };
        }),
    );
    const saved = trees.at(-1);
    expect(saved).toBeDefined();
    expect(Math.abs((saved as { lat: number }).lat - VERTEX.lat)).toBeLessThan(1e-9);
    expect(Math.abs((saved as { lng: number }).lng - VERTEX.lng)).toBeLessThan(1e-9);
  });

  test('should keep the pin unsnapped when dropped far from vertices', async ({ page }) => {
    await page.goto('/map');
    await ensureProjectAndFab(page);

    await page.getByTestId('map-container').click({ position: { x: 640, y: 300 } });
    await expect(page.getByText('Wybrana działka')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('fab-add-tree').click();
    await expect(page.getByTestId('add-tree-panel')).toBeVisible();

    await page.getByTestId('tree-species').selectOption('Sosna');
    await page.getByTestId('tree-circumference').fill('70');

    await expect(page.getByTestId('pending-position')).toHaveText(
      `${GPS.lat.toFixed(5)}, ${GPS.lng.toFixed(5)}`,
    );
  });
});
