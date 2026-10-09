import { expect, test } from '@playwright/test';

test.describe('Rename project flow', () => {
  test.beforeEach(async ({ context }) => {
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
  });

  async function createProject(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/projects');
    await expect(page.getByTestId('new-project')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('new-project').click();
    await expect(page.getByTestId('create-dialog')).toBeVisible();
    await expect(page.getByTestId('create-name-input')).toHaveValue('Mój pierwszy projekt');
    await page.getByTestId('create-save').click();
    await expect(page.getByTestId('map-container')).toBeVisible({ timeout: 15_000 });
  }

  test('should create project with default name, rename card, persist after reload', async ({ page }) => {
    await createProject(page);

    await page.goto('/projects');
    await expect(page.getByTestId('project-card')).toContainText('Mój pierwszy projekt');

    await page.getByTestId('project-rename').click();
    await expect(page.getByTestId('rename-dialog')).toBeVisible();
    await expect(page.getByTestId('rename-input')).toHaveValue('Mój pierwszy projekt');

    await page.getByTestId('rename-input').fill('Las Otwock');
    await page.getByTestId('rename-save').click();
    await expect(page.getByTestId('rename-dialog')).not.toBeVisible();
    await expect(page.getByTestId('project-card')).toContainText('Las Otwock');

    await page.reload();
    await expect(page.getByTestId('project-card')).toContainText('Las Otwock');
    await expect(page.getByTestId('project-card')).not.toContainText('Mój pierwszy projekt');
  });

  test('should cancel rename and keep original name', async ({ page }) => {
    await createProject(page);
    await page.goto('/projects');
    await expect(page.getByTestId('project-card')).toContainText('Mój pierwszy projekt');

    await page.getByTestId('project-rename').click();
    await expect(page.getByTestId('rename-dialog')).toBeVisible();
    await page.getByTestId('rename-input').fill('Inna nazwa');
    await page.getByTestId('rename-cancel').click();
    await expect(page.getByTestId('rename-dialog')).not.toBeVisible();
    await expect(page.getByTestId('project-card')).toContainText('Mój pierwszy projekt');

    await page.reload();
    await expect(page.getByTestId('project-card')).toContainText('Mój pierwszy projekt');
  });

  test('should show validation error for empty name and not persist', async ({ page }) => {
    await createProject(page);
    await page.goto('/projects');
    await page.getByTestId('project-rename').click();
    await expect(page.getByTestId('rename-dialog')).toBeVisible();

    await page.getByTestId('rename-input').fill('   ');
    await page.getByTestId('rename-save').click();
    await expect(page.getByTestId('rename-error')).toBeVisible();
    await expect(page.getByTestId('rename-dialog')).toBeVisible();
  });
});
