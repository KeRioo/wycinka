import { expect, test } from '@playwright/test';

test.describe('Nawigacja Redesign v2 (launcher → aplikacja)', () => {
  test.beforeEach(async ({ context }) => {
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

  test('should show the launcher with three options and no global tabs', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Wycinka Drzew');
    await expect(page.getByTestId('start-new-project')).toBeVisible();
    await expect(page.getByTestId('start-all-projects')).toBeVisible();
    await expect(page.getByTestId('start-import-link')).toBeVisible();
    await expect(page.getByTestId('app-header')).toHaveCount(0);
  });

  test('should create a project from the launcher and land in the app', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-new-project').click();

    const dialog = page.getByTestId('create-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('create-name-input')).toHaveValue('Mój projekt');
    await page.getByTestId('create-name-input').fill('Las Otwock');
    await page.getByTestId('create-save').click();

    await expect(page).toHaveURL(/\/app$/, { timeout: 15_000 });
    await expect(page.getByTestId('map-container')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('fab-add-tree')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('project-chip')).toHaveText('Las Otwock');
  });

  test('should exit to start via the app menu', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-new-project').click();
    await expect(page.getByTestId('create-dialog')).toBeVisible();
    await page.getByTestId('create-save').click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 15_000 });
    await expect(page.getByTestId('map-container')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('app-menu').click();
    await expect(page.getByTestId('menu-settings')).toBeVisible();
    await expect(page.getByTestId('menu-reports')).toBeVisible();
    await page.getByTestId('menu-exit').click();

    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await expect(page.getByTestId('start-new-project')).toBeVisible();
    await expect(page.getByTestId('recent-row')).toHaveCount(1);
  });

  test('should keep launching the app without touching the /settings page from the menu', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('start-new-project').click();
    await expect(page.getByTestId('create-dialog')).toBeVisible();
    await page.getByTestId('create-save').click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 15_000 });
    await expect(page.getByTestId('map-container')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('app-menu').click();
    await page.getByTestId('menu-settings').click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 15_000 });
    await expect(page.getByTestId('map-container')).toBeVisible();
  });

  test('should reach all projects from the launcher and open a project from there', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('start-new-project').click();
    await expect(page.getByTestId('create-dialog')).toBeVisible();
    await page.getByTestId('create-save').click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 15_000 });

    await page.getByTestId('app-menu').click();
    await page.getByTestId('menu-exit').click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

    await page.getByTestId('start-all-projects').click();
    await expect(page).toHaveURL(/\/projects$/, { timeout: 15_000 });
    await page.getByTestId('project-open').first().click();

    await expect(page).toHaveURL(/\/app$/, { timeout: 15_000 });
    await expect(page.getByTestId('map-container')).toBeVisible({ timeout: 15_000 });
  });

  test('should redirect bare /app to start when no project was chosen', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await expect(page.getByTestId('start-new-project')).toBeVisible();
  });
});
