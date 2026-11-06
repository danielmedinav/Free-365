import JSZip from 'jszip';
import { readPageSetup, type PageNumberPlacement, type PageSetup } from '../pageSetup';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const RELATIONSHIP_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const TWIPS_PER_INCH = 1440;

function child(parent: Element | null | undefined, name: string): Element | null {
  if (!parent) return null;
  for (const element of parent.children) {
    if (element.namespaceURI === WORD_NS && element.localName === name) return element;
  }
  return null;
}

function inches(element: Element | null, name: string): number | undefined {
  const twips = Number(element?.getAttributeNS(WORD_NS, name));
  return twips > 0 ? twips / TWIPS_PER_INCH : undefined;
}

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml');
}

type Zone = { text: string; hasPageNumber: boolean };

function readZone(xml: Document): Zone {
  const paragraphs = Array.from(xml.getElementsByTagNameNS(WORD_NS, 'p')).map((paragraph) =>
    Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 't'))
      .map((t) => t.textContent)
      .join(''),
  );
  const fields = [
    ...Array.from(xml.getElementsByTagNameNS(WORD_NS, 'instrText')).map((f) => f.textContent),
    ...Array.from(xml.getElementsByTagNameNS(WORD_NS, 'fldSimple')).map((f) =>
      f.getAttributeNS(WORD_NS, 'instr'),
    ),
  ];
  return {
    // FreeWrite headers are one plain line, so a multi-paragraph one is joined up.
    text: paragraphs.filter(Boolean).join(' ').trim(),
    hasPageNumber: fields.some((field) => /^\s*PAGE\b/.test(field ?? '')),
  };
}

async function readReferencedZone(
  zip: JSZip,
  section: Element,
  referenceName: string,
): Promise<Zone | undefined> {
  const reference = Array.from(section.children).find(
    (element) =>
      element.namespaceURI === WORD_NS &&
      element.localName === referenceName &&
      element.getAttributeNS(WORD_NS, 'type') === 'default',
  );
  const id = reference?.getAttributeNS(RELATIONSHIP_NS, 'id');
  const relationships = await zip.file('word/_rels/document.xml.rels')?.async('text');
  if (!id || !relationships) return undefined;

  const target = Array.from(parseXml(relationships).getElementsByTagName('Relationship'))
    .find((relationship) => relationship.getAttribute('Id') === id)
    ?.getAttribute('Target');
  if (!target) return undefined;

  const path = target.startsWith('/') ? target.slice(1) : `word/${target}`;
  const part = await zip.file(path)?.async('text');
  return part ? readZone(parseXml(part)) : undefined;
}

/** Reads the paper size, margins, header, and footer of a .docx file's last section. */
export async function readDocxPageSetup(file: ArrayBuffer): Promise<PageSetup> {
  const zip = await JSZip.loadAsync(file);
  const main = await zip.file('word/document.xml')?.async('text');
  const body = main ? parseXml(main).getElementsByTagNameNS(WORD_NS, 'body')[0] : undefined;
  const section = child(body, 'sectPr');
  if (!section) return readPageSetup(undefined);

  const size = child(section, 'pgSz');
  const margins = child(section, 'pgMar');
  const header = await readReferencedZone(zip, section, 'headerReference');
  const footer = await readReferencedZone(zip, section, 'footerReference');
  const pageNumbers: PageNumberPlacement = footer?.hasPageNumber
    ? 'footer'
    : header?.hasPageNumber
      ? 'header'
      : 'none';

  return readPageSetup({
    widthIn: inches(size, 'w'),
    heightIn: inches(size, 'h'),
    marginTopIn: inches(margins, 'top'),
    marginBottomIn: inches(margins, 'bottom'),
    marginLeftIn: inches(margins, 'left'),
    marginRightIn: inches(margins, 'right'),
    headerText: header?.text,
    footerText: footer?.text,
    pageNumbers,
  });
}
