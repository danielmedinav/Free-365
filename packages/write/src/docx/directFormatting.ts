import JSZip from 'jszip';

/**
 * Mammoth converts a .docx to HTML but leaves out fonts, sizes, colors, line spacing, indents, and
 * alignment. So before it runs, those settings are written into the document's text between private
 * marker characters, where Mammoth passes them through untouched. Afterwards the markers in its HTML
 * are turned into real inline styles, which the editor understands.
 */
export const PAGE_BREAK_CLASS = 'fs-page-break';
const COLUMNS_ATTRIBUTE = 'data-fs-columns';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const EMU_PER_PIXEL = 9525;
const TWIPS_PER_PIXEL = 15;
const DOCUMENT_PATH = 'word/document.xml';

// Unicode private-use characters, which never appear in real documents.
const RUN_START = '';
const RUN_TEXT = '';
const RUN_END = '';
const BLOCK_START = '';
const BLOCK_END = '';
const IMAGE_DATA = '\ue005';

const HALF_INCH_TWIPS = 720;
const SINGLE_LINE = 240;

const HIGHLIGHT_NAMES: Record<string, string> = {
  black: '#000000',
  blue: '#0000ff',
  cyan: '#00ffff',
  darkBlue: '#000080',
  darkCyan: '#008080',
  darkGray: '#808080',
  darkGreen: '#008000',
  darkMagenta: '#800080',
  darkRed: '#800000',
  darkYellow: '#808000',
  green: '#00ff00',
  lightGray: '#c0c0c0',
  magenta: '#ff00ff',
  red: '#ff0000',
  white: '#ffffff',
  yellow: '#ffff00',
};

const ALIGNMENTS: Record<string, string> = {
  center: 'center',
  right: 'right',
  end: 'right',
  both: 'justify',
};

type Styles = Record<string, string>;

/** Not sent to CSS: asks for a page break node in front of the paragraph. */
const BREAK_BEFORE = 'break-before';
/** Also not CSS: settings for the table cell or whole table this paragraph is in. */
const CELL_BACKGROUND = 'cell-background';
const TABLE_COLUMNS = 'table-columns';

function child(parent: Element | null | undefined, name: string): Element | null {
  if (!parent) return null;
  for (const element of parent.children) {
    if (element.namespaceURI === WORD_NS && element.localName === name) return element;
  }
  return null;
}

function attr(element: Element | null, name: string): string | null {
  return element?.getAttributeNS(WORD_NS, name) ?? null;
}

function hexValue(value: string | null): string | undefined {
  return value && /^[0-9a-f]{6}$/i.test(value) ? `#${value.toLowerCase()}` : undefined;
}

function runStyles(properties: Element | null): Styles {
  const styles: Styles = {};
  const font = attr(child(properties, 'rFonts'), 'ascii');
  // Names come from the file, so keep only what real font names use.
  const safeFont = font?.replace(/[^\p{L}\p{N} _-]/gu, '').trim();
  if (safeFont) styles['font-family'] = `"${safeFont}"`;

  const halfPoints = Number(attr(child(properties, 'sz'), 'val'));
  if (halfPoints > 0) styles['font-size'] = `${halfPoints / 2}pt`;

  const color = hexValue(attr(child(properties, 'color'), 'val'));
  if (color) styles.color = color;

  const highlight = HIGHLIGHT_NAMES[attr(child(properties, 'highlight'), 'val') ?? ''];
  const shading = hexValue(attr(child(properties, 'shd'), 'fill'));
  if (highlight ?? shading) styles['background-color'] = (highlight ?? shading)!;
  return styles;
}

function blockStyles(properties: Element | null): Styles {
  const styles: Styles = {};
  const breakBefore = child(properties, 'pageBreakBefore');
  if (breakBefore && attr(breakBefore, 'val') !== '0' && attr(breakBefore, 'val') !== 'false') {
    styles[BREAK_BEFORE] = 'page';
  }

  const align = ALIGNMENTS[attr(child(properties, 'jc'), 'val') ?? ''];
  if (align) styles['text-align'] = align;

  const spacing = child(properties, 'spacing');
  const rule = attr(spacing, 'lineRule');
  const line = Number(attr(spacing, 'line'));
  // "exact" and "atLeast" spacing are fixed heights, which have no line-height equivalent.
  if (line > 0 && (!rule || rule === 'auto')) {
    styles['line-height'] = String(Number((line / SINGLE_LINE).toFixed(2)));
  }

  // A list item's indent comes from its nesting level instead.
  if (!child(properties, 'numPr')) {
    const indent = child(properties, 'ind');
    const left = Number(attr(indent, 'left') ?? attr(indent, 'start'));
    const levels = Math.round(left / HALF_INCH_TWIPS);
    if (levels > 0) styles['margin-left'] = `${levels * 0.5}in`;
  }
  return styles;
}

function drawingChild(parent: Element, name: string): Element | undefined {
  return Array.from(parent.children).find(
    (element) => element.namespaceURI === DRAWING_NS && element.localName === name,
  );
}

