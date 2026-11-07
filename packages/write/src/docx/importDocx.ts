import { generateJSON, type JSONContent } from '@tiptap/core';
import mammoth from 'mammoth';
import { writeExtensions } from '../extensions';
import {
  applyDirectFormatting,
  embedDirectFormatting,
  PAGE_BREAK_CLASS,
  TOC_ENTRY_CLASS,
} from './directFormatting';
import { readDocxPageSetup } from './pageSetupImport';
import {
  CODE_BLOCK_STYLE,
  DIVIDER_STYLE,
  INLINE_CODE_STYLE,
  QUOTE_STYLE,
  TOC_HEADING_STYLE,
  tocStyleName,
} from './styleNames';

const STYLE_MAP = [
  'u => u',
  `br[type='page'] => hr.${PAGE_BREAK_CLASS}`,
  `p[style-name='${QUOTE_STYLE}'] => blockquote > p:fresh`,
  `p[style-name='${CODE_BLOCK_STYLE}'] => pre:separator('\\n')`,
  `p[style-name='${DIVIDER_STYLE}'] => hr:fresh`,
  `r[style-name='${INLINE_CODE_STYLE}'] => code`,
  `p[style-name='${TOC_HEADING_STYLE}'] => p.${TOC_ENTRY_CLASS}:fresh`,
  ...[1, 2, 3, 4, 5, 6].map(
    (level) => `p[style-name='${tocStyleName(level)}'] => p.${TOC_ENTRY_CLASS}:fresh`,
  ),
];

/** Converts a .docx file to a FreeWrite document. The editor's schema drops unsupported content. */
export async function importDocx(file: ArrayBuffer): Promise<JSONContent> {
  const prepared = await embedDirectFormatting(file);
  // Mammoth's browser build reads `arrayBuffer`, its Node build (used in tests) reads `buffer`.
  const input = { arrayBuffer: prepared, buffer: prepared };
  const { value } = await mammoth.convertToHtml(input, {
    styleMap: STYLE_MAP,
    ignoreEmptyParagraphs: false,
  });
  const doc = generateJSON(applyDirectFormatting(value), writeExtensions);
  return { ...doc, attrs: { pageSetup: await readDocxPageSetup(file) } };
}
