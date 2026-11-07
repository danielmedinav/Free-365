import { expect, test, type Page } from '@playwright/test';

const body = (page: Page) => page.getByRole('textbox', { name: 'Document body' });
const sheets = (page: Page) => page.locator('.fs-sheet');
const saved = (page: Page) => page.getByRole('status').filter({ hasText: 'Saved locally' });
const select = (page: Page, name: string) => page.getByRole('combobox', { name, exact: true });

const LONG_LINE =
  'This sentence is here to fill the page with enough ordinary text that the paragraph wraps ' +
  'onto several lines and the document grows past the end of the sheet it started on. ';

/** Adds whole paragraphs at once, which keeps tests fast. */
async function fillParagraphs(page: Page, count: number) {
  for (let i = 0; i < count; i++) {
    await page.keyboard.insertText(`Paragraph ${i + 1}. ${LONG_LINE}`);
    await page.keyboard.press('Enter');
  }
}

/** Adds paragraphs until the document reaches the given number of pages. */
async function fillPages(page: Page, count: number) {
  for (let i = 0; i < 200 && (await sheets(page).count()) < count; i++) {
    await fillParagraphs(page, 2);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  await expect(sheets(page)).toHaveCount(count);
}

/** Every line of text sits inside the text area of some sheet, never across a gap. */
async function expectTextInsidePages(page: Page) {
  // Pages settle in the frame after a change, before the browser paints it.
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const problems = await page.evaluate(() => {
    const root = document.querySelector('.tiptap') as HTMLElement;
    const sheetList = Array.from(document.querySelectorAll('.fs-sheet')).map((s) =>
      s.getBoundingClientRect(),
    );
    const style = getComputedStyle(root);
    const marginTop = parseFloat(style.paddingTop);
    const marginBottom = parseFloat(style.paddingBottom);
    const range = document.createRange();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const found: string[] = [];
    while (walker.nextNode()) {
      range.selectNodeContents(walker.currentNode);
      for (const line of range.getClientRects()) {
        const inside = sheetList.some(
          (sheet) =>
            line.top >= sheet.top + marginTop - 2 && line.bottom <= sheet.bottom - marginBottom + 3,
        );
        if (!inside) found.push(`${Math.round(line.top)}-${Math.round(line.bottom)}`);
      }
    }
    return found;
  });
  expect(problems).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  // Use the plain file input, which Playwright can drive.
  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).showOpenFilePicker;
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Blank document/ }).click();
  await expect(body(page)).toBeFocused();
});

test('a new document is one page', async ({ page }) => {
  await expect(sheets(page)).toHaveCount(1);
  await expect(page.getByText('Page 1 of 1')).toBeVisible();
});

