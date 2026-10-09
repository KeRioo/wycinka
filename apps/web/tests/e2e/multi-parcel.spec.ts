import { expect, test, type Page } from '@playwright/test';

function parcelBody(id: string, area: number): Record<string, unknown> {
  return {
    found: true,
    parcel: {
      id,
      teryt: id,
      number: id,
      voivodeship: 'mazowieckie',
      county: 'Warszawa',
      commune: 'Śródmieście',
      region: '0001',
      region_name: 'Obręb 0001',
      area_m2: area,
      land_use: 'Ls',
      geom: {
        type: 'Polygon',
        coordinates: [
          [
            [21.006, 52.231],
            [21.007, 52.231],
            [21.007, 52.232],
            [21.006, 52.231],
          ],
        ],
      },
      bbox: [21.006, 52.231, 21.007, 52.232],
      centroid: [21.0065, 52.2315],
      fetched_at: '2026-09-29T03:00:00Z',
      voivodeship_code: '14',
      county_code: '12',
      commune_code: '01',
      datasource: 'uldk',
    },
  };
}

async function ensureProject(page: Page): Promise<void> {
  await page.goto('/map');
  await expect(page.getByTestId('map-container')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  const createBtn = page.getByTestId('create-first-project');
  if (await createBtn.isVisible().catch(() => false)) {
    await createBtn.click({ force: true });
    await expect(page.getByText(/Brak projektu/)).not.toBeVisible({ timeout: 5_000 });
  }
  await expect(page.getByTestId('fab-add-tree')).toBeVisible({ timeout: 10_000 });
}

test.describe('Multi-parcel project', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      try {
        indexedDB.deleteDatabase('wycinka');
      } catch {
        // ignore
      }
    });
    await context.route('**/api/v1/version', (route) => {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ api: '1.0.0', data: '2026-09-29', egib_source: 'geoportal.gov.pl', etag: 'test-etag' }),
      });
    });
    await context.route('**/api/v1/pmtiles/**', (route) => {
      void route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await context.route('**/api/v1/parcel*', (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/parcel/aggregate')) {
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            type: 'MultiPolygon',
            coordinates: [
              [[[21.006, 52.231], [21.007, 52.231], [21.007, 52.232], [21.006, 52.231]]],
              [[[21.018, 52.229], [21.019, 52.229], [21.019, 52.230], [21.018, 52.229]]],
            ],
            bbox: [21.006, 52.229, 21.019, 52.232],
            area_m2: 2000,
            parcels: ['A', 'B'],
          }),
        });
        return;
      }
      const lat = Number(url.searchParams.get('lat') ?? 0);
      const isNorth = lat > 52.231;
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(isNorth ? parcelBody('141201_1.0001.6501', 1000) : parcelBody('141201_1.0001.6502', 2000)),
      });
    });
  });

  test('Should add two parcels to the project and show them on the /list page', async ({ page }) => {
    await ensureProject(page);

    const container = page.locator('[data-testid="map-container"]').first();
    const box = await container.boundingBox();
    if (box === null) {
      throw new Error('Mapa nie ma wymiarów');
    }

    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.25);
    const addNorth = page.getByTestId('add-parcel-to-project');
    await expect(addNorth).toBeVisible({ timeout: 10_000 });
    await addNorth.click();
    await expect(page.getByRole('button', { name: /Usuń z projektu/i })).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /Zamknij/i }).first().click();
    await expect(page.getByTestId('add-parcel-to-project')).toHaveCount(0);

    await page.mouse.click(box.x + (box.width / 4) * 3, box.y + box.height * 0.75);
    const addSouth = page.getByTestId('add-parcel-to-project');
    await expect(addSouth).toBeVisible({ timeout: 10_000 });
    await addSouth.click();

    await page.getByRole('link', { name: /Projekty/i }).click();
    await expect(page.getByTestId('active-project-panel')).toBeVisible();
    await expect(page.getByTestId('project-parcel-count')).toHaveText('Działki: 2');
    await expect(page.getByTestId('parcel-chip-141201_1.0001.6501')).toBeVisible();
    await expect(page.getByTestId('parcel-chip-141201_1.0001.6502')).toBeVisible();

    await page.getByRole('link', { name: /Mapa/i }).click();
    await expect(page.getByTestId('map-container')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('fab-add-tree').click({ timeout: 10_000 });
    await expect(page.getByTestId('add-tree-panel')).toBeVisible();
    await page.getByTestId('tree-species').selectOption('Dąb');
    await page.getByTestId('tree-circumference').fill('85');
    await page.getByTestId('panel-save').click();
    await expect(page.getByTestId('add-tree-panel')).not.toBeVisible({ timeout: 5_000 });

    await expect(page.getByTestId('pdf-export-toggle')).toBeEnabled({ timeout: 10_000 });
    const aggregateRequest = page
      .waitForRequest((request) => request.url().includes('/parcel/aggregate'), { timeout: 15_000 });
    await page.getByTestId('pdf-export-toggle').click();
    await expect(page.getByTestId('pdf-export-generate')).toBeEnabled();
    await page.getByTestId('pdf-export-generate').click();
    await expect(aggregateRequest).resolves.toMatchObject({});
  });

  test('Should show remove button after adding a clicked parcel', async ({ page }) => {
    await ensureProject(page);

    const container = page.locator('[data-testid="map-container"]').first();
    const box = await container.boundingBox();
    if (box === null) {
      throw new Error('Mapa nie ma wymiarów');
    }
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.25);
    await page.getByTestId('add-parcel-to-project').click({ timeout: 10_000 });
    await expect(
      page.getByRole('button', { name: /Usuń z projektu/i }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('add-parcel-to-project')).toHaveCount(0);
  });
});
