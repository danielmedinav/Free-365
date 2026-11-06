import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const body = (page: Page) => page.getByRole('textbox', { name: 'Document body' });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
/** Clicks a ribbon button, then waits for the cursor to return to the document. */
async function format(page: Page, name: string) {
  await button(page, name).click();
  await expect(body(page)).toBeFocused();
}
const saved = (page: Page) => page.getByRole('status').filter({ hasText: 'Saved locally' });

test.beforeEach(async ({ page }) => {
  // Use the plain file input and download fallbacks, which Playwright can drive.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.showOpenFilePicker;
    delete w.showSaveFilePicker;
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Blank document/ }).click();
  await expect(body(page)).toBeFocused();
});

test('the ribbon only takes up room for the selected tab', async ({ page }) => {
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
  const ribbon = await page.getByRole('tabpanel').boundingBox();
  const sheet = await body(page).boundingBox();
  expect(sheet!.y - (ribbon!.y + ribbon!.height)).toBeLessThan(40);
});

test('typed text is saved, even when reloading right away', async ({ page }) => {
  await page.keyboard.type('Hello from FreeWrite');
  await page.reload();
  await expect(body(page)).toHaveText('Hello from FreeWrite');
  await expect(page.getByText('3 words')).toBeVisible();
});

test('leaving a document right after typing keeps the text', async ({ page }) => {
  await page.keyboard.type('Quick note');
  await page.getByRole('button', { name: 'Free 360 home' }).click();
  await page.getByRole('link', { name: /Untitled document/ }).click();
  await expect(body(page)).toHaveText('Quick note');
});

test('status bar shows when work is saved', async ({ page }) => {
  await page.keyboard.type('Hi');
  await expect(saved(page)).toBeVisible();
});

test('ribbon and shortcuts format the selection', async ({ page }) => {
  await page.keyboard.type('Some text');
  await page.keyboard.press('ControlOrMeta+A');

  await button(page, 'Bold').click();
  await expect(body(page).locator('strong')).toHaveText('Some text');
  await expect(button(page, 'Bold')).toHaveAttribute('aria-pressed', 'true');
  await expect(body(page)).toBeFocused();

  await page.keyboard.press('ControlOrMeta+I');
  await expect(body(page).locator('em')).toHaveText('Some text');
  await expect(button(page, 'Italic')).toHaveAttribute('aria-pressed', 'true');

  await button(page, 'Heading 1').click();
  await expect(body(page).locator('h1')).toHaveText('Some text');

  await button(page, 'Align center').click();
  await expect(body(page).locator('h1')).toHaveCSS('text-align', 'center');
  await expect(button(page, 'Align left')).toHaveAttribute('aria-pressed', 'false');
});

