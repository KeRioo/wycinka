import { expect, test, type Page } from '@playwright/test';

const MOCK_SEARCH = {
  results: [
    {
      id: '141201_1.0001.6509',
      teryt: '141201_1.0001.6509',
      label: '141201_1.0001.6509 — Obręb 0001, Warszawa',
      score: 0.95,
    },
  ],
  total: 1,
};

const MOCK_PARCEL_BODY = {
  found: true,
  parcel: {
    id: '141201_1.0001.6509',
    teryt: '141201_1.0001.6509',
    number: '6509',
    voivodeship: 'mazowieckie',
    county: 'Warszawa',
    commune: 'Śródmieście',
    region: '0001',
    region_name: 'Obręb 0001',
    area_m2: 1234.56,
    land_use: 'Ls',
    geom: {
      type: 'Polygon',
      coordinates: [
        [
          [21.006, 52.231],
          [21.007, 52.231],
          [21.007, 52.232],
          [21.006, 52.232],
          [21.006, 52.231],
        ],
      ],
    },
    bbox: [21.006, 52.231, 21.007, 52.232],
    centroid: [21.0065, 52.2315],
    fetched_at: '2026-10-09T00:00:00Z',
    voivodeship_code: '14',
    county_code: '12',
    commune_code: '01',
    datasource: 'uldk',
  },
};

async function mockApi(page: Page): Promise<void> {
  await page.route('**/api/v1/version', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        api: '1.0.0',
        data: '2026-10-09',
        egib_source: 'geoportal.gov.pl',
        etag: 'test-etag',
      }),
    });
  });
  await page.route('**/api/v1/pmtiles/**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/octet-stream', body: '' });
  });
  await page.route('**/api/v1/search*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_SEARCH),
    });
  });
  await page.route('**/api/v1/parcel/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_PARCEL_BODY),
    });
  });
}

test.describe('Search navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test('should search a parcel and navigate to map after selecting a suggestion', async ({
    page,
  }) => {
    await page.goto('/');
    const input = page.getByTestId('search-input');
    await expect(input).toBeVisible();

    await input.fill('1412');
    const option = page.getByRole('option', { name: /141201_1.0001.6509/i }).first();
    await expect(option).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('search-skeleton')).toHaveCount(0);

    await option.click();

    await expect(page).toHaveURL(/\/map$/, { timeout: 10_000 });
    await expect(page.getByTestId('map-container')).toBeVisible({ timeout: 15_000 });
  });

  test('should select a suggestion via keyboard and end up on the map', async ({ page }) => {
    await page.goto('/');
    const input = page.getByTestId('search-input');
    await input.fill('1412');
    await input.press('Escape');
    const option = page.getByRole('option', { name: /141201_1.0001.6509/i }).first();
    await expect(option).toHaveCount(0);

    await input.fill('1412');
    await expect(option).toBeVisible({ timeout: 10_000 });
    await input.press('ArrowDown');
    await input.press('Enter');

    await expect(page).toHaveURL(/\/map$/, { timeout: 10_000 });
    await expect(page.getByTestId('map-container')).toBeVisible({ timeout: 15_000 });
  });

  test('should hide suggestions while loading and show them after debounce', async ({ page }) => {
    await page.goto('/');
    const input = page.getByTestId('search-input');

    await input.fill('1');
    await page.waitForTimeout(900);
    await expect(page.getByRole('option')).toHaveCount(0);
    await expect(page.getByTestId('search-skeleton')).toHaveCount(0);

    await input.fill('1412');
    const option = page.getByRole('option', { name: /141201_1.0001.6509/i }).first();
    await expect(option).toBeVisible({ timeout: 10_000 });
  });
});
