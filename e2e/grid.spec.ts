import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const grid = (page: Page) => page.getByRole('grid');
const cell = (page: Page, name: string) => page.locator(`[data-cell="${name}"]`);
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const tab = (page: Page, name: string) =>
  page.getByRole('tab', { name, exact: true }).first().click();
const bar = (page: Page) => page.getByRole('textbox', { name: 'Cell contents' });
const location = (page: Page) => page.getByRole('textbox', { name: 'Selected cell' });
const saved = (page: Page) => page.getByRole('status').filter({ hasText: 'Saved locally' });

/** Types rows of values into the sheet, starting at the selected cell in column A. */
async function typeRows(page: Page, rows: string[][]) {
  for (const values of rows) {
    for (const value of values) {
      await page.keyboard.type(value);
      await page.keyboard.press('Tab');
    }
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
  }
}

async function goTo(page: Page, name: string) {
  await location(page).fill(name);
  await location(page).press('Enter');
  await expect(grid(page)).toBeFocused();
}

/** Selects a range by dragging between the middles of two cells that have contents. */
async function dragSelect(page: Page, from: string, to: string) {
  const a = (await cell(page, from).boundingBox())!;
  const b = (await cell(page, to).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.showOpenFilePicker;
    delete w.showSaveFilePicker;
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Blank spreadsheet/ }).click();
  await expect(grid(page)).toBeFocused();
});

test('typing fills cells, and formulas calculate', async ({ page }) => {
  await typeRows(page, [['2', '3', '=A1+B1']]);
  await expect(cell(page, 'A1')).toHaveText('2');
  await expect(cell(page, 'C1')).toHaveText('5');

  await goTo(page, 'C1');
  await expect(bar(page)).toHaveValue('=A1+B1');
  await expect(location(page)).toHaveValue('C1');

  await goTo(page, 'A1');
  await page.keyboard.type('10');
  await page.keyboard.press('Enter');
  await expect(cell(page, 'C1')).toHaveText('13');
  await expect(location(page)).toHaveValue('A2');
});

test('common functions work, including FALSE as a plain word', async ({ page }) => {
  await typeRows(page, [
    ['apple', '3'],
    ['pear', '5'],
    ['=SUM(B1:B2)'],
    ['=AVERAGE(B1:B2)'],
    ['=IF(B1>4,"big","small")'],
    ['=VLOOKUP("pear",A1:B2,2,FALSE)'],
  ]);
  await expect(cell(page, 'A3')).toHaveText('8');
  await expect(cell(page, 'A4')).toHaveText('4');
  await expect(cell(page, 'A5')).toHaveText('small');
  await expect(cell(page, 'A6')).toHaveText('5');
});

test('errors show as errors', async ({ page }) => {
  await page.keyboard.type('=1/0');
  await page.keyboard.press('Enter');
  await expect(cell(page, 'A1')).toHaveText('#DIV/0!');
});

test('editing a cell: F2 keeps the contents, typing replaces, Escape cancels', async ({ page }) => {
  await page.keyboard.type('hello');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');

  await page.keyboard.press('F2');
  const editor = page.getByRole('textbox', { name: 'Editing A1' });
  await expect(editor).toHaveValue('hello');
  await page.keyboard.type(' there');
  await page.keyboard.press('Enter');
  await expect(cell(page, 'A1')).toHaveText('hello there');

  await page.keyboard.press('ArrowUp');
  await page.keyboard.type('gone');
  await page.keyboard.press('Escape');
  await expect(cell(page, 'A1')).toHaveText('hello there');
  await expect(grid(page)).toBeFocused();

  await page.keyboard.press('Delete');
  await expect(cell(page, 'A1')).toHaveCount(0);
});

test('the formula bar edits the selected cell', async ({ page }) => {
  await bar(page).click();
  await page.keyboard.type('=2*21');
  await page.keyboard.press('Enter');
  await expect(cell(page, 'A1')).toHaveText('42');
  await expect(grid(page)).toBeFocused();
  await expect(location(page)).toHaveValue('A2');
});

