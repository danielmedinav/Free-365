import { generateJSON, type JSONContent } from '@tiptap/core';
import mammoth from 'mammoth';
import { writeExtensions } from '../extensions';
import { applyDirectFormatting, embedDirectFormatting } from './directFormatting';
import { CODE_BLOCK_STYLE, DIVIDER_STYLE, INLINE_CODE_STYLE, QUOTE_STYLE } from './styleNames';

const STYLE_MAP = [
  'u => u',
  `p[style-name='${QUOTE_STYLE}'] => blockquote > p:fresh`,
  `p[style-name='${CODE_BLOCK_STYLE}'] => pre:separator('\\n')`,
  `p[style-name='${DIVIDER_STYLE}'] => hr:fresh`,
  `r[style-name='${INLINE_CODE_STYLE}'] => code`,
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
  return generateJSON(applyDirectFormatting(value), writeExtensions);
}
