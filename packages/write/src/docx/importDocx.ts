import { generateJSON, type JSONContent } from '@tiptap/core';
import mammoth from 'mammoth';
import { writeExtensions } from '../extensions';
import { CODE_BLOCK_STYLE, DIVIDER_STYLE, INLINE_CODE_STYLE, QUOTE_STYLE } from './styleNames';

const ALIGN_CLASS_PREFIX = 'fs-align-';
/** .docx alignment values that differ from the default, mapped to CSS `text-align`. */
const ALIGNMENTS: Record<string, string> = {
  center: 'center',
  right: 'right',
  end: 'right',
  both: 'justify',
};
const ALIGN_VALUES = ['center', 'right', 'justify'];
const HEADING_LEVELS = [1, 2, 3, 4, 5, 6];

/**
 * Mammoth drops paragraph alignment, but its style map can match on names. So aligned paragraphs
 * are renamed to a generated style (see `tagAlignment`) that maps to a class, which
 * `applyAlignment` then turns into the inline style the editor understands.
 */
const alignedStyle = (align: string, level?: number) => `fs ${level ? `h${level} ` : ''}${align}`;

const STYLE_MAP = [
  'u => u',
  `p[style-name='${QUOTE_STYLE}'] => blockquote > p:fresh`,
  `p[style-name='${CODE_BLOCK_STYLE}'] => pre:separator('\\n')`,
  `p[style-name='${DIVIDER_STYLE}'] => hr:fresh`,
  `r[style-name='${INLINE_CODE_STYLE}'] => code`,
  ...ALIGN_VALUES.flatMap((align) => [
    `p[style-name='${alignedStyle(align)}'] => p.${ALIGN_CLASS_PREFIX}${align}:fresh`,
    ...HEADING_LEVELS.map(
      (level) =>
        `p[style-name='${alignedStyle(align, level)}'] => h${level}.${ALIGN_CLASS_PREFIX}${align}:fresh`,
    ),
  ]),
];

type MammothElement = {
  type?: string;
  alignment?: string | null;
  numbering?: unknown;
  styleName?: string | null;
  children?: MammothElement[];
};

function headingLevel(styleName: string | null | undefined): number | undefined {
  const name = styleName?.toLowerCase() ?? '';
  if (name === 'title') return 1;
  if (name === 'subtitle') return 2;
  const level = /^heading ([1-6])$/.exec(name)?.[1];
  return level ? Number(level) : undefined;
}

function tagAlignment(element: MammothElement): MammothElement {
  const children = element.children?.map(tagAlignment);
  const align = element.alignment ? ALIGNMENTS[element.alignment] : undefined;
  const level = headingLevel(element.styleName);
  // Only plain paragraphs and headings: renaming a list item or custom style would lose its role.
  const taggable = element.type === 'paragraph' && !element.numbering;
  if (align && taggable && (level || !element.styleName)) {
    return { ...element, children, styleName: alignedStyle(align, level) };
  }
  return children ? { ...element, children } : element;
}

function applyAlignment(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  for (const align of ALIGN_VALUES) {
    const className = `${ALIGN_CLASS_PREFIX}${align}`;
    for (const element of parsed.body.querySelectorAll<HTMLElement>(`.${className}`)) {
      element.classList.remove(className);
      element.style.textAlign = align;
    }
  }
  return parsed.body.innerHTML;
}

/** Converts a .docx file to a FreeWrite document. The editor's schema drops unsupported content. */
export async function importDocx(file: ArrayBuffer): Promise<JSONContent> {
  // Mammoth's browser build reads `arrayBuffer`, its Node build (used in tests) reads `buffer`.
  const input = { arrayBuffer: file, buffer: file };
  const { value } = await mammoth.convertToHtml(input, {
    styleMap: STYLE_MAP,
    ignoreEmptyParagraphs: false,
    transformDocument: tagAlignment,
  });
  return generateJSON(applyAlignment(value), writeExtensions);
}