function imageLayout(drawing: Element, inline: boolean): string {
  if (inline) {
    const paragraph = drawing.closest('p');
    const align = ALIGNMENTS[attr(child(child(paragraph, 'pPr'), 'jc'), 'val') ?? ''];
    return align === 'center' || align === 'right' ? align : 'left';
  }
  const horizontal = drawingChild(drawing, 'positionH');
  const align = horizontal && drawingChild(horizontal, 'align')?.textContent;
  const wraps = ['wrapSquare', 'wrapTight', 'wrapThrough'].some((name) =>
    drawingChild(drawing, name),
  );
  if (wraps) return align === 'right' ? 'wrap-right' : 'wrap-left';
  return align === 'center' || align === 'right' ? align : 'left';
}

/** Mammoth only keeps an image's alt text, so its size and position travel at the end of that. */
function embedImageData(xml: Document): void {
  for (const drawing of xml.getElementsByTagNameNS(WORD_NS, 'drawing')) {
    const inline = drawingChild(drawing, 'inline');
    const shape = inline ?? drawingChild(drawing, 'anchor');
    const properties = shape && drawingChild(shape, 'docPr');
    if (!shape || !properties) continue;
    const pixels = Number(drawingChild(shape, 'extent')?.getAttribute('cx')) / EMU_PER_PIXEL;
    const data = JSON.stringify({
      width: pixels > 0 ? Math.round(pixels) : undefined,
      layout: imageLayout(shape, !!inline),
    });
    const alt = properties.getAttribute('descr') ?? '';
    properties.setAttribute('descr', `${alt}${IMAGE_DATA}${data}`);
  }
}

function insertBlockMarker(xml: Document, paragraph: Element, styles: Styles): void {
  const properties = child(paragraph, 'pPr');
  const run = xml.createElementNS(WORD_NS, 'w:r');
  const text = xml.createElementNS(WORD_NS, 'w:t');
  text.textContent = `${BLOCK_START}${JSON.stringify(styles)}${BLOCK_END}`;
  run.append(text);
  paragraph.insertBefore(run, properties ? properties.nextSibling : paragraph.firstChild);
}

/** Equal columns are left out, so such a table keeps fitting whatever page it's on. */
function customColumns(table: Element): number[] | undefined {
  const grid = child(table, 'tblGrid');
  if (!grid) return undefined;
  const widths = Array.from(grid.children).map((column) => Number(attr(column, 'w')));
  if (!widths.length || widths.some((width) => !(width > 0))) return undefined;
  const allEqual = widths.every((width) => Math.abs(width - widths[0]!) <= widths[0]! * 0.01);
  return allEqual ? undefined : widths.map((width) => Math.round(width / TWIPS_PER_PIXEL));
}

function embedTableData(xml: Document): void {
  // Mammoth treats any mention of this as "on", which would make every row of such a table a header.
  for (const flag of Array.from(xml.getElementsByTagNameNS(WORD_NS, 'tblHeader'))) {
    if (['0', 'false', 'off'].includes(attr(flag, 'val') ?? '')) flag.remove();
  }

  for (const table of xml.getElementsByTagNameNS(WORD_NS, 'tbl')) {
    const columns = customColumns(table);
    const firstCell = child(child(table, 'tr'), 'tc');
    const firstParagraph = child(firstCell, 'p');
    if (columns && firstParagraph) {
      insertBlockMarker(xml, firstParagraph, { [TABLE_COLUMNS]: JSON.stringify(columns) });
    }
  }
  for (const cell of xml.getElementsByTagNameNS(WORD_NS, 'tc')) {
    const fill = hexValue(attr(child(child(cell, 'tcPr'), 'shd'), 'fill'));
    const paragraph = child(cell, 'p');
    // Every cell gets a marker, even with no color: Mammoth drops a table whose cells are all empty.
    if (paragraph) insertBlockMarker(xml, paragraph, fill ? { [CELL_BACKGROUND]: fill } : {});
  }
}

function isEmpty(styles: Styles): boolean {
  return Object.keys(styles).length === 0;
}

function embedInDocument(xml: Document): void {
  for (const run of xml.getElementsByTagNameNS(WORD_NS, 'r')) {
    const styles = runStyles(child(run, 'rPr'));
    if (isEmpty(styles)) continue;
    const payload = JSON.stringify(styles);
    for (const element of run.children) {
      if (element.namespaceURI === WORD_NS && element.localName === 't') {
        element.textContent = `${RUN_START}${payload}${RUN_TEXT}${element.textContent}${RUN_END}`;
      }
    }
  }

  for (const paragraph of Array.from(xml.getElementsByTagNameNS(WORD_NS, 'p'))) {
    const styles = blockStyles(child(paragraph, 'pPr'));
    if (!isEmpty(styles)) insertBlockMarker(xml, paragraph, styles);
  }

  embedImageData(xml);
  embedTableData(xml);
}

