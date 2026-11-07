import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const LINE =
  'This sentence is here to fill the page with enough ordinary text that the paragraph wraps ' +
  'onto several lines and the document grows past the end of the sheet it started on. ';

const body = (page: Page) => page.getByRole('textbox', { name: 'Document body' });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const tab = (page: Page, name: string) => page.getByRole('tab', { name }).click();
const sheets = (page: Page) => page.locator('.fs-sheet');
const saved = (page: Page) => page.getByRole('status').filter({ hasText: 'Saved locally' });
const nextFrame = (page: Page) => page.evaluate(() => new Promise(requestAnimationFrame));

async function fill(page: Page, paragraphs: number) {
  for (let i = 0; i < paragraphs; i++) {
    await page.keyboard.insertText(`Paragraph ${i + 1}. ${LINE}`);
    await page.keyboard.press('Enter');
  }
}

async function heading(page: Page, text: string, level = 1) {
  await page.keyboard.type(text);
  await page.keyboard.press(`ControlOrMeta+Alt+${level}`);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(30);
}

async function addFootnote(page: Page, text: string) {
  await page.keyboard.press('ControlOrMeta+Alt+F');
  const dialog = page.getByRole('dialog', { name: 'Footnote' });
  await dialog.getByRole('textbox').fill(text);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(body(page)).toBeFocused();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.showOpenFilePicker;
    delete w.showSaveFilePicker;
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Blank document/ }).click();
  await expect(body(page)).toBeFocused();
});

test('spell check is on by default, and the choice is remembered', async ({ page }) => {
  await expect(body(page)).toHaveAttribute('spellcheck', 'true');
  await expect(button(page, 'Spell check')).toHaveAttribute('aria-pressed', 'true');

  await button(page, 'Spell check').click();
  await expect(body(page)).toHaveAttribute('spellcheck', 'false');
  await expect(button(page, 'Spell check')).toHaveAttribute('aria-pressed', 'false');

  await page.reload();
  await expect(body(page)).toHaveAttribute('spellcheck', 'false');
  await button(page, 'Spell check').click();
  await expect(body(page)).toHaveAttribute('spellcheck', 'true');
});

