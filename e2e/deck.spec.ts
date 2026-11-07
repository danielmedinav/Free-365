import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';

type Zip = {
  files: Record<string, unknown>;
  file(name: string): { async(type: 'text'): Promise<string> };
};
const JSZip = createRequire(import.meta.url)('../packages/deck/node_modules/jszip') as {
  loadAsync(data: Buffer): Promise<Zip>;
};

const editor = (page: Page) => page.getByRole('application', { name: 'Slide editor' });
const canvas = (page: Page) => editor(page).locator('canvas').first();
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click();
const objects = (page: Page) =>
  page.getByRole('list', { name: 'Objects on this slide' }).getByRole('button');
const object = (page: Page, name: string | RegExp) =>
  page.getByRole('list', { name: 'Objects on this slide' }).getByRole('button', { name });
const thumb = (page: Page, number: number) => button(page, `Slide ${number}`);
const saved = (page: Page) => page.getByRole('status').filter({ hasText: 'Saved locally' });
const textBox = (page: Page) => page.getByRole('textbox', { name: 'Slide text' });

type Box = { x: number; y: number; width: number; height: number; rotation: number };

async function boxOf(page: Page, name: string | RegExp): Promise<Box> {
  const element = object(page, name);
  const read = async (key: string) => Number(await element.getAttribute(`data-element-${key}`));
  return {
    x: await read('x'),
    y: await read('y'),
    width: await read('width'),
    height: await read('height'),
    rotation: await read('rotation'),
  };
}

/** Turns a position on the slide into a position on the screen. */
async function toScreen(page: Page, x: number, y: number) {
  const area = (await canvas(page).boundingBox())!;
  const scale = area.width / 960;
  return { x: area.x + x * scale, y: area.y + y * scale };
}

async function clickSlide(page: Page, x: number, y: number, clickCount = 1) {
  const point = await toScreen(page, x, y);
  await page.mouse.click(point.x, point.y, { clickCount });
}

/** The color at a position on the slide. */
async function pixel(page: Page, x: number, y: number): Promise<string> {
  await page.evaluate(() => new Promise(requestAnimationFrame));
  return canvas(page).evaluate(
    (element: HTMLCanvasElement, [slideX, slideY]) => {
      const scale = element.width / 960;
      const { data } = element
        .getContext('2d')!
        .getImageData(Math.round(slideX! * scale), Math.round(slideY! * scale), 1, 1);
      return `rgb(${data[0]}, ${data[1]}, ${data[2]})`;
    },
    [x, y],
  );
}

/** Types into a layout's box by double-clicking it, then leaves the box. */
async function fillBox(page: Page, name: string | RegExp, text: string) {
  const box = await boxOf(page, name);
  await clickSlide(page, box.x + box.width / 2, box.y + 10, 2);
  await expect(textBox(page)).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
  await expect(textBox(page)).toHaveCount(0);
  await expect(editor(page)).toBeFocused();
}

async function addShape(page: Page, name: string) {
  await tab(page, 'Insert');
  await button(page, name).click();
  await expect(editor(page)).toBeFocused();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.showOpenFilePicker;
    delete w.showSaveFilePicker;
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Blank presentation/ }).click();
  await expect(editor(page)).toBeFocused();
});

test('a new presentation starts with an empty title slide', async ({ page }) => {
  await expect(page.getByText('Slide 1 of 1')).toBeVisible();
  await expect(objects(page)).toHaveText(['Empty title box', 'Empty subtitle box']);
  await expect(thumb(page, 1)).toHaveAttribute('aria-current', 'true');
});

test('double-clicking a box types into it', async ({ page }) => {
  await fillBox(page, 'Empty title box', 'Annual review');
  await expect(object(page, 'Text: Annual review')).toBeVisible();
  // It drew something on the slide, where it was all background before.
  await expect
    .poll(() =>
      canvas(page).evaluate((element: HTMLCanvasElement) => {
        const { data } = element
          .getContext('2d')!
          .getImageData(0, 0, element.width, element.height);
        for (let i = 0; i < data.length; i += 4) {
          if (data[i]! < 100) return true;
        }
        return false;
      }),
    )
    .toBe(true);
});