test('clicking cells while typing a formula adds them to it', async ({ page }) => {
  await typeRows(page, [['4', '6']]);
  await goTo(page, 'C1');
  await page.keyboard.type('=');
  await cell(page, 'A1').click();
  await page.keyboard.type('+');
  await cell(page, 'B1').click();
  await expect(page.getByRole('textbox', { name: 'Editing C1' })).toHaveValue('=A1+B1');
  await page.keyboard.press('Enter');
  await expect(cell(page, 'C1')).toHaveText('10');
});

test('arrow keys, Tab, and shift-selection move around', async ({ page }) => {
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(location(page)).toHaveValue('B2');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(location(page)).toHaveValue('B2:C3');
  await page.keyboard.press('ControlOrMeta+Home');
  await expect(location(page)).toHaveValue('A1');
  await page.keyboard.press('Tab');
  await expect(location(page)).toHaveValue('B1');
});

test('Ctrl+arrow jumps to the edge of the data', async ({ page }) => {
  await typeRows(page, [['1'], ['2'], ['3']]);
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('ControlOrMeta+ArrowDown');
  await expect(location(page)).toHaveValue('A3');
});

test('far-away cells work, as the grid only draws what is on screen', async ({ page }) => {
  await goTo(page, 'CV9000');
  await page.keyboard.type('far');
  await page.keyboard.press('Enter');
  await goTo(page, 'CV9000');
  await expect(cell(page, 'CV9000')).toHaveText('far');
  expect(await page.locator('[role="gridcell"]').count()).toBeLessThan(500);
});

test('selecting shows the sum, average, and count', async ({ page }) => {
  await typeRows(page, [['2'], ['4'], ['text']]);
  await dragSelect(page, 'A1', 'A3');
  await expect(location(page)).toHaveValue('A1:A3');
  await expect(page.getByTestId('selection-stats')).toHaveText(/Sum: 6\s+Average: 3\s+Count: 3/);
});

test('formatting applies to the selection, and undo reverses it', async ({ page }) => {
  await typeRows(page, [['1234.5'], ['abc']]);
  await dragSelect(page, 'A1', 'A2');
  await button(page, 'Bold').click();
  await expect(cell(page, 'A1')).toHaveCSS('font-weight', '700');
  await expect(cell(page, 'A2')).toHaveCSS('font-weight', '700');
  await expect(button(page, 'Bold')).toHaveAttribute('aria-pressed', 'true');
  await expect(grid(page)).toBeFocused();

  await button(page, 'Fill color').click();
  await page.getByRole('menuitem', { name: 'Yellow fill' }).click();
  await expect(cell(page, 'A1')).toHaveCSS('background-color', 'rgb(255, 241, 118)');

  await page.getByRole('combobox', { name: 'Number format' }).selectOption('Currency');
  await expect(cell(page, 'A1')).toHaveText('$1,234.50');

  await button(page, 'Align center').click();
  await expect(cell(page, 'A1')).toHaveCSS('text-align', 'center');

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(cell(page, 'A1')).not.toHaveCSS('text-align', 'center');
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(cell(page, 'A1')).toHaveText('1234.5');
  await page.keyboard.press('ControlOrMeta+Y');
  await expect(cell(page, 'A1')).toHaveText('$1,234.50');
});

test('undo in the formula bar is for its own text', async ({ page }) => {
  await page.keyboard.type('keep');
  await page.keyboard.press('Enter');
  await bar(page).click();
  await page.keyboard.type('x');
  await page.keyboard.press('ControlOrMeta+Z');
  await page.keyboard.press('Escape');
  await expect(cell(page, 'A1')).toHaveText('keep');
});