test('lists work from the ribbon and by typing', async ({ page }) => {
  await format(page, 'Bulleted list');
  await page.keyboard.type('one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('two');
  await expect(body(page).locator('ul > li')).toHaveCount(2);

  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('1. first');
  await expect(body(page).locator('ol > li')).toHaveText('first');
});

test('undo and redo work from the ribbon and the keyboard', async ({ page }) => {
  await expect(button(page, 'Undo')).toBeDisabled();
  await page.keyboard.type('abc');

  await button(page, 'Undo').click();
  await expect(body(page)).not.toContainText('abc');
  await button(page, 'Redo').click();
  await expect(body(page)).toHaveText('abc');

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(body(page)).not.toContainText('abc');
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await expect(body(page)).toHaveText('abc');
});

test('undo in the title box leaves the document alone', async ({ page }) => {
  await page.keyboard.type('Body text');
  const title = page.getByRole('textbox', { name: 'Document title' });
  await title.click();
  await title.pressSequentially('X');
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(body(page)).toHaveText('Body text');
});

test('find and replace', async ({ page }) => {
  await page.keyboard.type('cat dog cat');

  await page.keyboard.press('ControlOrMeta+F');
  const find = page.getByRole('textbox', { name: 'Find', exact: true });
  await expect(find).toBeFocused();
  await find.fill('cat');
  await expect(page.getByText('1 of 2')).toBeVisible();
  await expect(page.locator('.fs-find-match')).toHaveCount(2);
  await find.press('Enter');
  await expect(page.getByText('2 of 2')).toBeVisible();
  await find.fill('zebra');
  await expect(page.getByText('No matches')).toBeVisible();

  await page.keyboard.press('ControlOrMeta+H');
  await find.fill('cat');
  await page.getByRole('textbox', { name: 'Replace with' }).fill('bird');
  await button(page, 'Replace all').click();
  await expect(body(page)).toHaveText('bird dog bird');

  await page.keyboard.press('Escape');
  await expect(find).toBeHidden();
  await expect(page.locator('.fs-find-match')).toHaveCount(0);
  await expect(body(page)).toBeFocused();

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(body(page)).toHaveText('cat dog cat');
});

test('tables can be inserted and edited', async ({ page }) => {
  await page.getByRole('tab', { name: 'Insert' }).click();
  await expect(button(page, 'Add row')).toBeDisabled();

  await format(page, 'Table');
  await expect(body(page).locator('tr')).toHaveCount(3);
  await page.keyboard.type('cell');
  await expect(body(page).locator('th').first()).toHaveText('cell');

  await button(page, 'Add row').click();
  await expect(body(page).locator('tr')).toHaveCount(4);
  await button(page, 'Add column').click();
  await expect(body(page).locator('th')).toHaveCount(4);
  await button(page, 'Delete table').click();
  await expect(body(page).locator('table')).toHaveCount(0);
});

test('images can be inserted and are saved', async ({ page }) => {
  await page.getByRole('tab', { name: 'Insert' }).click();
  const chooser = page.waitForEvent('filechooser');
  await button(page, 'Image').click();
  await (await chooser).setFiles({ name: 'dot.png', mimeType: 'image/png', buffer: PNG });
  await expect(body(page).locator('img')).toHaveAttribute('alt', 'dot.png');

  await expect(saved(page)).toBeVisible();
  await page.reload();
  await expect(body(page).locator('img')).toHaveAttribute('src', /^data:image\/png/);
});

test('rejects files that are not images, and explains why', async ({ page }) => {
  await page.getByRole('tab', { name: 'Insert' }).click();
  const chooser = page.waitForEvent('filechooser');
  await button(page, 'Image').click();
  await (await chooser).setFiles({ name: 'a.txt', mimeType: 'text/plain', buffer: PNG });
  await expect(page.getByRole('dialog')).toContainText(/isn.t a PNG/);
  await button(page, 'OK').click();
  await expect(body(page).locator('img')).toHaveCount(0);
});

test('a document survives export to .docx and import back', async ({ page }) => {
  await page.keyboard.type('Report');
  await format(page, 'Heading 1');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Plain and ');
  await page.keyboard.press('ControlOrMeta+B');
  await page.keyboard.type('bold');
  await page.keyboard.press('ControlOrMeta+B');
  await page.keyboard.press('Enter');
  await format(page, 'Align center');
  await page.keyboard.type('Centered');
  await page.keyboard.press('Enter');
  await format(page, 'Align left');
  await format(page, 'Numbered list');
  await page.keyboard.type('Item');

  const title = page.getByRole('textbox', { name: 'Document title' });
  await title.fill('My report');
  await title.press('Enter');

  await page.getByRole('tab', { name: 'File' }).click();
  const downloadEvent = page.waitForEvent('download');
  await button(page, 'Export .docx').click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('My report.docx');
  const path = await download.path();

  // Into a fresh document, which also picks up the file's name.
  await button(page, 'New document').click();
  await expect(title).toHaveValue('Untitled document');
  await page.getByRole('tab', { name: 'File' }).click();
  const chooser = page.waitForEvent('filechooser');
  await button(page, 'Import .docx').click();
  await (
    await chooser
  ).setFiles({ name: 'Imported.docx', mimeType: DOCX_MIME, buffer: readFileSync(path) });

  await expect(body(page).locator('h1')).toHaveText('Report');
  await expect(body(page).locator('strong')).toHaveText('bold');
  await expect(body(page).locator('p', { hasText: 'Centered' })).toHaveCSS('text-align', 'center');
  await expect(body(page).locator('ol > li')).toHaveText('Item');
  await expect(title).toHaveValue('Imported');
});

test('importing over existing text asks first, and can be undone', async ({ page }) => {
  await page.keyboard.type('Keep me');
  await page.getByRole('tab', { name: 'File' }).click();
  const downloadEvent = page.waitForEvent('download');
  await button(page, 'Export .docx').click();
  const path = await (await downloadEvent).path();

  await body(page).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' and more');

  const chooser = page.waitForEvent('filechooser');
  await button(page, 'Import .docx').click();
  await (
    await chooser
  ).setFiles({ name: 'Keep.docx', mimeType: DOCX_MIME, buffer: readFileSync(path) });
  const dialog = page.getByRole('dialog', { name: 'Replace this document?' });
  await dialog.getByRole('button', { name: 'Replace' }).click();
  await expect(body(page)).toHaveText('Keep me');

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(body(page)).toHaveText('Keep me and more');
});

test('a file that is not a .docx shows a message', async ({ page }) => {
  await page.getByRole('tab', { name: 'File' }).click();
  const chooser = page.waitForEvent('filechooser');
  await button(page, 'Import .docx').click();
  await (await chooser).setFiles({ name: 'bad.docx', mimeType: DOCX_MIME, buffer: PNG });
  await expect(page.getByRole('dialog')).toContainText('Could not read');
});

test('printing shows only the document', async ({ page }) => {
  await page.keyboard.type('Printed');
  await page.evaluate(() => {
    const w = window as unknown as { printCalls: number };
    w.printCalls = 0;
    window.print = () => void w.printCalls++;
  });
  await page.keyboard.press('ControlOrMeta+P');
  const calls = await page.evaluate(() => (window as unknown as { printCalls: number }).printCalls);
  expect(calls).toBe(1);

  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('tab', { name: 'Home' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Free 360 home' })).toBeHidden();
  await expect(body(page)).toBeVisible();
});