test('long documents flow onto new pages, with no text across a gap', async ({ page }) => {
  await fillPages(page, 3);
  await expectTextInsidePages(page);

  // The cursor is at the end, so it's on the last page.
  await expect(page.getByText('Page 3 of 3')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+Home');
  await expect(page.getByText('Page 1 of 3')).toBeVisible();
});

test('one long paragraph splits between its lines', async ({ page }) => {
  await page.keyboard.insertText(LONG_LINE.repeat(40));
  await expect(sheets(page)).toHaveCount(2);
  await expect(body(page).locator('p')).toHaveCount(1);
  await expectTextInsidePages(page);

  // It really filled the first page, rather than moving the whole paragraph.
  const firstSheet = await sheets(page).first().boundingBox();
  const paragraph = await body(page).locator('p').boundingBox();
  expect(paragraph!.y).toBeLessThan(firstSheet!.y + 100);
});

test('pages go away again when text is removed', async ({ page }) => {
  await fillParagraphs(page, 20);
  await expect(sheets(page)).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
  await expect(sheets(page)).toHaveCount(1);
  await expect(page.locator('.fs-page-gap')).toHaveCount(0);
});

test('typing at a page boundary and moving across it work', async ({ page }) => {
  await page.keyboard.insertText(LONG_LINE.repeat(40));
  await expect(sheets(page)).toHaveCount(2);

  // Walk the cursor back past the boundary, then forward again, and type there.
  await page.keyboard.press('ControlOrMeta+Home');
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  for (let i = 0; i < 80 && !(await page.getByText('Page 2 of 2').isVisible()); i++) {
    await page.keyboard.press('ArrowDown');
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByText('Page 1 of 2')).toBeVisible();

  await page.keyboard.type('MARKER');
  await expect(body(page)).toContainText('MARKER');
  await expect(sheets(page)).toHaveCount(2);
  await expectTextInsidePages(page);
});

test('page breaks start a new page, and pages go when deleted', async ({ page }) => {
  await page.keyboard.type('First');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(sheets(page)).toHaveCount(2);
  await page.keyboard.type('Second');

  // Measures the text itself: the paragraph's box also holds the spacer above it.
  const top = await body(page)
    .locator('p', { hasText: 'Second' })
    .evaluate((paragraph) => {
      const range = document.createRange();
      range.selectNodeContents(paragraph.lastChild!);
      return range.getBoundingClientRect().top;
    });
  const sheet = await sheets(page).nth(1).boundingBox();
  expect(top).toBeGreaterThanOrEqual(sheet!.y + 90);
  expect(top).toBeLessThan(sheet!.y + 110);

  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
  await expect(sheets(page)).toHaveCount(1);
});

test('page break from the Layout tab', async ({ page }) => {
  await page.keyboard.type('First');
  await page.getByRole('tab', { name: 'Layout' }).click();
  await page.getByRole('button', { name: 'Page break', exact: true }).click();
  await expect(sheets(page)).toHaveCount(2);
  await expect(body(page)).toBeFocused();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await page.keyboard.type('Next');
  await expect(body(page).locator('p').last()).toHaveText('Next');
});

test('a page break in the middle of a paragraph splits it', async ({ page }) => {
  await page.keyboard.type('OneTwo');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
  // The editor notices a moved cursor a moment later than the browser does.
  await page.waitForTimeout(50);
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(sheets(page)).toHaveCount(2);
  await expect(body(page).locator('p')).toHaveText(['One', 'Two']);
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
});

test('a page break on an empty line keeps the cursor on the new page', async ({ page }) => {
  await page.keyboard.type('First');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(sheets(page)).toHaveCount(2);
  await page.keyboard.type('Second');

  // Typing must not replace the break.
  await expect(body(page).locator('hr.fs-page-break')).toHaveCount(1);
  await expect(sheets(page)).toHaveCount(2);
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await expect(body(page).locator('p', { hasText: 'Second' })).toHaveCount(1);
});

test('Shift+Enter makes a line break, not a page', async ({ page }) => {
  await page.keyboard.type('One');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Two');
  await expect(body(page).locator('p br')).toHaveCount(1);
  await expect(sheets(page)).toHaveCount(1);
});

test('paper size and orientation change the sheet, and are undoable', async ({ page }) => {
  await page.getByRole('tab', { name: 'Layout' }).click();
  const size = async () => (await sheets(page).first().boundingBox())!;

  expect((await size()).width).toBeCloseTo(816, 0);
  expect((await size()).height).toBeCloseTo(1056, 0);

  await select(page, 'Orientation').selectOption('Landscape');
  await expect(select(page, 'Orientation')).toHaveValue('write.orientation-landscape');
  await expect.poll(async () => (await size()).width).toBeCloseTo(1056, 0);
  expect((await size()).height).toBeCloseTo(816, 0);

  await select(page, 'Paper size').selectOption('A4');
  await expect(select(page, 'Paper size')).toHaveValue('write.pageSize-a4');
  await expect.poll(async () => (await size()).width).toBeCloseTo(11.69 * 96, 0);

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(select(page, 'Paper size')).toHaveValue('write.pageSize-letter');
  await expect.poll(async () => (await size()).width).toBeCloseTo(1056, 0);
});

test('margin presets move the text and reflow the pages', async ({ page }) => {
  await fillParagraphs(page, 20);
  await expect(sheets(page)).toHaveCount(2);

  await page.getByRole('tab', { name: 'Layout' }).click();
  await select(page, 'Margins').selectOption('Narrow margins');
  await expect(body(page)).toHaveCSS('padding-left', '48px');
  await expect(sheets(page)).toHaveCount(1);
  await expectTextInsidePages(page);

  await select(page, 'Margins').selectOption('Wide margins');
  await expect(body(page)).toHaveCSS('padding-left', '192px');
  await expect(sheets(page)).toHaveCount(2);
  await expectTextInsidePages(page);
});

test('exact margins, header, footer, and page numbers from the setup dialog', async ({ page }) => {
  await page.keyboard.type('Body');
  await page.keyboard.press('ControlOrMeta+Enter');
  await page.getByRole('tab', { name: 'Layout' }).click();
  await select(page, 'Page numbers').selectOption('Numbers in footer');

  await page.getByRole('button', { name: 'Margins, header, and footer' }).click();
  const dialog = page.getByRole('dialog', { name: 'Page setup' });
  await dialog.getByLabel('Left').fill('1.5');
  await dialog.getByLabel('Header text').fill('My header');
  await dialog.getByLabel('Footer text').fill('My footer');
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(body(page)).toHaveCSS('padding-left', '144px');
  await expect(select(page, 'Margins').locator('option:checked')).toHaveText('Custom margins');
  await expect(page.locator('.fs-page-header')).toHaveText(['My header', 'My header']);
  await expect(page.locator('.fs-page-footer').nth(0)).toHaveText('My footer1');
  await expect(page.locator('.fs-page-footer').nth(1)).toHaveText('My footer2');

  await expect(saved(page)).toBeVisible();
  await page.reload();
  await expect(page.locator('.fs-page-footer').nth(1)).toHaveText('My footer2');
  await expect(body(page)).toHaveCSS('padding-left', '144px');
  await expect(sheets(page)).toHaveCount(2);
});

test('images move to the next page whole', async ({ page }) => {
  await fillParagraphs(page, 12);
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 500;
    return canvas.toDataURL('image/png');
  });
  await page.getByRole('tab', { name: 'Insert' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: 'big.png',
    mimeType: 'image/png',
    buffer: Buffer.from(dataUrl.split(',')[1]!, 'base64'),
  });

  await expect(sheets(page)).toHaveCount(2);
  const image = body(page).locator('img');
  await expect(image).toBeVisible();
  const box = (await image.boundingBox())!;
  const sheet = (await sheets(page).nth(1).boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(sheet.y + 94);
  expect(box.y + box.height).toBeLessThanOrEqual(sheet.y + sheet.height - 94);
});

