import type { Extensions } from '@tiptap/core';
import { Image } from '@tiptap/extension-image';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { TableKit } from '@tiptap/extension-table';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { StarterKit } from '@tiptap/starter-kit';
import { FindReplace } from './findReplace';
import { ParagraphFormat } from './paragraphFormat';

/** The document schema. Shared by the editor and .docx import so they accept the same content. */
export const writeExtensions: Extensions = [
  StarterKit.configure({ link: { openOnClick: false } }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Image.configure({ allowBase64: true }),
  TableKit.configure({ table: { resizable: false } }),
  // Line spacing belongs to whole paragraphs here (see ParagraphFormat), not to runs of text.
  TextStyleKit.configure({ lineHeight: false }),
  Subscript,
  Superscript,
  ParagraphFormat,
  FindReplace,
];
