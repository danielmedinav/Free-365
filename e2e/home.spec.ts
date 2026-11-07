import { expect, test, type Page } from '@playwright/test';

async function createDoc(page: Page, noun: 'document' | 'spreadsheet' | 'presentation') {
  await page.getByRole('button', { name: new RegExp(`Blank ${noun}`) }).click();
  await expect(page.getByRole('textbox', { name: 'Document title' })).toBeVisible();
}

async function goHome(page: Page) {
  await page.getByRole('button', { name: 'Free 360 home' }).click();
  await expect(page.getByRole('heading', { name: 'Recent files' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('shows an empty state on first visit', async ({ page }) => {
  await expect(page.getByText('No files yet.')).toBeVisible();
});

test('creates a document, renames it from the title bar, and lists it', async ({ page }) => {
  await createDoc(page, 'document');
  await expect(page).toHaveURL(/\/write\/[\w-]+$/);

  const title = page.getByRole('textbox', { name: 'Document title' });
  await expect(title).toHaveValue('Untitled document');
  await title.click();
  await title.fill('Trip notes');
  await title.press('Enter');

  await goHome(page);
  const row = page.getByRole('list', { name: 'Files' }).getByRole('listitem');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Trip notes');
  await expect(row).toContainText('FreeWrite');
});

test('files persist across reloads and open from the list', async ({ page }) => {
  await createDoc(page, 'spreadsheet');
  await goHome(page);
  await page.reload();
  await page.getByRole('link', { name: /Untitled spreadsheet/ }).click();
  await expect(page).toHaveURL(/\/grid\//);
  await expect(page.getByRole('grid')).toBeVisible();
});

test('renames and deletes from the file menu', async ({ page }) => {
  await createDoc(page, 'presentation');
  await goHome(page);

  await page.getByRole('button', { name: 'More actions for Untitled presentation' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rename' });
  await dialog.getByRole('textbox').fill('Pitch');
  await dialog.getByRole('button', { name: 'Rename' }).click();
  await expect(page.getByRole('link', { name: /Pitch/ })).toBeVisible();

  await page.getByRole('button', { name: 'More actions for Pitch' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No files yet.')).toBeVisible();
});

test('filters and searches across apps', async ({ page }) => {
  for (const noun of ['document', 'spreadsheet', 'presentation'] as const) {
    await createDoc(page, noun);
    await goHome(page);
  }
  const rows = page.getByRole('list', { name: 'Files' }).getByRole('listitem');
  await expect(rows).toHaveCount(3);

  await page.getByRole('button', { name: 'Spreadsheets' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('FreeGrid');

  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('searchbox').fill('presentation');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Untitled presentation');
});

test('editor File tab: shortcuts and delete', async ({ page }) => {
  await createDoc(page, 'document');

  await page.locator('main').click();
  await page.keyboard.press('F2');
  const dialog = page.getByRole('dialog', { name: 'Rename document' });
  const input = dialog.getByRole('textbox');
  await input.fill('Shortcut name');
  await input.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Document title' })).toHaveValue('Shortcut name');

  await page.getByRole('tab', { name: 'File' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('No files yet.')).toBeVisible();
});

test('theme toggle persists and has a shortcut', async ({ page }) => {
  const html = page.locator('html');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(html).toHaveAttribute('data-theme', 'light');

  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await page.keyboard.press('Alt+Shift+D');
  await expect(html).toHaveAttribute('data-theme', 'light');
});

test('shows not found for unknown documents', async ({ page }) => {
  await page.goto('/write/does-not-exist');
  await expect(page.getByRole('heading', { name: 'File not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to all files' }).click();
  await expect(page.getByRole('heading', { name: 'Recent files' })).toBeVisible();
});
