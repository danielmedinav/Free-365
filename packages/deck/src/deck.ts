import type { DocContent } from '@free360/core';

export const DECK_SCHEMA_VERSION = 1;

/** A slide is always this size. One unit is one point, so font sizes mean what they say. */
export const SLIDE_WIDTH = 960;
export const SLIDE_HEIGHT = 540;

export type TextRole = 'title' | 'subtitle' | 'body' | 'body2';

type ElementBase = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export type TextElement = ElementBase & {
  type: 'text';
  text: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  bullets: boolean;
  align: 'left' | 'center' | 'right';
  /** Falls back to the theme's color. */
  color?: string;
  /** Set on a layout's text boxes, which show a hint while empty. */
  role?: TextRole;
};

export type ShapeKind = 'rectangle' | 'ellipse' | 'triangle' | 'arrow' | 'line';

export type ShapeElement = ElementBase & {
  type: 'shape';
  shape: ShapeKind;
  /** Falls back to the theme's accent color. */
  fill?: string;
};

export type ImageElement = ElementBase & {
  type: 'image';
  src: string;
  alt: string;
};

export type SlideElement = TextElement | ShapeElement | ImageElement;

export type Transition = 'none' | 'fade' | 'slide';

export type LayoutId = 'title' | 'content' | 'section' | 'two-content' | 'blank';

export type Slide = {
  id: string;
  layout: LayoutId;
  elements: SlideElement[];
  notes: string;
  transition: Transition;
  /** Falls back to the theme's background. */
  background?: string;
};

export type Deck = {
  themeId: string;
  slides: Slide[];
};

export type Theme = {
  id: string;
  name: string;
  background: string;
  text: string;
  /** Hint text in empty boxes. */
  muted: string;
  accent: string;
  fontFamily: string;
};

export const THEMES: Theme[] = [
  {
    id: 'paper',
    name: 'Paper',
    background: '#ffffff',
    text: '#1d2330',
    muted: '#8a93a3',
    accent: '#e0573f',
    fontFamily: 'Arial',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    background: '#14213d',
    text: '#f4f6fb',
    muted: '#8c9ab8',
    accent: '#fca311',
    fontFamily: 'Arial',
  },
  {
    id: 'forest',
    name: 'Forest',
    background: '#f1f6ef',
    text: '#1f3d2b',
    muted: '#7c9486',
    accent: '#2e7d4f',
    fontFamily: 'Georgia',
  },
  {
    id: 'classic',
    name: 'Classic',
    background: '#faf6ee',
    text: '#2d2a26',
    muted: '#9a9286',
    accent: '#7b2d26',
    fontFamily: 'Times New Roman',
  },
];

export function themeOf(deck: Pick<Deck, 'themeId'>): Theme {
  return THEMES.find((theme) => theme.id === deck.themeId) ?? THEMES[0]!;
}

export const TRANSITIONS: { value: Transition; label: string }[] = [
  { value: 'none', label: 'No transition' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide', label: 'Slide in' },
];

export const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 44, 54, 66, 80];

export const PLACEHOLDER_HINTS: Record<TextRole, string> = {
  title: 'Click to add a title',
  subtitle: 'Click to add a subtitle',
  body: 'Click to add text',
  body2: 'Click to add text',
};

type BoxSpec = Pick<
  TextElement,
  'x' | 'y' | 'width' | 'height' | 'fontSize' | 'align' | 'bold' | 'bullets'
> & { role: TextRole };

const MARGIN = 60;
const CONTENT_WIDTH = SLIDE_WIDTH - MARGIN * 2;

const TITLE_BAR: BoxSpec = {
  role: 'title',
  x: MARGIN,
  y: 36,
  width: CONTENT_WIDTH,
  height: 70,
  fontSize: 36,
  align: 'left',
  bold: true,
  bullets: false,
};

export const LAYOUTS: { id: LayoutId; name: string; boxes: BoxSpec[] }[] = [
  {
    id: 'title',
    name: 'Title slide',
    boxes: [
      {
        role: 'title',
        x: MARGIN,
        y: 170,
        width: CONTENT_WIDTH,
        height: 110,
        fontSize: 54,
        align: 'center',
        bold: true,
        bullets: false,
      },
      {
        role: 'subtitle',
        x: MARGIN,
        y: 300,
        width: CONTENT_WIDTH,
        height: 60,
        fontSize: 24,
        align: 'center',
        bold: false,
        bullets: false,
      },
    ],
  },
  {
    id: 'content',
    name: 'Title and content',
    boxes: [
      TITLE_BAR,
      {
        role: 'body',
        x: MARGIN,
        y: 120,
        width: CONTENT_WIDTH,
        height: 360,
        fontSize: 24,
        align: 'left',
        bold: false,
        bullets: true,
      },
    ],
  },
  {
    id: 'section',
    name: 'Section heading',
    boxes: [
      {
        role: 'title',
        x: MARGIN,
        y: 210,
        width: CONTENT_WIDTH,
        height: 90,
        fontSize: 44,
        align: 'left',
        bold: true,
        bullets: false,
      },
      {
        role: 'subtitle',
        x: MARGIN,
        y: 310,
        width: CONTENT_WIDTH,
        height: 50,
        fontSize: 20,
        align: 'left',
        bold: false,
        bullets: false,
      },
    ],
  },
  {
    id: 'two-content',
    name: 'Two columns',
    boxes: [
      TITLE_BAR,
      {
        role: 'body',
        x: MARGIN,
        y: 120,
        width: 400,
        height: 360,
        fontSize: 20,
        align: 'left',
        bold: false,
        bullets: true,
      },
      {
        role: 'body2',
        x: 500,
        y: 120,
        width: 400,
        height: 360,
        fontSize: 20,
        align: 'left',
        bold: false,
        bullets: true,
      },
    ],
  },
  { id: 'blank', name: 'Blank', boxes: [] },
];

