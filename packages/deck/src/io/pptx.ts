import PptxGenJS from 'pptxgenjs';
import {
  isEmptyPlaceholder,
  themeOf,
  type Deck,
  type ImageElement,
  type ShapeElement,
  type TextElement,
} from '../deck';

/** Slide units are points, and there are 72 to the inch. */
const inches = (units: number) => units / 72;
const color = (hex: string) => hex.replace('#', '').toUpperCase();

type SlideTarget = ReturnType<PptxGenJS['addSlide']>;

function box(element: { x: number; y: number; width: number; height: number; rotation: number }) {
  return {
    x: inches(element.x),
    y: inches(element.y),
    w: inches(element.width),
    h: inches(element.height),
    rotate: ((element.rotation % 360) + 360) % 360,
  };
}

function addText(
  slide: SlideTarget,
  element: TextElement,
  fallback: { text: string; font: string },
) {
  const lines = element.text.split('\n');
  const runs = lines.map((line, index) => ({
    text: line,
    options: {
      bullet: element.bullets && line.trim() ? true : false,
      breakLine: index < lines.length - 1,
    },
  }));
  slide.addText(runs, {
    ...box(element),
    fontSize: element.fontSize,
    fontFace: fallback.font,
    bold: element.bold,
    italic: element.italic,
    align: element.align,
    valign: 'top',
    color: color(element.color ?? fallback.text),
    margin: 0,
  });
}

function shapeType(pptx: PptxGenJS, shape: ShapeElement['shape']) {
  const types = pptx.ShapeType;
  return {
    rectangle: types.rect,
    ellipse: types.ellipse,
    triangle: types.triangle,
    arrow: types.rightArrow,
    line: types.line,
  }[shape];
}

function addShape(pptx: PptxGenJS, slide: SlideTarget, element: ShapeElement, accent: string) {
  const fill = color(element.fill ?? accent);
  slide.addShape(shapeType(pptx, element.shape), {
    ...box(element),
    ...(element.shape === 'line'
      ? { line: { color: fill, width: element.height } }
      : { fill: { color: fill } }),
  });
}

function addImage(slide: SlideTarget, element: ImageElement) {
  slide.addImage({ ...box(element), data: element.src, altText: element.alt });
}

/** Creates a .pptx file. Empty placeholder boxes are left out. */
export async function exportPptx(deck: Deck, title?: string): Promise<Blob> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 inches, which is exactly a slide's 960 x 540 points
  pptx.author = 'Free 360';
  if (title) pptx.title = title;
  const theme = themeOf(deck);

  for (const source of deck.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: color(source.background ?? theme.background) };
    for (const element of source.elements) {
      if (element.type === 'text') {
        if (!isEmptyPlaceholder(element)) {
          addText(slide, element, { text: theme.text, font: theme.fontFamily });
        }
      } else if (element.type === 'shape') {
        addShape(pptx, slide, element, theme.accent);
      } else {
        addImage(slide, element);
      }
    }
    if (source.notes) slide.addNotes(source.notes);
  }

  const buffer = (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}