test('table rows move to the next page whole, with nothing across the gap', async ({ page }) => {
  await fillParagraphs(page, 10);
  await page.getByRole('tab', { name: 'Insert' }).click();
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(body(page).locator('table')).toBeVisible();
  await page.waitForTimeout(50);
  await page.getByRole('tab', { name: 'Table' }).click();
  for (let i = 0; i < 30; i++) {
    await page.getByRole('button', { name: 'Add row' }).click();
  }
  await expect(sheets(page)).toHaveCount(2);
  await expectTextInsidePages(page);

  const crossing = await page.evaluate(() => {
    const pages = Array.from(document.querySelectorAll('.fs-sheet')).map((sheet) =>
      sheet.getBoundingClientRect(),
    );
    return Array.from(document.querySelectorAll('.tiptap td, .tiptap th')).filter((cell) => {
      const { top, bottom } = cell.getBoundingClientRect();
      return !pages.some((sheet) => top >= sheet.top && bottom <= sheet.bottom);
    }).length;
  });
  expect(crossing).toBe(0);

  // Cells stay in their columns, despite the extra row between them.
  const columns = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.tiptap tr')).map((row) => row.children.length),
  );
  expect(columns.every((count) => count === 3)).toBe(true);

  // Editing still works across the break.
  await body(page).locator('tr').last().locator('td').first().click();
  await page.keyboard.type('Last row');
  await expect(body(page).locator('tr').last()).toContainText('Last row');
});

test('printing produces one PDF page per sheet at the chosen paper size', async ({ page }) => {
  await fillPages(page, 3);

  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const text = pdf.toString('latin1');
  expect(text.match(/\/Type\s*\/Page[^s]/g)).toHaveLength(3);
  expect(text).toMatch(/\/MediaBox\s*\[\s*0 0 612(\.\d+)? 792(\.\d+)?\s*\]/);
  await page.emulateMedia({ media: 'screen' });

  await page.getByRole('tab', { name: 'Layout' }).click();
  await select(page, 'Orientation').selectOption('Landscape');
  await expect(select(page, 'Orientation')).toHaveValue('write.orientation-landscape');
  await page.emulateMedia({ media: 'print' });
  const wide = (await page.pdf({ preferCSSPageSize: true })).toString('latin1');
  expect(wide).toMatch(/\/MediaBox\s*\[\s*0 0 792(\.\d+)? 612(\.\d+)?\s*\]/);
});

test('a page break in print starts the next PDF page', async ({ page }) => {
  await page.keyboard.type('One');
  await page.keyboard.press('ControlOrMeta+Enter');
  await page.keyboard.type('Two');
  await expect(sheets(page)).toHaveCount(2);

  await page.emulateMedia({ media: 'print' });
  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString('latin1');
  expect(pdf.match(/\/Type\s*\/Page[^s]/g)).toHaveLength(2);
});