test('inserting and deleting rows moves data and fixes formulas', async ({ page }) => {
  await typeRows(page, [['1'], ['=A1+1']]);
  await goTo(page, 'A1');
  await button(page, 'Insert rows').click();
  await expect(cell(page, 'A2')).toHaveText('1');
  await expect(cell(page, 'A3')).toHaveText('2');
  await goTo(page, 'A3');
  await expect(bar(page)).toHaveValue('=A2+1');

  await goTo(page, 'A1');
  await button(page, 'Delete rows').click();
  await expect(cell(page, 'A1')).toHaveText('1');
  await expect(cell(page, 'A2')).toHaveText('2');

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(cell(page, 'A2')).toHaveText('1');
});

test('columns can be inserted, deleted, and resized by dragging', async ({ page }) => {
  await typeRows(page, [['a', 'b']]);
  await goTo(page, 'A1');
  await button(page, 'Insert columns').click();
  await expect(cell(page, 'B1')).toHaveText('a');
  await button(page, 'Delete columns').click();
  await expect(cell(page, 'A1')).toHaveText('a');

  const before = (await cell(page, 'A1').boundingBox())!;
  const edge = (await page.locator('[data-resize="A"]').boundingBox())!;
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x + 60, edge.y + 5, { steps: 3 });
  await page.mouse.up();
  await expect
    .poll(async () => (await cell(page, 'A1').boundingBox())!.width)
    .toBeGreaterThan(before.width + 50);
  await expect(cell(page, 'B1').or(cell(page, 'A1')).first()).toBeVisible();
});

test('copy and paste brings formulas, adjusted, and formatting', async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await typeRows(page, [['5', '=A1*2']]);
  await goTo(page, 'B1');
  await button(page, 'Bold').click();
  await page.keyboard.press('ControlOrMeta+C');
  await goTo(page, 'A2');
  await page.keyboard.type('7');
  await page.keyboard.press('Enter');
  await goTo(page, 'B2');
  await page.keyboard.press('ControlOrMeta+V');
  await expect(cell(page, 'B2')).toHaveText('14');
  await expect(cell(page, 'B2')).toHaveCSS('font-weight', '700');
});

test('text from elsewhere pastes into cells, and cut empties the source', async ({
  context,
  page,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => navigator.clipboard.writeText('1\t2\r\n3\t4\r\n'));
  await page.keyboard.press('ControlOrMeta+V');
  await expect(cell(page, 'B2')).toHaveText('4');

  await page.keyboard.press('ControlOrMeta+X');
  await expect(cell(page, 'A1')).toHaveCount(0);
  await goTo(page, 'D1');
  await page.keyboard.press('ControlOrMeta+V');
  await expect(cell(page, 'D1')).toHaveText('1');
});

test('sheets can be added, switched, renamed, and deleted', async ({ page }) => {
  await page.keyboard.type('5');
  await page.keyboard.press('Enter');
  await button(page, 'Add sheet').click();
  await expect(page.getByRole('tab', { name: 'Sheet2' })).toHaveAttribute('aria-selected', 'true');
  await expect(cell(page, 'A1')).toHaveCount(0);
  await expect(grid(page)).toBeFocused();

  await page.keyboard.type('=Sheet1!A1*2');
  await page.keyboard.press('Enter');
  await expect(cell(page, 'A1')).toHaveText('10');

  await page.getByRole('tab', { name: 'Sheet1' }).click();
  await expect(cell(page, 'A1')).toHaveText('5');
  await page.getByRole('tab', { name: 'Sheet1' }).dblclick();
  const dialog = page.getByRole('dialog', { name: 'Rename sheet' });
  await dialog.getByRole('textbox').fill('Data');
  await dialog.getByRole('button', { name: 'Rename' }).click();
  await expect(page.getByRole('tablist', { name: 'Sheets' })).toContainText('Data');

  await page.getByRole('tab', { name: 'Sheet2' }).click();
  await goTo(page, 'A1');
  await expect(bar(page)).toHaveValue('=Data!A1*2');
  await expect(cell(page, 'A1')).toHaveText('10');

  await button(page, 'Options for Sheet2').click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(page.getByRole('tab', { name: 'Sheet2' })).toHaveCount(0);
  await expect(cell(page, 'A1')).toHaveText('5');
});