test('a selected box can be edited from the keyboard, and Tab moves between objects', async ({
  page,
}) => {
  await page.keyboard.press('Tab');
  await expect(object(page, 'Empty title box')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Tab');
  await expect(object(page, 'Empty subtitle box')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Enter');
  await expect(textBox(page)).toBeFocused();
  await page.keyboard.type('By the team');
  await page.keyboard.press('Escape');
  await expect(object(page, 'Text: By the team')).toBeVisible();
});

test('slides can be added, duplicated, reordered, and deleted', async ({ page }) => {
  await button(page, 'New slide').click();
  await expect(page.getByText('Slide 2 of 2')).toBeVisible();
  await expect(thumb(page, 2)).toHaveAttribute('aria-current', 'true');
  await expect(objects(page)).toHaveText(['Empty title box', 'Empty body box']);

  await fillBox(page, 'Empty title box', 'Second');
  await button(page, 'Duplicate').click();
  await expect(page.getByText('Slide 3 of 3')).toBeVisible();
  await expect(object(page, 'Text: Second')).toBeVisible();

  await thumb(page, 1).click();
  await expect(button(page, 'Move up')).toBeDisabled();
  await button(page, 'Move down').click();
  await expect(thumb(page, 2)).toHaveAttribute('aria-current', 'true');
  await expect(page.getByText('Slide 2 of 3')).toBeVisible();

  await button(page, 'Delete slide').click();
  await expect(page.getByText('of 2')).toBeVisible();

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(page.getByText('of 3')).toBeVisible();
});

test('the last slide cannot be deleted', async ({ page }) => {
  await expect(button(page, 'Delete slide')).toBeDisabled();
});

test('slides can be dragged to reorder them', async ({ page }) => {
  await fillBox(page, 'Empty title box', 'First');
  await button(page, 'New slide').click();
  await fillBox(page, 'Empty title box', 'Second');
  await thumb(page, 2).dragTo(thumb(page, 1));
  await thumb(page, 1).click();
  await expect(object(page, 'Text: Second')).toBeVisible();
});

test('changing the layout keeps the text', async ({ page }) => {
  await fillBox(page, 'Empty title box', 'Keep me');
  await page.getByRole('combobox', { name: 'Slide layout' }).selectOption('Two columns');
  await expect(objects(page)).toHaveText(['Text: Keep me', 'Empty body box', 'Empty body2 box']);
  const box = await boxOf(page, 'Text: Keep me');
  expect(box.y).toBe(36);

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(objects(page)).toHaveCount(2);
});

test('shapes appear, in the theme color, and can be recolored', async ({ page }) => {
  await addShape(page, 'Rectangle');
  await expect(object(page, 'Shape: rectangle')).toHaveAttribute('aria-pressed', 'true');
  expect(await pixel(page, 480, 270)).toBe('rgb(224, 87, 63)');

  await button(page, 'Shape color').click();
  await page.getByRole('menuitem', { name: 'Blue shape' }).click();
  await expect.poll(() => pixel(page, 480, 270)).toBe('rgb(21, 101, 192)');
});

test.describe('every shape draws', () => {
  for (const [name, x, y] of [
    ['Ellipse', 480, 270],
    ['Triangle', 480, 300],
    ['Arrow', 480, 270],
    ['Line', 420, 272],
  ] as const) {
    test(name, async ({ page }) => {
      await addShape(page, name);
      await page.keyboard.press('Escape'); // so the selection outline isn't drawn over it
      await expect.poll(() => pixel(page, x, y)).toBe('rgb(224, 87, 63)');
    });
  }
});

test('objects can be dragged, in one undo step', async ({ page }) => {
  await addShape(page, 'Rectangle');
  const before = await boxOf(page, 'Shape: rectangle');
  const start = await toScreen(page, before.x + 100, before.y + 100);
  const end = await toScreen(page, before.x + 250, before.y + 150);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 3 });
  await page.mouse.move(end.x, end.y, { steps: 3 });
  await page.mouse.up();

  await expect
    .poll(async () => Math.round((await boxOf(page, 'Shape: rectangle')).x))
    .toBeGreaterThan(before.x + 130);
  await expect(editor(page).locator('canvas').first()).toBeVisible();

  await tab(page, 'Home');
  await button(page, 'Undo').click();
  await expect.poll(async () => (await boxOf(page, 'Shape: rectangle')).x).toBe(before.x);
});

test('corner handles resize a shape', async ({ page }) => {
  await addShape(page, 'Rectangle');
  const before = await boxOf(page, 'Shape: rectangle');
  const corner = await toScreen(page, before.x + before.width, before.y + before.height);
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(corner.x + 40, corner.y + 30, { steps: 4 });
  await page.mouse.up();
  await expect
    .poll(async () => (await boxOf(page, 'Shape: rectangle')).width)
    .toBeGreaterThan(before.width + 30);
  const after = await boxOf(page, 'Shape: rectangle');
  expect(after.height).toBeGreaterThan(before.height + 20);
  expect(after.x).toBeCloseTo(before.x, 0);
});

