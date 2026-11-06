import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const LINE =
  'This sentence is here to give the page enough ordinary text that it wraps onto several lines ' +
  'and flows around whatever sits beside it on the page. ';

const body = (page: Page) => page.getByRole('textbox', { name: 'Document body' });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const tab = (page: Page, name: string) => page.getByRole('tab', { name }).click();
const image = (page: Page) => body(page).locator('.fs-image img');
const position = (page: Page) => page.getByRole('combobox', { name: 'Image position' });

async function insertImage(page: Page, width = 300, height = 200) {
  const dataUrl = await page.evaluate(
    ([w, h]) => {
      const canvas = document.createElement('canvas');
      canvas.width = w!;
      canvas.height = h!;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#336699';
      context.fillRect(0, 0, w!, h!);
      return canvas.toDataURL('image/png');
    },
    [width, height],
  );
  await tab(page, 'Insert');
  const chooser = page.waitForEvent('filechooser');
  await button(page, 'Image').click();
  await (
    await chooser
  ).setFiles({
    name: 'picture.png',
    mimeType: 'image/png',
    buffer: Buffer.from(dataUrl.split(',')[1]!, 'base64'),
  });
  await expect(image(page)).toBeVisible();
}

async function insertTable(page: Page) {
  await tab(page, 'Insert');
  await button(page, 'Table').click();
  await expect(body(page).locator('table')).toBeVisible();
  await expect(body(page)).toBeFocused();
  await tab(page, 'Table');
}

/** Drags from the middle of one cell to another, selecting the cells between. */
async function selectCells(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 3 });
  await page.mouse.up();
}

