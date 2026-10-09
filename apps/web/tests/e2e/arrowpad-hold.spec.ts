import { expect, test, type Page } from '@playwright/test';

function readDx(page: Page): Promise<number> {
  return page
    .getByTestId('nudge-status')
    .innerText()
    .then((text) => {
      const match = text.match(/Przesunięcie:\s*([+-]?\d+\.\d\d)/);
      expect(match).not.toBeNull();
      return Number(match?.[1]);
    });
}

async function openPanelWithArrowPad(page: Page): Promise<void> {
  await page.goto('/map');
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
  await page.getByTestId('fab-add-tree').click();
  await expect(page.getByTestId('add-tree-panel')).toBeVisible();
  await expect(page.getByTestId('nudge-status')).toContainText(/Przesunięcie:/);
  await page.waitForTimeout(400);
}

test.describe('ArrowPad hold-to-repeat (BACKLOG #8)', () => {
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

  test('should repeat nudges while holding arrow for over 1.2s', async ({ page }) => {
    await openPanelWithArrowPad(page);

    const dxBefore = await readDx(page);
    expect(dxBefore).toBe(0);

    const arrow = page.getByTestId('nudge-right');
    await arrow.hover();
    await page.mouse.down();
    await page.waitForTimeout(1200);
    const dxDuringHold = await readDx(page);
    await page.mouse.up();

    expect(dxDuringHold).toBeGreaterThanOrEqual(2.0);
    expect(dxDuringHold).toBeLessThanOrEqual(4.0);

    await page.waitForTimeout(400);
    const dxAfterRelease = await readDx(page);
    expect(Math.abs(dxAfterRelease - dxDuringHold)).toBeLessThanOrEqual(0.3);
  });

  test('should stop repeat after release (interval cleared)', async ({ page }) => {
    await openPanelWithArrowPad(page);

    const arrow = page.getByTestId('nudge-right');
    await arrow.hover();
    await page.mouse.down();
    await page.waitForTimeout(800);
    await page.mouse.up();

    await page.waitForTimeout(500);
    const first = await readDx(page);
    await page.waitForTimeout(500);
    const second = await readDx(page);
    expect(Math.abs(second - first)).toBeLessThanOrEqual(0.3);
    expect(first).toBeGreaterThanOrEqual(0.5);
    expect(first).toBeLessThanOrEqual(2.5);
  });

  test('soak: five sequential holds keep incrementing and never get stuck', async ({ page }) => {
    await openPanelWithArrowPad(page);

    const arrow = page.getByTestId('nudge-right');
    let previous = 0;
    for (let i = 1; i <= 5; i++) {
      await arrow.hover();
      await page.mouse.down();
      await page.waitForTimeout(600);
      await page.mouse.up();
      const dx = await readDx(page);
      expect(dx).toBeGreaterThan(previous);
      await page.waitForTimeout(300);
      const settled = await readDx(page);
      expect(Math.abs(settled - dx)).toBeLessThanOrEqual(0.3);
      previous = dx;
    }
    expect(previous).toBeGreaterThanOrEqual(2.5);
    expect(previous).toBeLessThanOrEqual(5 * 1.75);
  });
});
