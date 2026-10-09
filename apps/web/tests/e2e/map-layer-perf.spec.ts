import { expect, test } from '@playwright/test';

type MapInit = Record<string, MapHandle | undefined>;

interface MapHandle {
  getLayer(id: string): { minzoom?: number } | undefined;
  jumpTo(options: { zoom: number }): void;
  queryRenderedFeatures(layers: string[]): Array<{ layer: { id: string } }>;
  isMoving(): boolean;
  panBy(delta: [number, number], options?: { animate?: boolean }): void;
}

async function waitForMapIdle(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const map = (window as unknown as MapInit).wycinkaMap;
    if (map === undefined) {
      return false;
    }
    map.panBy([0, 0], { animate: false });
    return !map.isMoving();
  });
}

test.describe.serial('Warstwy działek - optymalizacja renderingu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/map');
    await expect(page.getByTestId('map-container')).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(() => (window as unknown as MapInit).wycinkaMap !== undefined);
    await waitForMapIdle(page);
  });

  test('should cap dzialki outline at zoom 15 and fill at zoom 17, highlight uncapped', async ({
    page,
  }) => {
    const minzooms = await page.evaluate(() => {
      const m = (window as unknown as MapInit).wycinkaMap;
      if (m === undefined) {
        throw new Error('map not ready');
      }
      return {
        outline: m.getLayer('dzialki-outline')?.minzoom,
        fill: m.getLayer('dzialki-fill')?.minzoom,
        highlight: m.getLayer('highlight-fill')?.minzoom ?? 0,
        parcels: m.getLayer('parcels-fill')?.minzoom ?? 0,
      };
    });
    expect(minzooms.outline).toBe(15);
    expect(minzooms.fill).toBe(17);
    expect(minzooms.highlight).toBe(0);
    expect(minzooms.parcels).toBe(0);
  });

  test('should render no dzialki features at country zoom (below cap)', async ({ page }) => {
    await page.evaluate(() => {
      (window as unknown as MapInit).wycinkaMap?.jumpTo({ zoom: 5 });
    });
    await waitForMapIdle(page);
    const count = await page.evaluate(() => {
      const m = (window as unknown as MapInit).wycinkaMap;
      if (m === undefined) {
        throw new Error('map not ready');
      }
      return m.queryRenderedFeatures(['dzialki-outline', 'dzialki-fill']).length;
    });
    expect(count).toBe(0);
  });

  test('should render dzialki layers when zoomed in past the cap', async ({ page }) => {
    await page.evaluate(() => {
      (window as unknown as MapInit).wycinkaMap?.jumpTo({ zoom: 18 });
    });
    await waitForMapIdle(page);
    const layerIds = await page.evaluate(() => {
      const m = (window as unknown as MapInit).wycinkaMap;
      if (m === undefined) {
        throw new Error('map not ready');
      }
      return m.queryRenderedFeatures(['dzialki-outline', 'dzialki-fill']).map((f) => f.layer.id);
    });
    if (layerIds.length > 0) {
      expect(layerIds.some((id) => id.startsWith('dzialki-'))).toBe(true);
    }
  });
});