test('duplicate sheet names are refused, with an explanation', async ({ page }) => {
  await button(page, 'Add sheet').click();
  await page.getByRole('tab', { name: 'Sheet2' }).dblclick();
  const dialog = page.getByRole('dialog', { name: 'Rename sheet' });
  await dialog.getByRole('textbox').fill('Sheet1');
  await dialog.getByRole('button', { name: 'Rename' }).click();
  await expect(page.getByRole('dialog', { name: 'Something went wrong' })).toContainText(
    'must be different',
  );
});

test('everything survives a reload, even right after typing', async ({ page }) => {
  await typeRows(page, [['2', '=A1*3']]);
  await goTo(page, 'A1');
  await button(page, 'Bold').click();
  await button(page, 'Add sheet').click();
  await page.keyboard.type('second');
  await page.keyboard.press('Enter');
  await page.reload();

  await expect(page.getByRole('tab', { name: 'Sheet2' })).toHaveAttribute('aria-selected', 'true');
  await expect(cell(page, 'A1')).toHaveText('second');
  await page.getByRole('tab', { name: 'Sheet1' }).click();
  await expect(cell(page, 'B1')).toHaveText('6');
  await expect(cell(page, 'A1')).toHaveCSS('font-weight', '700');
});

test('sorting keeps rows together and leaves headings in place', async ({ page }) => {
  await typeRows(page, [
    ['Name', 'Age'],
    ['Cid', '30'],
    ['Ann', '41'],
    ['Bob', '25'],
  ]);
  await goTo(page, 'B2');
  await tab(page, 'Data');
  await button(page, 'Sort A to Z').click();
  await expect(cell(page, 'A1')).toHaveText('Name');
  await expect(cell(page, 'A2')).toHaveText('Bob');
  await expect(cell(page, 'B2')).toHaveText('25');
  await expect(cell(page, 'A4')).toHaveText('Ann');

  await button(page, 'Sort Z to A').click();
  await expect(cell(page, 'A2')).toHaveText('Ann');

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(cell(page, 'A2')).toHaveText('Bob');
});

test('filtering hides rows by value, and removing the filter brings them back', async ({
  page,
}) => {
  await typeRows(page, [
    ['Fruit', 'Qty'],
    ['apple', '1'],
    ['pear', '2'],
    ['apple', '3'],
  ]);
  await goTo(page, 'A1');
  await tab(page, 'Data');
  await button(page, 'Filter').click();
  await expect(button(page, 'Filter')).toHaveAttribute('aria-pressed', 'true');

  await button(page, 'Filter column A').click();
  const dialog = page.getByRole('dialog', { name: 'Filter column A' });
  await dialog.getByRole('checkbox', { name: 'apple' }).uncheck();
  await dialog.getByRole('button', { name: 'Apply' }).click();

  await expect(cell(page, 'A2')).toHaveCount(0);
  await expect(cell(page, 'A3')).toHaveText('pear');
  await expect(cell(page, 'A4')).toHaveCount(0);
  await expect(cell(page, 'A1')).toHaveText('Fruit');

  // Arrow keys step over hidden rows.
  await goTo(page, 'A1');
  await page.keyboard.press('ArrowDown');
  await expect(location(page)).toHaveValue('A3');

  await button(page, 'Filter').click();
  await expect(cell(page, 'A2')).toHaveText('apple');
});

