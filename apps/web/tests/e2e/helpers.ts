import { expect, type Page } from '@playwright/test';

const TIMEOUT = 15_000;

export async function openProjectViaLauncher(page: Page): Promise<void> {
  await page.goto('/');
  const newProject = page.getByTestId('start-new-project');
  await expect(newProject).toBeVisible({ timeout: TIMEOUT });
  await newProject.click();

  const dialog = page.getByTestId('create-dialog');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('create-save').click();

  await page.waitForURL(/\/app$/, { timeout: TIMEOUT });
  await expect(page.getByTestId('map-container')).toBeVisible({ timeout: TIMEOUT });
  // §12.2: modal ustawień otwiera się automatycznie po utworzeniu projektu
  const modal = page.getByTestId('settings-modal');
  const appeared = await modal
    .waitFor({ state: 'visible', timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  if (appeared) {
    await page.getByTestId('settings-close').click();
    await expect(modal).toHaveCount(0);
  }
}

export async function openProjectViaLauncherWithFab(page: Page): Promise<void> {
  await openProjectViaLauncher(page);
  await expect(page.getByTestId('fab-add-tree')).toBeVisible({ timeout: 10_000 });
}

export async function gotoStart(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('start-new-project')).toBeVisible({ timeout: TIMEOUT });
}

export async function waitForMapIdle(page: Page): Promise<void> {
  await page
    .waitForFunction(() => {
      const map = (
        window as unknown as {
          wycinkaMap?: { isMoving(): boolean; panBy(delta: [number, number], o?: { animate?: boolean }): void };
        }
      ).wycinkaMap;
      if (map === undefined) {
        return false;
      }
      map.panBy([0, 0], { animate: false });
      return !map.isMoving();
    })
    .catch(() => {
      // mapa niegotowa / brak dev-hooka — nie blokuj scenariusza
    });
}
