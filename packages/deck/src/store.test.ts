import { describe, expect, it } from 'vitest';
import {
  applyLayout,
  createDeck,
  createImage,
  createShape,
  createSlide,
  createTextBox,
  describeElement,
  readDeck,
  themeOf,
  type Deck,
  type TextElement,
} from './deck';
import { DeckStore } from './store';

const create = () => new DeckStore(createDeck());
const firstId = (store: DeckStore) => store.getDeck().slides[0]!.id;
const ids = (store: DeckStore) => store.getDeck().slides.map((slide) => slide.id);

describe('slides', () => {
  it('adds a slide after the given one', () => {
    const store = create();
    const first = firstId(store);
    const last = store.addSlide('content');
    const middle = store.addSlide('blank', first);
    expect(ids(store)).toEqual([first, middle.id, last.id]);
  });

  it('duplicates a slide right after it, with new ids', () => {
    const store = create();
    const first = store.getDeck().slides[0]!;
    const copy = store.duplicateSlide(first.id)!;
    expect(ids(store)).toEqual([first.id, copy.id]);
    expect(copy.elements).toHaveLength(first.elements.length);
    expect(copy.elements[0]?.id).not.toBe(first.elements[0]?.id);
  });

  it('never deletes the last slide', () => {
    const store = create();
    store.removeSlide(firstId(store));
    expect(ids(store)).toHaveLength(1);
  });

  it('moves slides, staying within the deck', () => {
    const store = create();
    const a = firstId(store);
    const b = store.addSlide('blank').id;
    const c = store.addSlide('blank').id;
    store.moveSlide(a, 2);
    expect(ids(store)).toEqual([b, c, a]);
    store.moveSlide(a, 99);
    expect(ids(store)).toEqual([b, c, a]);
    store.moveSlide(c, -5);
    expect(ids(store)).toEqual([c, b, a]);
  });
});

describe('undo', () => {
  it('undoes and redoes each kind of change', () => {
    const store = create();
    const slide = firstId(store);
    const original = store.getDeck();

    store.setTheme('midnight');
    store.addSlide('blank');
    store.setNotes(slide, 'Remember this');
    expect(store.history.canUndo()).toBe(true);

    store.history.undo();
    expect(store.getDeck().slides[0]?.notes).toBe('');
    store.history.undo();
    expect(ids(store)).toHaveLength(1);
    store.history.undo();
    expect(store.getDeck()).toEqual(original);

    store.history.redo();
    store.history.redo();
    store.history.redo();
    expect(store.getDeck().themeId).toBe('midnight');
    expect(ids(store)).toHaveLength(2);
    expect(store.getDeck().slides[0]?.notes).toBe('Remember this');
  });

  it('records nothing when nothing changes', () => {
    const store = create();
    store.setTheme(store.getDeck().themeId);
    store.moveSlide(firstId(store), 0);
    expect(store.history.canUndo()).toBe(false);
  });

  it('leaves other slides untouched, so only changed slides redraw', () => {
    const store = create();
    store.addSlide('blank');
    const [first, second] = store.getDeck().slides;
    store.setNotes(second!.id, 'x');
    expect(store.getDeck().slides[0]).toBe(first);
    expect(store.getDeck().slides[1]).not.toBe(second);
  });
});

describe('elements', () => {
  function withShape() {
    const store = create();
    const slide = firstId(store);
    const shape = createShape('rectangle');
    store.addElement(slide, shape);
    return { store, slide, shape };
  }

  const elements = (store: DeckStore) => store.getDeck().slides[0]!.elements;

  it('adds, edits, and deletes', () => {
    const { store, slide, shape } = withShape();
    expect(elements(store).at(-1)?.id).toBe(shape.id);
    store.updateElement(slide, shape.id, { x: 5, rotation: 45 });
    expect(elements(store).at(-1)).toMatchObject({ x: 5, rotation: 45 });
    store.removeElement(slide, shape.id);
    expect(elements(store).find((e) => e.id === shape.id)).toBeUndefined();
    store.history.undo();
    expect(elements(store).find((e) => e.id === shape.id)).toBeDefined();
  });

  it('duplicates beside the original', () => {
    const { store, slide, shape } = withShape();
    const copy = store.duplicateElement(slide, shape.id)!;
    expect(copy.id).not.toBe(shape.id);
    expect(copy.x).toBe(shape.x + 20);
  });

  it('changes what draws on top', () => {
    const { store, slide, shape } = withShape();
    store.moveElementInStack(slide, shape.id, 'back');
    expect(elements(store)[0]?.id).toBe(shape.id);
    store.moveElementInStack(slide, shape.id, 'front');
    expect(elements(store).at(-1)?.id).toBe(shape.id);
  });
});