test('charts draw from the selection, follow the data, and can be removed', async ({ page }) => {
  await typeRows(page, [
    ['Month', 'Sales'],
    ['Jan', '10'],
    ['Feb', '20'],
  ]);
  await dragSelect(page, 'A1', 'B3');
  await tab(page, 'Insert');
  await button(page, 'Bar chart').click();
  const chart = page.getByRole('figure', { name: 'Bar chart' });
  await expect(chart).toBeVisible();
  await expect(chart.locator('canvas')).toBeVisible();

  // It drew something.
  await expect
    .poll(() =>
      chart.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
        const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
        return data.some((value) => value !== 0);
      }),
    )
    .toBe(true);

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(chart).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Y');
  await expect(chart).toBeVisible();

  const start = (await chart.boundingBox())!;
  await page.mouse.move(start.x + 80, start.y + 12);
  await page.mouse.down();
  await page.mouse.move(start.x + 180, start.y + 62, { steps: 3 });
  await page.mouse.up();
  await expect.poll(async () => (await chart.boundingBox())!.x).toBeGreaterThan(start.x + 90);

  await expect(saved(page)).toBeVisible();
  await page.reload();
  await expect(chart).toBeVisible();
  await chart.getByRole('button', { name: 'Delete chart' }).click();
  await expect(chart).toHaveCount(0);
});

test('a new chart sits beside all the data, not on top of it', async ({ page }) => {
  await typeRows(page, [
    ['Month', 'Sales', 'Note'],
    ['Jan', '10', 'x'],
    ['Feb', '20', 'y'],
  ]);
  await dragSelect(page, 'A1', 'B3');
  await tab(page, 'Insert');
  await button(page, 'Bar chart').click();
  const chart = (await page.getByRole('figure').boundingBox())!;
  const note = (await cell(page, 'C1').boundingBox())!;
  expect(chart.x).toBeGreaterThanOrEqual(note.x + note.width);
});

test('a chart redraws in the new colors when the theme changes', async ({ page }) => {
  await typeRows(page, [
    ['Month', 'Sales'],
    ['Jan', '10'],
  ]);
  await dragSelect(page, 'A1', 'B2');
  await tab(page, 'Insert');
  await button(page, 'Bar chart').click();
  const canvas = page.getByRole('figure').locator('canvas');
  await page.waitForTimeout(300);
  const picture = () => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  const before = await picture();
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect.poll(picture).not.toBe(before);
});

test('text on a filled cell stays readable in the dark theme', async ({ page }) => {
  await page.keyboard.type('Title');
  await page.keyboard.press('Enter');
  await goTo(page, 'A1');
  await button(page, 'Fill color').click();
  await page.getByRole('menuitem', { name: 'Yellow fill' }).click();
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(cell(page, 'A1')).toHaveCSS('color', 'rgb(29, 35, 48)');
});

test('grid lines follow column widths and hidden rows', async ({ page }) => {
  await page.keyboard.type('a');
  await page.keyboard.press('Enter');
  const edge = (await page.locator('[data-resize="A"]').boundingBox())!;
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x + 63, edge.y + 5, { steps: 3 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const a = (await cell(page, 'A1').boundingBox())!;
      const line = (await page.locator('[class*="columnLine"]').first().boundingBox())!;
      return Math.abs(a.x + a.width - (line.x + line.width));
    })
    .toBeLessThan(2);
});

test('a chart with nothing to show explains what to do', async ({ page }) => {
  await tab(page, 'Insert');
  await button(page, 'Pie chart').click();
  await expect(page.getByRole('dialog', { name: 'Something went wrong' })).toContainText(
    'Select the cells',
  );
});