test('symbols go in at the cursor', async ({ page }) => {
  await page.keyboard.type('Price: ');
  await tab(page, 'Insert');
  await button(page, 'Symbol').click();
  await page.getByRole('button', { name: 'Insert €' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(body(page)).toBeFocused();
  await page.keyboard.type('5');
  await expect(body(page)).toHaveText('Price: €5');
});

test('footnotes number themselves and print at the bottom of their page', async ({ page }) => {
  await page.keyboard.type('First');
  await addFootnote(page, 'The first note');
  await page.keyboard.type(' and second');
  await addFootnote(page, 'The second note');

  const marks = body(page).locator('.fs-footnote');
  await expect(marks).toHaveCount(2);
  const notes = page.locator('.fs-footnotes .fs-footnote-line');
  await expect(notes).toHaveText(['1. The first note', '2. The second note']);

  // Sits at the bottom of the sheet's text area.
  const sheet = (await sheets(page).first().boundingBox())!;
  const area = (await page.locator('.fs-footnotes').boundingBox())!;
  expect(area.y + area.height).toBeCloseTo(sheet.y + sheet.height - 96, 0);

  // Adding one earlier in the text renumbers the rest.
  await page.keyboard.press('ControlOrMeta+Home');
  await page.waitForTimeout(50);
  await addFootnote(page, 'A new first note');
  await expect(notes).toHaveText([
    '1. A new first note',
    '2. The first note',
    '3. The second note',
  ]);
  const content = await marks.first().evaluate((mark) => getComputedStyle(mark, '::after').content);
  expect(content).toContain('counter');
});

test('clicking a footnote number edits it; emptying it removes it', async ({ page }) => {
  await page.keyboard.type('Text');
  await addFootnote(page, 'Original note');

  await body(page).locator('.fs-footnote').click();
  const dialog = page.getByRole('dialog', { name: 'Footnote' });
  await expect(dialog.getByRole('textbox')).toHaveValue('Original note');
  await dialog.getByRole('textbox').fill('Changed note');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.fs-footnote-line')).toHaveText('1. Changed note');

  await body(page).locator('.fs-footnote').click();
  await dialog.getByRole('textbox').fill('');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(body(page).locator('.fs-footnote')).toHaveCount(0);
  await expect(page.locator('.fs-footnotes')).toHaveCount(0);
  await expect(body(page)).toHaveText('Text');
});

test('text never runs into a page’s footnotes', async ({ page }) => {
  await page.keyboard.insertText('Start of the document');
  await addFootnote(page, `A long note. ${LINE.repeat(4)}`);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  for (let i = 0; i < 30 && (await sheets(page).count()) < 2; i++) {
    await fill(page, 1);
    await nextFrame(page);
    await nextFrame(page);
  }
  await expect(sheets(page)).toHaveCount(2);

  const overlap = await page.evaluate(() => {
    const area = document.querySelector('.fs-footnotes')!.getBoundingClientRect();
    const firstSheet = document.querySelector('.fs-sheet')!.getBoundingClientRect();
    const range = document.createRange();
    const walker = document.createTreeWalker(
      document.querySelector('.tiptap')!,
      NodeFilter.SHOW_TEXT,
    );
    let lowest = 0;
    while (walker.nextNode()) {
      range.selectNodeContents(walker.currentNode);
      for (const line of range.getClientRects()) {
        if (line.top < firstSheet.bottom) lowest = Math.max(lowest, line.bottom);
      }
    }
    return { lowest, notesTop: area.top };
  });
  expect(overlap.lowest).toBeLessThanOrEqual(overlap.notesTop + 1);
});

test('a footnote appears on the page where its number is', async ({ page }) => {
  await page.keyboard.insertText('Early text');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ControlOrMeta+Enter');
  await page.keyboard.type('On page two');
  await addFootnote(page, 'Second page note');
  await expect(sheets(page)).toHaveCount(2);
  await expect(sheets(page).nth(0).locator('.fs-footnote-line')).toHaveCount(0);
  await expect(sheets(page).nth(1).locator('.fs-footnote-line')).toHaveText('1. Second page note');
});

test('the table of contents lists headings with their page numbers', async ({ page }) => {
  await tab(page, 'Insert');
  await button(page, 'Contents').click();
  const toc = body(page).locator('.fs-toc');
  await expect(toc).toContainText('Headings you add will be listed here');
  await expect(body(page)).toBeFocused();

  await page.keyboard.press('ControlOrMeta+End');
  await page.waitForTimeout(50);
  await heading(page, 'Introduction');
  await page.keyboard.press('ControlOrMeta+Enter');
  await heading(page, 'Details', 2);

  const entries = toc.locator('.fs-toc-entry');
  await expect(entries).toHaveCount(2);
  await expect(entries.nth(0)).toHaveText('Introduction1');
  await expect(entries.nth(1)).toHaveText('Details2');

  // Stays current as the headings change.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('End');
  await page.keyboard.type(' and more');
  await expect(entries.nth(1)).toHaveText('Details and more2');

  // Clicking an entry goes to the heading.
  await page.keyboard.press('ControlOrMeta+Home');
  await entries.nth(1).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await expect(body(page)).toBeFocused();
});

test('typing right after inserting contents goes after it', async ({ page }) => {
  await page.keyboard.type('Intro');
  await page.keyboard.press('Enter');
  await tab(page, 'Insert');
  await button(page, 'Contents').click();
  await expect(body(page)).toBeFocused();
  await page.keyboard.type('Afterwards');
  await expect(body(page).locator('.fs-toc')).toHaveCount(1);
  await expect(body(page).locator('p').last()).toHaveText('Afterwards');
});

test('table of contents numbers follow pages as text pushes headings down', async ({ page }) => {
  await tab(page, 'Insert');
  await button(page, 'Contents').click();
  await expect(body(page).locator('.fs-toc')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+End');
  await page.waitForTimeout(50);
  await heading(page, 'Far heading');
  const entry = body(page).locator('.fs-toc-entry');
  await expect(entry).toHaveText('Far heading1');

  // Push it onto a later page by adding text above it.
  await body(page).locator('h1').click();
  await page.keyboard.press('Home');
  await page.waitForTimeout(30);
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(sheets(page)).toHaveCount(2);
  await expect(entry).toHaveText('Far heading2');
});

test('columns flow text side by side, and can be turned off', async ({ page }) => {
  await fill(page, 4);
  await page.keyboard.press('ControlOrMeta+A');
  await tab(page, 'Layout');
  const columns = page.getByRole('combobox', { name: 'Columns' });
  await columns.selectOption('2 columns');

  const section = body(page).locator('.fs-columns');
  await expect(section).toHaveCSS('column-count', '2');
  await expect(columns).toHaveValue('write.columns-2');

  // Some text really is in the right-hand column.
  const paragraphs = section.locator('p');
  const first = (await paragraphs.first().boundingBox())!;
  const last = (await paragraphs.last().boundingBox())!;
  expect(last.x).toBeGreaterThan(first.x + first.width);

  await columns.selectOption('3 columns');
  await expect(section).toHaveCSS('column-count', '3');

  await columns.selectOption('One column');
  await expect(section).toHaveCount(0);
  await expect(body(page).locator('p').first()).toContainText('Paragraph 1.');
});

test('footnotes and contents survive a reload', async ({ page }) => {
  await tab(page, 'Insert');
  await button(page, 'Contents').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.waitForTimeout(50);
  await heading(page, 'Kept heading');
  await page.keyboard.type('Noted');
  await addFootnote(page, 'Kept note');
  await expect(saved(page)).toBeVisible();

  await page.reload();
  await expect(body(page).locator('.fs-toc-entry')).toHaveText('Kept heading1');
  await expect(page.locator('.fs-footnote-line')).toHaveText('1. Kept note');
});

test('everything survives .docx export and import in the browser', async ({ page }) => {
  await tab(page, 'Insert');
  await button(page, 'Contents').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.waitForTimeout(50);
  await heading(page, 'Chapter');
  await page.keyboard.type('Noted text');
  await addFootnote(page, 'Exported note');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Column text');
  await tab(page, 'Layout');
  await page.getByRole('combobox', { name: 'Columns' }).selectOption('2 columns');
  await expect(body(page).locator('.fs-columns')).toBeVisible();

  await tab(page, 'File');
  const downloadEvent = page.waitForEvent('download');
  await button(page, 'Export .docx').click();
  const path = await (await downloadEvent).path();

  await button(page, 'New document').click();
  await expect(page.getByRole('textbox', { name: 'Document title' })).toHaveValue(
    'Untitled document',
  );
  await expect(body(page).locator('.fs-toc')).toHaveCount(0);
  await tab(page, 'File');
  const chooser = page.waitForEvent('filechooser');
  await button(page, 'Import .docx').click();
  await (
    await chooser
  ).setFiles({ name: 'Round.docx', mimeType: DOCX_MIME, buffer: readFileSync(path) });

  await expect(body(page).locator('.fs-toc-entry')).toHaveText('Chapter1');
  await expect(page.locator('.fs-footnote-line')).toHaveText('1. Exported note');
  await expect(body(page).locator('.fs-columns')).toContainText('Column text');
  await expect(body(page).locator('.fs-columns')).toHaveCSS('column-count', '2');
});

test('printing keeps footnotes on their pages', async ({ page }) => {
  await page.keyboard.type('One');
  await addFootnote(page, 'Printed note');
  await page.keyboard.press('ControlOrMeta+Enter');
  await page.keyboard.type('Two');
  await expect(sheets(page)).toHaveCount(2);

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.fs-footnote-line')).toBeVisible();
  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString('latin1');
  expect(pdf.match(/\/Type\s*\/Page[^s]/g)).toHaveLength(2);
});