describe('transitions', () => {
  it('can be set for one slide or for all, in one undo step', () => {
    const store = create();
    const first = firstId(store);
    store.addSlide('blank');
    store.setTransition(first, 'fade');
    expect(store.getDeck().slides.map((s) => s.transition)).toEqual(['fade', 'none']);
    store.setAllTransitions('fade');
    expect(store.getDeck().slides.map((s) => s.transition)).toEqual(['fade', 'fade']);
    store.history.undo();
    expect(store.getDeck().slides.map((s) => s.transition)).toEqual(['fade', 'none']);
  });
});

describe('layouts', () => {
  const text = (slide: ReturnType<typeof createSlide>, role: string) =>
    slide.elements.find((e) => e.type === 'text' && e.role === role) as TextElement | undefined;

  it('creates the right boxes', () => {
    expect(createSlide('title').elements).toHaveLength(2);
    expect(createSlide('two-content').elements).toHaveLength(3);
    expect(createSlide('blank').elements).toHaveLength(0);
  });

  it('keeps text when the layout changes, in the new position', () => {
    const slide = createSlide('title');
    text(slide, 'title')!.text = 'Hello';
    const result = applyLayout(slide, 'content');
    const title = result.find((e) => e.type === 'text' && e.role === 'title') as TextElement;
    expect(title.text).toBe('Hello');
    expect(title.y).toBe(36);
    expect(title.fontSize).toBe(36);
    expect(result.some((e) => e.type === 'text' && e.role === 'body')).toBe(true);
  });

  it('removes empty boxes the new layout lacks, but keeps filled ones', () => {
    const slide = createSlide('two-content');
    text(slide, 'body2')!.text = 'Keep me';
    const result = applyLayout(slide, 'blank');
    expect(result).toHaveLength(1);
    expect((result[0] as TextElement).text).toBe('Keep me');
  });

  it('leaves what was added by hand alone', () => {
    const slide = createSlide('title');
    const shape = createShape('ellipse');
    slide.elements.push(shape);
    expect(applyLayout(slide, 'blank')).toEqual([shape]);
  });

  it('is undoable as one step', () => {
    const store = create();
    const slide = firstId(store);
    store.setLayout(slide, 'two-content');
    expect(store.getDeck().slides[0]?.elements).toHaveLength(3);
    store.history.undo();
    expect(store.getDeck().slides[0]?.layout).toBe('title');
    expect(store.getDeck().slides[0]?.elements).toHaveLength(2);
  });
});

describe('createImage', () => {
  it('shrinks large pictures to fit, keeping their shape, and centers them', () => {
    const image = createImage('data:x', 'alt', 2000, 1000);
    expect(image.width).toBe(576);
    expect(image.height).toBe(288);
    expect(image.x).toBe(192);
    expect(image.y).toBe(126);
  });

  it('never enlarges small pictures', () => {
    expect(createImage('data:x', '', 100, 50).width).toBe(100);
  });
});

describe('descriptions', () => {
  it('names each kind of thing on a slide', () => {
    expect(describeElement(createShape('arrow'))).toBe('Shape: arrow');
    expect(describeElement(createImage('x', 'A cat', 10, 10))).toBe('Image: A cat');
    expect(describeElement(createTextBox())).toBe('Empty text box');
    expect(describeElement({ ...createTextBox(), text: ' Hi ' })).toBe('Text: Hi');
    expect(describeElement({ ...createTextBox(), role: 'title' })).toBe('Empty title box');
  });
});

describe('themes', () => {
  it('falls back to the first theme for an unknown id', () => {
    expect(themeOf({ themeId: 'missing' }).id).toBe('paper');
    expect(themeOf({ themeId: 'midnight' }).id).toBe('midnight');
  });
});

describe('readDeck', () => {
  const stored = (schemaVersion: number, data: Deck | null) => ({
    id: 'a',
    kind: 'deck' as const,
    schemaVersion,
    data,
  });

  it('starts new presentations with a title slide', () => {
    expect(readDeck(undefined).slides[0]?.layout).toBe('title');
    expect(readDeck(stored(1, null)).slides).toHaveLength(1);
  });

  it('returns what was saved', () => {
    const deck = createDeck();
    expect(readDeck(stored(1, deck))).toBe(deck);
  });

  it('refuses a newer version instead of overwriting it', () => {
    expect(() => readDeck(stored(99, createDeck()))).toThrow(/newer version/);
  });
});