function newId(): string {
  return crypto.randomUUID();
}

function textFromBox(box: BoxSpec): TextElement {
  return {
    id: newId(),
    type: 'text',
    text: '',
    rotation: 0,
    italic: false,
    ...box,
  };
}

function layoutOf(id: LayoutId) {
  return LAYOUTS.find((layout) => layout.id === id) ?? LAYOUTS[1]!;
}

export function createSlide(layout: LayoutId): Slide {
  return {
    id: newId(),
    layout,
    elements: layoutOf(layout).boxes.map(textFromBox),
    notes: '',
    transition: 'none',
  };
}

export function createDeck(): Deck {
  return { themeId: THEMES[0]!.id, slides: [createSlide('title')] };
}

/** Gives a copy new ids, so it and the original can't be confused. */
export function copySlide(slide: Slide): Slide {
  return {
    ...slide,
    id: newId(),
    elements: slide.elements.map((element) => ({ ...element, id: newId() })),
  };
}

export function copyElement<T extends SlideElement>(element: T): T {
  return { ...element, id: newId(), x: element.x + 20, y: element.y + 20 };
}

export function createTextBox(): TextElement {
  return {
    id: newId(),
    type: 'text',
    text: '',
    x: 280,
    y: 220,
    width: 400,
    height: 60,
    rotation: 0,
    fontSize: 24,
    bold: false,
    italic: false,
    bullets: false,
    align: 'left',
  };
}

export function createShape(shape: ShapeKind): ShapeElement {
  const isLine = shape === 'line';
  return {
    id: newId(),
    type: 'shape',
    shape,
    x: 380,
    y: isLine ? 270 : 170,
    width: 200,
    height: isLine ? 4 : 200,
    rotation: 0,
  };
}

/** A picture as large as it can be while fitting comfortably on the slide. */
export function createImage(src: string, alt: string, width: number, height: number): ImageElement {
  const scale = Math.min(1, (SLIDE_WIDTH * 0.6) / width, (SLIDE_HEIGHT * 0.6) / height);
  const scaledWidth = Math.round(width * scale);
  const scaledHeight = Math.round(height * scale);
  return {
    id: newId(),
    type: 'image',
    src,
    alt,
    x: Math.round((SLIDE_WIDTH - scaledWidth) / 2),
    y: Math.round((SLIDE_HEIGHT - scaledHeight) / 2),
    width: scaledWidth,
    height: scaledHeight,
    rotation: 0,
  };
}

/**
 * Rearranges a slide for a new layout. Text in a box goes to the new box with the same role, what you
 * added yourself stays where it is, and empty boxes the new layout doesn't have go away.
 */
export function applyLayout(slide: Slide, layout: LayoutId): SlideElement[] {
  const { boxes } = layoutOf(layout);
  const kept: SlideElement[] = [];
  const unfilled = [...boxes];

  for (const element of slide.elements) {
    if (element.type !== 'text' || !element.role) {
      kept.push(element);
      continue;
    }
    const index = unfilled.findIndex((box) => box.role === element.role);
    if (index >= 0) {
      const box = unfilled.splice(index, 1)[0]!;
      kept.push({ ...element, ...box, text: element.text, id: element.id });
    } else if (element.text.trim()) {
      kept.push(element);
    }
  }
  return [...kept, ...unfilled.map(textFromBox)];
}

export function isEmptyPlaceholder(element: SlideElement): boolean {
  return element.type === 'text' && !element.text.trim();
}

/** Short text for lists of slides, and for screen readers. */
export function describeElement(element: SlideElement): string {
  if (element.type === 'image') return element.alt ? `Image: ${element.alt}` : 'Image';
  if (element.type === 'shape') return `Shape: ${element.shape}`;
  if (element.text.trim()) return `Text: ${element.text.trim().slice(0, 60)}`;
  return element.role ? `Empty ${element.role} box` : 'Empty text box';
}

export class UnsupportedVersionError extends Error {
  constructor(readonly version: number) {
    super(`Presentation was saved by a newer version of FreeDeck (schema ${version})`);
    this.name = 'UnsupportedVersionError';
  }
}

/** Reads a stored body. New presentations are stored with null data. */
export function readDeck(content: DocContent<Deck | null> | undefined): Deck {
  if (!content) return createDeck();
  // Refuse rather than load: autosave would overwrite data this version doesn't understand.
  if (content.schemaVersion > DECK_SCHEMA_VERSION) {
    throw new UnsupportedVersionError(content.schemaVersion);
  }
  return content.data?.slides?.length ? content.data : createDeck();
}