/** Returns a copy of the .docx with its direct formatting embedded in the text. */
export async function embedDirectFormatting(file: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(file);
  const entry = zip.file(DOCUMENT_PATH);
  if (!entry) return file;
  const xml = new DOMParser().parseFromString(await entry.async('text'), 'application/xml');
  if (xml.getElementsByTagName('parsererror').length) return file;
  embedInDocument(xml);
  zip.file(DOCUMENT_PATH, new XMLSerializer().serializeToString(xml));
  return zip.generateAsync({ type: 'arraybuffer' });
}

function applyStyles(element: HTMLElement, payload: string): void {
  for (const [name, value] of Object.entries(JSON.parse(payload) as Styles)) {
    if (name === CELL_BACKGROUND) {
      element.closest<HTMLElement>('td, th')?.style.setProperty('background-color', value);
    } else if (name === TABLE_COLUMNS) {
      element.closest('table')?.setAttribute(COLUMNS_ATTRIBUTE, value);
    } else if (name === BREAK_BEFORE) {
      const pageBreak = element.ownerDocument.createElement('hr');
      pageBreak.className = PAGE_BREAK_CLASS;
      element.before(pageBreak);
    } else {
      element.style.setProperty(name, value);
    }
  }
}

const BLOCK_PATTERN = new RegExp(`${BLOCK_START}(.*?)${BLOCK_END}`, 'gs');
const RUN_PATTERN = new RegExp(`${RUN_START}(.*?)${RUN_TEXT}(.*?)${RUN_END}`, 'gs');

function applyToTextNode(node: Text, parsed: Document): void {
  let text = node.data;

  for (const [marker, payload] of text.matchAll(BLOCK_PATTERN)) {
    text = text.replace(marker, '');
    const block = node.parentElement?.closest<HTMLElement>('p, h1, h2, h3, h4, h5, h6');
    if (block) applyStyles(block, payload!);
  }

  const fragment = parsed.createDocumentFragment();
  let position = 0;
  for (const match of text.matchAll(RUN_PATTERN)) {
    fragment.append(text.slice(position, match.index));
    const span = parsed.createElement('span');
    applyStyles(span, match[1]!);
    span.textContent = match[2]!;
    fragment.append(span);
    position = match.index + match[0].length;
  }
  fragment.append(text.slice(position));
  node.replaceWith(fragment);
}

/** Gives each cell its column widths, allowing for merged cells. */
function applyColumnWidths(table: Element): void {
  const widths = JSON.parse(table.getAttribute(COLUMNS_ATTRIBUTE) ?? '[]') as number[];
  table.removeAttribute(COLUMNS_ATTRIBUTE);
  const occupied = widths.map(() => 0);
  for (const row of table.querySelectorAll('tr')) {
    let column = 0;
    for (const cell of row.children) {
      while ((occupied[column] ?? 0) > 0) column++;
      const colSpan = Number(cell.getAttribute('colspan') ?? 1);
      const rowSpan = Number(cell.getAttribute('rowspan') ?? 1);
      cell.setAttribute('colwidth', widths.slice(column, column + colSpan).join(','));
      for (let i = column; i < column + colSpan; i++) occupied[i] = rowSpan;
      column += colSpan;
    }
    occupied.forEach((value, index) => {
      if (value > 0) occupied[index] = value - 1;
    });
  }
}

function applyImageData(image: Element): void {
  const [alt = '', data] = (image.getAttribute('alt') ?? '').split(IMAGE_DATA);
  image.setAttribute('alt', alt);
  if (!data) return;
  const { width, layout } = JSON.parse(data) as { width?: number; layout: string };
  if (width) image.setAttribute('width', String(width));
  image.setAttribute('data-layout', layout);
}

/**
 * Images are blocks in the editor, but Mammoth writes them inside paragraphs. Move each one out in
 * front of its paragraph, and drop the paragraph if the image was all it held.
 */
function liftImage(image: Element): void {
  const paragraph = image.closest('p');
  if (!paragraph) return;
  paragraph.before(image);
  if (!paragraph.textContent && !paragraph.querySelector('br, img')) paragraph.remove();
}

/** Turns the markers in Mammoth's HTML into inline styles. */
export function applyDirectFormatting(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const walker = parsed.createTreeWalker(parsed.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    if (/[-]/.test(node.data)) applyToTextNode(node, parsed);
  }
  for (const image of parsed.body.querySelectorAll('img')) {
    applyImageData(image);
    liftImage(image);
  }
  for (const table of parsed.body.querySelectorAll(`table[${COLUMNS_ATTRIBUTE}]`)) {
    applyColumnWidths(table);
  }

  // Mammoth writes a page break inside a paragraph, and HTML splits that around it, leaving empty
  // paragraphs behind that were never in the document.
  for (const pageBreak of parsed.body.querySelectorAll(`hr.${PAGE_BREAK_CLASS}`)) {
    for (const neighbor of [pageBreak.previousElementSibling, pageBreak.nextElementSibling]) {
      if (neighbor?.tagName === 'P' && !neighbor.hasChildNodes()) neighbor.remove();
    }
  }
  return parsed.body.innerHTML;
}
