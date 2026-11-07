import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  createDeck,
  createImage,
  createShape,
  createSlide,
  createTextBox,
  type Deck,
  type TextElement,
} from '../deck';
import { exportPptx } from './pptx';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function open(deck: Deck, title?: string) {
  const blob = await exportPptx(deck, title);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return {
    zip,
    slide: (n: number) => zip.file(`ppt/slides/slide${n}.xml`)!.async('text'),
    names: Object.keys(zip.files),
  };
}

function withTitle(text: string): Deck {
  const deck = createDeck();
  (deck.slides[0]!.elements[0] as TextElement).text = text;
  return deck;
}

describe('.pptx export', () => {
  it('writes one slide per slide, at the right size', async () => {
    const deck = createDeck();
    deck.slides.push(createSlide('content'), createSlide('blank'));
    const { zip, names } = await open(deck, 'My deck');
    expect(names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))).toHaveLength(3);
    const presentation = await zip.file('ppt/presentation.xml')!.async('text');
    expect(presentation).toContain('cx="12192000"');
    expect(presentation).toContain('cy="6858000"');
    const core = await zip.file('docProps/core.xml')!.async('text');
    expect(core).toContain('My deck');
  });

  it('writes text with its formatting, in points', async () => {
    const deck = createDeck();
    deck.slides[0]!.elements = [
      {
        ...createTextBox(),
        text: 'Hello & welcome',
        fontSize: 40,
        bold: true,
        italic: true,
        align: 'center',
        color: '#c62828',
      },
    ];
    const xml = await (await open(deck)).slide(1);
    expect(xml).toContain('Hello &amp; welcome');
    expect(xml).toContain('sz="4000"');
    expect(xml).toContain('b="1"');
    expect(xml).toContain('i="1"');
    expect(xml).toContain('algn="ctr"');
    expect(xml).toContain('C62828');
  });

  it('writes each line as its own bulleted paragraph, skipping bullets on blank lines', async () => {
    const deck = createDeck();
    deck.slides[0]!.elements = [{ ...createTextBox(), text: 'one\n\ntwo', bullets: true }];
    const xml = await (await open(deck)).slide(1);
    expect(xml.match(/<a:p>/g)).toHaveLength(3);
    expect(xml.match(/<a:buChar/g)).toHaveLength(2);
  });

  it('places things where they are on the slide', async () => {
    const deck = createDeck();
    deck.slides[0]!.elements = [
      { ...createShape('rectangle'), x: 72, y: 144, width: 36, height: 18, rotation: 90 },
    ];
    const xml = await (await open(deck)).slide(1);
    // One point is 12700 of the file format's units.
    expect(xml).toContain('<a:off x="914400" y="1828800"/>');
    expect(xml).toContain('<a:ext cx="457200" cy="228600"/>');
    expect(xml).toContain('rot="5400000"');
  });

  it('leaves out empty placeholder boxes', async () => {
    const xml = await (await open(createDeck())).slide(1);
    expect(xml).not.toContain('Click to add');
    expect(xml).not.toContain('<a:t>');
  });

  it('uses the theme for colors and fonts unless overridden', async () => {
    const deck = withTitle('Styled');
    deck.themeId = 'forest';
    deck.slides[0]!.elements.push(createShape('ellipse'));
    const xml = await (await open(deck)).slide(1);
    expect(xml).toContain('F1F6EF'); // background
    expect(xml).toContain('1F3D2B'); // text
    expect(xml).toContain('Georgia');
    expect(xml).toContain('2E7D4F'); // shape fill

    deck.slides[0]!.background = '#123456';
    deck.slides[0]!.elements[2] = { ...createShape('ellipse'), fill: '#654321' };
    const custom = await (await open(deck)).slide(1);
    expect(custom).toContain('123456');
    expect(custom).toContain('654321');
    expect(custom).not.toContain('F1F6EF');
  });

  it('writes every shape', async () => {
    const deck = createDeck();
    deck.slides[0]!.elements = (['rectangle', 'ellipse', 'triangle', 'arrow', 'line'] as const).map(
      createShape,
    );
    const xml = await (await open(deck)).slide(1);
    for (const shape of ['rect', 'ellipse', 'triangle', 'rightArrow', 'line']) {
      expect(xml).toContain(`prst="${shape}"`);
    }
  });

  it('embeds images, with alt text', async () => {
    const deck = createDeck();
    deck.slides[0]!.elements = [createImage(PNG, 'A dot', 100, 100)];
    const { slide, names } = await open(deck);
    expect(names.some((name) => /^ppt\/media\/.*\.png$/.test(name))).toBe(true);
    expect(await slide(1)).toContain('A dot');
  });

  it('writes speaker notes', async () => {
    const deck = createDeck();
    deck.slides[0]!.notes = 'Say this out loud';
    const { zip } = await open(deck);
    const notes = await zip.file('ppt/notesSlides/notesSlide1.xml')!.async('text');
    expect(notes).toContain('Say this out loud');
  });
});
