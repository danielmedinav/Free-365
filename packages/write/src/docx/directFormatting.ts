import JSZip from 'jszip';

/**
 * Mammoth converts a .docx to HTML but leaves out fonts, sizes, colors, line spacing, indents, and
 * alignment. So before it runs, those settings are written into the document's text between private
 * marker characters, where Mammoth passes them through untouched. Afterwards the markers in its HTML
 * are turned into real inline styles, which the editor understands.
 */
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const DOCUMENT_PATH = 'word/document.xml';

// Unicode private-use characters, which never appear in real documents.
const RUN_START = '';
const RUN_TEXT = '';
const RUN_END = '';
const BLOCK_START = '';
const BLOCK_END = '';

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
    const properties = child(paragraph, 'pPr');
    const styles = blockStyles(properties);
    if (isEmpty(styles)) continue;
    const run = xml.createElementNS(WORD_NS, 'w:r');
    const text = xml.createElementNS(WORD_NS, 'w:t');
    text.textContent = `${BLOCK_START}${JSON.stringify(styles)}${BLOCK_END}`;
    run.append(text);
    paragraph.insertBefore(run, properties ? properties.nextSibling : paragraph.firstChild);
  }
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
    element.style.setProperty(name, value);
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

/** Turns the markers in Mammoth's HTML into inline styles. */
export function applyDirectFormatting(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const walker = parsed.createTreeWalker(parsed.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    if (/[-]/.test(node.data)) applyToTextNode(node, parsed);
  }
  return parsed.body.innerHTML;
}