test('a spreadsheet survives .xlsx export and import in the browser', async ({ page }) => {
  await typeRows(page, [
    ['Item', 'Price'],
    ['Tea', '4.5'],
    ['Total', '=SUM(B2:B2)'],
  ]);
  await goTo(page, 'A1');
  await button(page, 'Bold').click();
  await goTo(page, 'B2');
  await page.getByRole('combobox', { name: 'Number format' }).selectOption('Currency');
  await button(page, 'Add sheet').click();
  await page.keyboard.type('=Sheet1!B2*2');
  await page.keyboard.press('Enter');
  await dragSelect(page, 'A1', 'A1');
  await tab(page, 'Insert');

  const title = page.getByRole('textbox', { name: 'Document title' });
  await title.fill('Budget');
  await title.press('Enter');

  await tab(page, 'File');
  const downloadEvent = page.waitForEvent('download');
  await button(page, 'Export .xlsx').click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('Budget.xlsx');
  const buffer = readFileSync(await download.path());

  await button(page, 'New spreadsheet').click();
  await expect(title).toHaveValue('Untitled spreadsheet');
  await expect(cell(page, 'A1')).toHaveCount(0);
  await tab(page, 'File');
  const chooser = page.waitForEvent('filechooser');
  await button(page, 'Import .xlsx').click();
  await (await chooser).setFiles({ name: 'Imported.xlsx', mimeType: XLSX_MIME, buffer });

  await expect(cell(page, 'A1')).toHaveText('Item');
  await expect(cell(page, 'A1')).toHaveCSS('font-weight', '700');
  await expect(cell(page, 'B2')).toHaveText('$4.50');
  await expect(cell(page, 'B3')).toHaveText('4.5');
  await expect(title).toHaveValue('Imported');
  await page.getByRole('tab', { name: 'Sheet2' }).click();
  await expect(cell(page, 'A1')).toHaveText('9');
});

test('importing over existing data asks first, and can be undone', async ({ page }) => {
  await page.keyboard.type('keep');
  await page.keyboard.press('Enter');
  await tab(page, 'File');
  const downloadEvent = page.waitForEvent('download');
  await button(page, 'Export .xlsx').click();
  const buffer = readFileSync(await (await downloadEvent).path());

  await goTo(page, 'A1');
  await page.keyboard.type('changed');
  await page.keyboard.press('Enter');

  const chooser = page.waitForEvent('filechooser');
  await button(page, 'Import .xlsx').click();
  await (await chooser).setFiles({ name: 'Old.xlsx', mimeType: XLSX_MIME, buffer });
  const dialog = page.getByRole('dialog', { name: 'Replace this spreadsheet?' });
  await dialog.getByRole('button', { name: 'Replace' }).click();
  await expect(cell(page, 'A1')).toHaveText('keep');

  await grid(page).focus();
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(cell(page, 'A1')).toHaveText('changed');
});

test('a file that is not a spreadsheet shows a message', async ({ page }) => {
  await tab(page, 'File');
  const chooser = page.waitForEvent('filechooser');
  await button(page, 'Import .xlsx').click();
  await (
    await chooser
  ).setFiles({ name: 'bad.xlsx', mimeType: XLSX_MIME, buffer: Buffer.from('no') });
  await expect(page.getByRole('dialog')).toContainText('Could not read');
});

test('.csv files import as a new sheet and export what the sheet shows', async ({ page }) => {
  await tab(page, 'File');
  const chooser = page.waitForEvent('filechooser');
  await button(page, 'Import .csv').click();
  await (
    await chooser
  ).setFiles({
    name: 'People.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('name,age\n"Lee, Ann",30\nBo,=B2+1\n'),
  });
  await expect(page.getByRole('tab', { name: 'People' })).toHaveAttribute('aria-selected', 'true');
  await expect(cell(page, 'A2')).toHaveText('Lee, Ann');
  await expect(cell(page, 'B3')).toHaveText('31');

  const downloadEvent = page.waitForEvent('download');
  await button(page, 'Export .csv').click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toContain('People.csv');
  expect(readFileSync(await download.path(), 'utf8')).toBe('name,age\r\n"Lee, Ann",30\r\nBo,31');
});

test('dark theme keeps cells readable', async ({ page }) => {
  await page.keyboard.type('text');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const [color, background] = await cell(page, 'A1').evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.color, style.backgroundColor];
  });
  expect(color).not.toBe(background);
  expect(background).not.toBe('rgb(255, 255, 255)');
});