test('the top handle rotates a shape', async ({ page }) => {
  await addShape(page, 'Rectangle');
  const box = await boxOf(page, 'Shape: rectangle');
  const area = (await canvas(page).boundingBox())!;
  const handle = await toScreen(page, box.x + box.width / 2, box.y);
  const scaleOffset = 50; // the rotate handle sits a fixed distance above the shape, on screen
  await page.mouse.move(handle.x, handle.y - scaleOffset);
  await page.mouse.down();
  await page.mouse.move(handle.x + 100, handle.y + 40, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await boxOf(page, 'Shape: rectangle')).rotation).not.toBe(0);
  expect(area.width).toBeGreaterThan(0);
});

test('arrow keys nudge and Delete removes the selected object', async ({ page }) => {
  await addShape(page, 'Ellipse');
  const before = await boxOf(page, 'Shape: ellipse');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  const after = await boxOf(page, 'Shape: ellipse');
  expect(after.x).toBe(before.x + 4);
  expect(after.y).toBe(before.y + 20);

  await page.keyboard.press('Delete');
  await expect(object(page, 'Shape: ellipse')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(object(page, 'Shape: ellipse')).toHaveCount(1);
});

test('objects can be copied and stacked', async ({ page }) => {
  await addShape(page, 'Rectangle');
  await page.keyboard.press('ControlOrMeta+D');
  await expect(object(page, 'Shape: rectangle')).toHaveCount(2);

  await button(page, 'Shape color').click();
  await page.getByRole('menuitem', { name: 'Blue shape' }).click();
  // The copy is on top, slightly offset, so the middle shows it.
  await expect.poll(() => pixel(page, 480, 270)).toBe('rgb(21, 101, 192)');
  await button(page, 'To back').click();
  await expect.poll(() => pixel(page, 480, 270)).toBe('rgb(224, 87, 63)');
  await button(page, 'To front').click();
  await expect.poll(() => pixel(page, 480, 270)).toBe('rgb(21, 101, 192)');
});

test('a text box with nothing typed goes away', async ({ page }) => {
  await tab(page, 'Insert');
  await button(page, 'Text box').click();
  await expect(textBox(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(object(page, /text box/)).toHaveCount(0);
});

test('text formatting applies to the selected box', async ({ page }) => {
  await fillBox(page, 'Empty title box', 'Hello');
  // Listed for screen readers and hidden from view, so it can't take a real mouse click.
  await object(page, 'Text: Hello').dispatchEvent('click');
  await tab(page, 'Home');
  await expect(button(page, 'Bold')).toHaveAttribute('aria-pressed', 'true');
  await button(page, 'Bold').click();
  await expect(button(page, 'Bold')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('ControlOrMeta+I');
  await expect(button(page, 'Italic')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('combobox', { name: 'Font size' }).selectOption('80');
  await expect(page.getByRole('combobox', { name: 'Font size' })).toHaveValue('deck.fontSize-80');
  await button(page, 'Align right').click();
  await expect(button(page, 'Align right')).toHaveAttribute('aria-pressed', 'true');
  await button(page, 'Bullets').click();
  await expect(button(page, 'Bullets')).toHaveAttribute('aria-pressed', 'true');

  await button(page, 'Text color').click();
  await page.getByRole('menuitem', { name: 'Red text' }).click();
  await expect(editor(page)).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(button(page, 'Bold')).toBeDisabled();
});

test('images can be added, and stay after a reload', async ({ page }) => {
  const dataUrl = await page.evaluate(() => {
    const element = document.createElement('canvas');
    element.width = 300;
    element.height = 200;
    const context = element.getContext('2d')!;
    context.fillStyle = '#00ff00';
    context.fillRect(0, 0, 300, 200);
    return element.toDataURL('image/png');
  });
  await tab(page, 'Insert');
  const chooser = page.waitForEvent('filechooser');
  await button(page, 'Image').click();
  await (
    await chooser
  ).setFiles({
    name: 'green.png',
    mimeType: 'image/png',
    buffer: Buffer.from(dataUrl.split(',')[1]!, 'base64'),
  });
  await expect(object(page, 'Image: green.png')).toBeVisible();
  const box = await boxOf(page, 'Image: green.png');
  expect(box.width).toBe(300);
  await expect.poll(() => pixel(page, 480, 270)).toBe('rgb(0, 255, 0)');

  await expect(saved(page)).toBeVisible();
  await page.reload();
  await expect(object(page, 'Image: green.png')).toBeVisible();
  await expect.poll(() => pixel(page, 480, 270)).toBe('rgb(0, 255, 0)');
});

test('files that are not images are refused, with an explanation', async ({ page }) => {
  await tab(page, 'Insert');
  const chooser = page.waitForEvent('filechooser');
  await button(page, 'Image').click();
  await (
    await chooser
  ).setFiles({ name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  await expect(page.getByRole('dialog')).toContainText(/isn.t a PNG/);
});

test('themes and backgrounds change the slide', async ({ page }) => {
  expect(await pixel(page, 10, 10)).toBe('rgb(255, 255, 255)');
  await tab(page, 'Design');
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('Midnight');
  await expect.poll(() => pixel(page, 10, 10)).toBe('rgb(20, 33, 61)');

  await button(page, 'Slide background').click();
  await page.getByRole('menuitem', { name: 'Red background' }).click();
  await expect.poll(() => pixel(page, 10, 10)).toBe('rgb(198, 40, 40)');

  await button(page, 'Slide background').click();
  await page.getByRole('menuitem', { name: 'Theme background' }).click();
  await expect.poll(() => pixel(page, 10, 10)).toBe('rgb(20, 33, 61)');

  await page.keyboard.press('ControlOrMeta+Z');
  await page.keyboard.press('ControlOrMeta+Z');
  await page.keyboard.press('ControlOrMeta+Z');
  await expect.poll(() => pixel(page, 10, 10)).toBe('rgb(255, 255, 255)');
});

test('speaker notes stay with their slide', async ({ page }) => {
  const notes = page.getByRole('textbox', { name: 'Speaker notes' });
  await notes.fill('First slide notes');
  await button(page, 'New slide').click();
  await expect(notes).toHaveValue('');
  await thumb(page, 1).click();
  await expect(notes).toHaveValue('First slide notes');
});

test('everything survives a reload, even right after a change', async ({ page }) => {
  await fillBox(page, 'Empty title box', 'Persistent');
  await button(page, 'New slide').click();
  await addShape(page, 'Triangle');
  await page.reload();

  await expect(editor(page)).toBeVisible();
  await expect(page.getByText('of 2')).toBeVisible();
  await expect(object(page, 'Text: Persistent')).toBeVisible();
  await thumb(page, 2).click();
  await expect(object(page, 'Shape: triangle')).toBeVisible();
});

test.describe('presenting', () => {
  const presentation = (page: Page) => page.getByRole('dialog', { name: 'Presentation' });
  const counter = (page: Page) => presentation(page).getByRole('status');

  async function threeSlides(page: Page) {
    await fillBox(page, 'Empty title box', 'One');
    await button(page, 'New slide').click();
    await fillBox(page, 'Empty title box', 'Two');
    await button(page, 'New slide').click();
    await fillBox(page, 'Empty title box', 'Three');
  }

  test('keys and clicks move through the slides, and Esc leaves', async ({ page }) => {
    await threeSlides(page);
    await tab(page, 'Present');
    await button(page, 'From start').click();
    await expect(counter(page)).toHaveText('Slide 1 of 3');

    await page.keyboard.press('ArrowRight');
    await expect(counter(page)).toHaveText('Slide 2 of 3');
    await page.keyboard.press('Space');
    await expect(counter(page)).toHaveText('Slide 3 of 3');
    await page.keyboard.press('ArrowLeft');
    await expect(counter(page)).toHaveText('Slide 2 of 3');
    await presentation(page).click();
    await expect(counter(page)).toHaveText('Slide 3 of 3');

    await page.keyboard.press('ArrowRight');
    await expect(presentation(page)).toContainText('End of presentation');

    await page.keyboard.press('Escape');
    await expect(presentation(page)).toHaveCount(0);
    await expect(editor(page)).toBeFocused();
  });

  test('F5 presents from the start, Shift+F5 from this slide', async ({ page }) => {
    await threeSlides(page);
    await page.keyboard.press('Shift+F5');
    await expect(counter(page)).toHaveText('Slide 3 of 3');
    await page.keyboard.press('Escape');
    await expect(presentation(page)).toHaveCount(0);
    await page.keyboard.press('F5');
    await expect(counter(page)).toHaveText('Slide 1 of 3');
  });

  test('the app stays quiet underneath while presenting', async ({ page }) => {
    await threeSlides(page);
    await page.keyboard.press('F5');
    await page.keyboard.press('Delete');
    await page.keyboard.press('ControlOrMeta+Z');
    await page.keyboard.press('Escape');
    await expect(page.getByText('Slide 3 of 3')).toBeVisible();
    await expect(object(page, 'Text: Three')).toBeVisible();
  });

  test('empty boxes show nothing, and the slide fills the screen', async ({ page }) => {
    await page.keyboard.press('F5');
    const stage = presentation(page).locator('canvas').first();
    const box = (await stage.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(Math.max(box.width / viewport.width, box.height / viewport.height)).toBeCloseTo(1, 1);
    const hasInk = await stage.evaluate((element: HTMLCanvasElement) => {
      const { data } = element.getContext('2d')!.getImageData(0, 0, element.width, element.height);
      for (let i = 0; i < data.length; i += 4) if (data[i]! < 250) return true;
      return false;
    });
    expect(hasInk).toBe(false);
  });

  test('transitions play on the slides that have them', async ({ page }) => {
    await button(page, 'New slide').click();
    await tab(page, 'Design');
    await page.getByRole('combobox', { name: 'Transition' }).selectOption('Fade');
    await page.keyboard.press('F5');
    await expect(presentation(page).locator('[data-transition]')).toHaveAttribute(
      'data-transition',
      'none',
    );
    await page.keyboard.press('ArrowRight');
    await expect(presentation(page).locator('[data-transition]')).toHaveAttribute(
      'data-transition',
      'fade',
    );
    await page.keyboard.press('Escape');

    await button(page, 'Use on all slides').click();
    await thumb(page, 1).click();
    await expect(page.getByRole('combobox', { name: 'Transition' })).toHaveValue(
      'deck.transition-fade',
    );
  });

  test('S shows the speaker notes', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Speaker notes' }).fill('Remember to smile');
    await editor(page).focus();
    await page.keyboard.press('F5');
    await expect(presentation(page)).not.toContainText('Remember to smile');
    await page.keyboard.press('s');
    await expect(presentation(page)).toContainText('Remember to smile');
  });
});

test.describe('exporting', () => {
  async function download(page: Page, name: string) {
    await tab(page, 'File');
    const event = page.waitForEvent('download');
    await button(page, name).click();
    const file = await event;
    return { name: file.suggestedFilename(), buffer: readFileSync(await file.path()) };
  }

  test('.pptx holds the slides, text, shapes, and notes', async ({ page }) => {
    await fillBox(page, 'Empty title box', 'Exported title');
    await page.getByRole('textbox', { name: 'Speaker notes' }).fill('Exported notes');
    await button(page, 'New slide').click();
    await addShape(page, 'Ellipse');
    const title = page.getByRole('textbox', { name: 'Document title' });
    await title.fill('Quarterly');
    await title.press('Enter');

    const { name, buffer } = await download(page, 'Export .pptx');
    expect(name).toBe('Quarterly.pptx');

    const zip = await JSZip.loadAsync(buffer);
    const slideNames = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    expect(slideNames).toHaveLength(2);
    expect(await zip.file('ppt/slides/slide1.xml').async('text')).toContain('Exported title');
    expect(await zip.file('ppt/slides/slide2.xml').async('text')).toContain('prst="ellipse"');
    expect(await zip.file('ppt/notesSlides/notesSlide1.xml').async('text')).toContain(
      'Exported notes',
    );
  });

  test('PDF has one page per slide, and shows what is on them', async ({ page }) => {
    const empty = await download(page, 'Export PDF');
    expect(empty.name).toBe('Untitled presentation.pdf');
    expect(empty.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(empty.buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g)).toHaveLength(1);

    await tab(page, 'Home');
    await button(page, 'New slide').click();
    await addShape(page, 'Ellipse');
    await button(page, 'Shape color').click();
    await page.getByRole('menuitem', { name: 'Blue shape' }).click();
    const full = await download(page, 'Export PDF');
    const text = full.buffer.toString('latin1');
    expect(text.match(/\/Type\s*\/Page[^s]/g)).toHaveLength(2);
    expect(text).toMatch(/\/MediaBox\s*\[\s*0 0 960\.?0* 540\.?0*\s*\]/);
    // A page with a picture on it holds more than an empty one.
    expect(full.buffer.length).toBeGreaterThan(empty.buffer.length + 1000);
  });

  test('empty placeholder hints stay out of the PDF', async ({ page }) => {
    const empty = await download(page, 'Export PDF');
    await tab(page, 'Home');
    await page.getByRole('combobox', { name: 'Slide layout' }).selectOption('Blank');
    const blank = await download(page, 'Export PDF');
    // The hint text doesn't print, so these are the same blank white picture.
    expect(Math.abs(empty.buffer.length - blank.buffer.length)).toBeLessThan(200);
  });
});

test('dark theme leaves the slide in its own colors', async ({ page }) => {
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await pixel(page, 10, 10)).toBe('rgb(255, 255, 255)');
});