async function centerOf(page: Page, selector: string, index: number) {
  const box = (await body(page).locator(selector).nth(index).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
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

test('image tools only work with an image selected', async ({ page }) => {
  await tab(page, 'Insert');
  await expect(button(page, 'Larger')).toBeDisabled();
  await expect(position(page)).toBeDisabled();

  await insertImage(page);
  await image(page).click();
  await expect(button(page, 'Larger')).toBeEnabled();
  await expect(position(page)).toHaveValue('write.imageLayout-left');
});

test('dragging the corner resizes an image, in one undo step', async ({ page }) => {
  await insertImage(page);
  await image(page).click();
  const handle = body(page).locator('.fs-image-handle');
  await expect(handle).toBeVisible();

  const start = (await image(page).boundingBox())!;
  expect(start.width).toBeCloseTo(300, 0);
  const grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + 50, grip.y, { steps: 3 });
  await page.mouse.move(grip.x + 100, grip.y, { steps: 3 });
  await page.mouse.up();

  await expect.poll(async () => (await image(page).boundingBox())!.width).toBeGreaterThan(385);
  expect((await image(page).boundingBox())!.width).toBeLessThan(405);
  const resized = (await image(page).boundingBox())!;
  // The shape stays the same.
  expect(resized.height / resized.width).toBeCloseTo(200 / 300, 1);

  await page.keyboard.press('ControlOrMeta+Z');
  await expect.poll(async () => (await image(page).boundingBox())!.width).toBeCloseTo(300, 0);
});

test('an image can be resized from the keyboard-friendly buttons', async ({ page }) => {
  await insertImage(page);
  await image(page).click();
  await button(page, 'Larger').click();
  await expect.poll(async () => (await image(page).boundingBox())!.width).toBeCloseTo(330, 0);
  await button(page, 'Smaller').click();
  await expect.poll(async () => (await image(page).boundingBox())!.width).toBeCloseTo(297, 0);
  await button(page, 'Original size').click();
  await expect.poll(async () => (await image(page).boundingBox())!.width).toBeCloseTo(300, 0);
});

test('an image never gets wider than the page margins', async ({ page }) => {
  await insertImage(page, 1500, 300);
  const box = (await image(page).boundingBox())!;
  expect(box.width).toBeCloseTo(624, 0);
});

test('images can be positioned, and text wraps beside them', async ({ page }) => {
  await insertImage(page);
  await body(page).locator('p').last().click();
  await page.keyboard.insertText(LINE.repeat(5));
  await image(page).click();
  await expect(position(page)).toHaveValue('write.imageLayout-left');

  const sheet = (await page.locator('.fs-sheet').first().boundingBox())!;
  const contentLeft = sheet.x + 96;
  const contentRight = sheet.x + sheet.width - 96;

  await position(page).selectOption('Center');
  // Still selected afterwards, so it can be resized straight away.
  await expect(body(page).locator('.fs-image-handle')).toBeVisible();
  await expect
    .poll(async () => {
      const box = (await image(page).boundingBox())!;
      return Math.round(box.x + box.width / 2);
    })
    .toBe(Math.round((contentLeft + contentRight) / 2));

  await position(page).selectOption('Right');
  await expect
    .poll(async () => {
      const box = (await image(page).boundingBox())!;
      return Math.round(box.x + box.width);
    })
    .toBe(Math.round(contentRight));

  // Wrapped: the text's first line starts level with the image, beside it.
  await position(page).selectOption('Left, text wraps');
  await expect
    .poll(async () => Math.round((await image(page).boundingBox())!.x))
    .toBe(Math.round(contentLeft));
  const textBeside = () =>
    body(page)
      .locator('p')
      .last()
      .evaluate((paragraph) => {
        const range = document.createRange();
        range.selectNodeContents(paragraph);
        const lines = Array.from(range.getClientRects());
        return { firstLeft: lines[0]!.left, firstTop: lines[0]!.top };
      });
  const imageBox = (await image(page).boundingBox())!;
  const left = await textBeside();
  expect(left.firstLeft).toBeGreaterThan(imageBox.x + imageBox.width);
  expect(left.firstTop).toBeLessThan(imageBox.y + imageBox.height);

  await position(page).selectOption('Right, text wraps');
  await expect
    .poll(async () => {
      const box = (await image(page).boundingBox())!;
      return Math.round(box.x + box.width);
    })
    .toBe(Math.round(contentRight));
  const right = await textBeside();
  expect(right.firstLeft).toBeCloseTo(contentLeft, 0);
});

test('a wrapped image still moves to the next page whole', async ({ page }) => {
  for (let i = 0; i < 15; i++) {
    await page.keyboard.insertText(LINE);
    await page.keyboard.press('Enter');
  }
  await insertImage(page, 300, 500);
  await image(page).click();
  await position(page).selectOption('Left, text wraps');
  await expect(position(page)).toHaveValue('write.imageLayout-wrap-left');
  await expect(page.locator('.fs-sheet')).toHaveCount(2);

  const box = (await image(page).boundingBox())!;
  const sheet = (await page.locator('.fs-sheet').nth(1).boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(sheet.y + 94);
  expect(box.y + box.height).toBeLessThanOrEqual(sheet.y + sheet.height - 94);
});

test('image size and position survive a reload', async ({ page }) => {
  await insertImage(page);
  await image(page).click();
  await button(page, 'Larger').click();
  await position(page).selectOption('Right, text wraps');
  await expect(page.getByRole('status').filter({ hasText: 'Saved locally' })).toBeVisible();

  await page.reload();
  await expect.poll(async () => (await image(page).boundingBox())!.width).toBeCloseTo(330, 0);
  await expect(body(page).locator('.fs-image')).toHaveAttribute('data-layout', 'wrap-right');
});

test('merging and splitting cells', async ({ page }) => {
  await insertTable(page);
  await expect(button(page, 'Merge cells')).toBeDisabled();

  await selectCells(
    page,
    await centerOf(page, 'tr:nth-child(2) td', 0),
    await centerOf(page, 'tr:nth-child(2) td', 1),
  );
  await expect(button(page, 'Merge cells')).toBeEnabled();
  await button(page, 'Merge cells').click();
  await expect(body(page).locator('td[colspan="2"]')).toHaveCount(1);
  await expect(body(page).locator('tr:nth-child(2) td')).toHaveCount(2);

  await body(page).locator('td[colspan="2"]').click();
  await expect(button(page, 'Split cell')).toBeEnabled();
  await button(page, 'Split cell').click();
  await expect(body(page).locator('td[colspan="2"]')).toHaveCount(0);
  await expect(body(page).locator('tr:nth-child(2) td')).toHaveCount(3);
});

test('cell colors apply to all selected cells, and can be cleared', async ({ page }) => {
  await insertTable(page);
  await selectCells(
    page,
    await centerOf(page, 'tr:nth-child(2) td', 0),
    await centerOf(page, 'tr:nth-child(3) td', 0),
  );
  await button(page, 'Cell color').click();
  await page.getByRole('menuitem', { name: 'Yellow cell' }).click();

  const first = body(page).locator('tr:nth-child(2) td').first();
  const second = body(page).locator('tr:nth-child(3) td').first();
  await expect(first).toHaveCSS('background-color', 'rgb(255, 241, 118)');
  await expect(second).toHaveCSS('background-color', 'rgb(255, 241, 118)');
  await expect(body(page).locator('tr:nth-child(2) td').nth(1)).not.toHaveCSS(
    'background-color',
    'rgb(255, 241, 118)',
  );

  await first.click();
  await button(page, 'Cell color').click();
  await page.getByRole('menuitem', { name: 'No color' }).click();
  await expect(first).not.toHaveCSS('background-color', 'rgb(255, 241, 118)');
  await expect(second).toHaveCSS('background-color', 'rgb(255, 241, 118)');
});

test('the header row can be switched off', async ({ page }) => {
  await insertTable(page);
  await expect(body(page).locator('th')).toHaveCount(3);
  await button(page, 'Header row').click();
  await expect(body(page).locator('th')).toHaveCount(0);
});

test('columns can be resized by dragging their edge', async ({ page }) => {
  await insertTable(page);
  const firstColumn = body(page).locator('tr:nth-child(2) td').first();
  const start = (await firstColumn.boundingBox())!;

  const edgeX = start.x + start.width - 1;
  const y = start.y + start.height / 2;
  await page.mouse.move(edgeX - 30, y);
  await page.mouse.move(edgeX, y, { steps: 5 });
  await expect(body(page).locator('.column-resize-handle').first()).toBeVisible();
  await page.mouse.down();
  await page.mouse.move(edgeX + 40, y, { steps: 3 });
  await page.mouse.move(edgeX + 80, y, { steps: 3 });
  await page.mouse.up();

  await expect
    .poll(async () => (await firstColumn.boundingBox())!.width)
    .toBeGreaterThan(start.width + 50);
  const table = (await body(page).locator('table').boundingBox())!;
  const sheet = (await page.locator('.fs-sheet').first().boundingBox())!;
  expect(table.x + table.width).toBeLessThanOrEqual(sheet.x + sheet.width - 96 + 1);
});

test('images and tables survive .docx export and import in the browser', async ({ page }) => {
  await insertImage(page);
  await image(page).click();
  await button(page, 'Larger').click();
  await position(page).selectOption('Center');
  await expect(position(page)).toHaveValue('write.imageLayout-center');

  await body(page).locator('p').last().click();
  await insertTable(page);
  await button(page, 'Cell color').click();
  await page.getByRole('menuitem', { name: 'Aqua cell' }).click();
  await selectCells(
    page,
    await centerOf(page, 'tr:nth-child(2) td', 0),
    await centerOf(page, 'tr:nth-child(2) td', 1),
  );
  await button(page, 'Merge cells').click();
  await expect(body(page).locator('td[colspan="2"]')).toHaveCount(1);

  await tab(page, 'File');
  const downloadEvent = page.waitForEvent('download');
  await button(page, 'Export .docx').click();
  const path = await (await downloadEvent).path();

  await button(page, 'New document').click();
  await expect(page.getByRole('textbox', { name: 'Document title' })).toHaveValue(
    'Untitled document',
  );
  await expect(image(page)).toHaveCount(0);
  await tab(page, 'File');
  const chooser = page.waitForEvent('filechooser');
  await button(page, 'Import .docx').click();
  await (
    await chooser
  ).setFiles({ name: 'Round.docx', mimeType: DOCX_MIME, buffer: readFileSync(path) });

  await expect(image(page)).toBeVisible();
  await expect(body(page).locator('.fs-image')).toHaveAttribute('data-layout', 'center');
  await expect.poll(async () => (await image(page).boundingBox())!.width).toBeCloseTo(330, 0);
  await expect(body(page).locator('td[colspan="2"]')).toHaveCount(1);
  await expect(body(page).locator('th').first()).toHaveCSS(
    'background-color',
    'rgb(128, 222, 234)',
  );
});
