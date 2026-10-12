import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openProjectViaLauncher } from './helpers';

const MINIMAL_PMTILES = readFileSync(
  join(new URL('.', import.meta.url).pathname, 'fixtures/minimal.pmtiles'),
);

const GPS = { lat: 52.1036, lng: 21.5304 };

const VERSION_RESPONSE = {
  api: '1.0.0',
  data: '2026-10-12',
  egib_source: 'geoportal.gov.pl',
  etag: 'test-etag',
};

function routeVersion(context: BrowserContext): void {
  context.route('**/api/v1/version', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(VERSION_RESPONSE),
    }),
  );
  context.route('**/api/v1/pmtiles/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/octet-stream',
      body: MINIMAL_PMTILES,
    }),
  );
}

let deniedInitScriptAdded = false;

interface MapHandle {
  getZoom(): number;
  getCenter(): { lat: number; lng: number };
}

async function getZoom(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      Math.round(
        ((window as unknown as Record<string, MapHandle | undefined>).wycinkaMap as MapHandle)
          .getZoom() * 100,
      ) / 100,
  );
}

test.describe('Kontrolki mapy — bez GPS (odmowa dostępu)', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (
        _success: PositionCallback,
        error: PositionErrorCallback,
      ) => {
        error({ code: 1, message: 'PERMISSION_DENIED' } as GeolocationPositionError);
      };
      navigator.geolocation.watchPosition = (
        _success: PositionCallback,
        error: PositionErrorCallback,
      ) => {
        error({ code: 1, message: 'PERMISSION_DENIED' } as GeolocationPositionError);
        return 1;
      };
      navigator.geolocation.clearWatch = () => undefined;
    });
    routeVersion(context);
  });

  async function openMap(page: Page): Promise<void> {
    await openProjectViaLauncher(page);
    await expect(page.getByTestId('map-container')).toBeVisible({ timeout: 15_000 });
  }

  async function mapBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
    const box = await page.getByTestId('map-container').boundingBox();
    if (box === null) {
      throw new Error('map container not in DOM');
    }
    return box;
  }

  test('should place attribution above the scale bar in the top-left corner', async ({
    page,
  }) => {
    await openMap(page);
    const container = await mapBox(page);

    const attribution = page.getByTestId('map-attribution');
    await expect(attribution).toBeVisible({ timeout: 15_000 });
    const attributionBox = await attribution.boundingBox();
    expect(attributionBox).not.toBeNull();
    expect(attributionBox!.x - container.x).toBeLessThan(50);
    expect(attributionBox!.y - container.y).toBeLessThan(50);

    const scale = page.getByTestId('map-scale');
    await expect(scale).toBeVisible();
    const scaleBox = await scale.boundingBox();
    expect(scaleBox).not.toBeNull();
    expect(scaleBox!.x - container.x).toBeLessThan(50);
    expect(scaleBox!.y).toBeGreaterThan(attributionBox!.y);
  });

  test('should render larger 44px zoom and compass controls at top-right', async ({
    page,
  }) => {
    await openMap(page);
    const container = await mapBox(page);

    for (const testId of ['map-zoom-in', 'map-zoom-out', 'map-compass']) {
      const control = page.getByTestId(testId);
      await expect(control).toBeVisible({ timeout: 15_000 });
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      // pionowa grupa (zoom-in / zoom-out / kompas) przylega do prawej krawędzi mapy
      const offsetRight = container.x + container.width - (box!.x + box!.width);
      expect(offsetRight).toBeLessThan(20);
      expect(box!.y - container.y).toBeLessThan(160);
    }
  });

  test('should open the GPS troubleshooting modal when scale-to-20m is clicked without GPS', async ({
    page,
  }) => {
    await openMap(page);

    const button = page.getByTestId('map-scale-to-gps');
    await expect(button).toBeVisible({ timeout: 15_000 });
    await expect(button).toHaveAttribute('data-active', 'false');
    await expect(button).toHaveClass(/bg-red-600/);

    await button.click();
    await expect(page.getByTestId('gps-troubleshoot-modal')).toBeVisible();

    await page.getByTestId('gps-troubleshoot-retry').click();
    await expect(page.getByTestId('gps-troubleshoot-modal')).toBeHidden();
    await expect(button).toHaveAttribute('data-active', 'false');
  });
});

test.describe('Kontrolki mapy — GPS dostępny', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript((coords) => {
      const success = (callback: PositionCallback): void => {
        callback({
          coords: {
            latitude: coords.lat,
            longitude: coords.lng,
            accuracy: 8,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        } as GeolocationPosition);
      };
      navigator.geolocation.getCurrentPosition = (onSuccess: PositionCallback) => {
        setTimeout(() => {
          success(onSuccess);
        }, 50);
      };
      navigator.geolocation.watchPosition = (onSuccess: PositionCallback) => {
        setTimeout(() => {
          success(onSuccess);
        }, 50);
        return 1;
      };
      navigator.geolocation.clearWatch = () => undefined;
    }, GPS);

    routeVersion(context);
  });

  test('should show the GPS crosshair and fly to the position scaled to 20 m', async ({
    page,
  }) => {
    await openProjectViaLauncher(page);

    await expect(page.getByTestId('gps-crosshair')).toBeVisible({ timeout: 15_000 });
    const button = page.getByTestId('map-scale-to-gps');
    await expect(button).toHaveAttribute('data-active', 'true');

    await expect(page.getByTestId('map-container')).toHaveAttribute(
      'data-loaded',
      'true',
      { timeout: 20_000 },
    );

    await button.click();

    const expectedZoom = Math.log2(
      (40075016.686 * Math.cos((GPS.lat * Math.PI) / 180)) / (256 * (20 / (0.6 * 720))),
    );
    await expect
      .poll(async () => getZoom(page), { timeout: 10_000, message: 'zoom po skalowaniu do 20 m' })
      .toBeCloseTo(expectedZoom, 1);

    const offset = await page.evaluate((coords) => {
      const map = (window as unknown as Record<string, MapHandle | undefined>).wycinkaMap as
        | MapHandle
        | undefined;
      if (map === undefined) {
        return Number.POSITIVE_INFINITY;
      }
      const center = map.getCenter();
      return Math.max(
        Math.abs(center.lat - coords.lat),
        Math.abs(center.lng - coords.lng),
      );
    }, GPS);
    expect(offset).toBeLessThan(0.001);
  });
});
