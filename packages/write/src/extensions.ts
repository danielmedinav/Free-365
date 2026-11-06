import type { Extensions } from '@tiptap/core';
import { HardBreak } from '@tiptap/extension-hard-break';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { TableKit } from '@tiptap/extension-table';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { StarterKit } from '@tiptap/starter-kit';
import { FindReplace } from './findReplace';
import { ResizableImage } from './imageExtension';
import { PageBreak, PageLayout } from './pageLayout';
import { ParagraphFormat } from './paragraphFormat';
import { TableFormat } from './tableFormat';

/** The document schema. Shared by the editor and .docx import so they accept the same content. */
export const writeExtensions: Extensions = [
  StarterKit.configure({ hardBreak: false, link: { openOnClick: false } }),
  // Mod-Enter is the page break here, as it is in most word processors.
  HardBreak.extend({
    addKeyboardShortcuts() {
      return { 'Shift-Enter': () => this.editor.commands.setHardBreak() };
    },
  }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  ResizableImage.configure({ allowBase64: true }),
  TableKit.configure({ table: { resizable: true, cellMinWidth: 40 } }),
  TableFormat,
  // Line spacing belongs to whole paragraphs here (see ParagraphFormat), not to runs of text.
  TextStyleKit.configure({ lineHeight: false }),
  Subscript,
  Superscript,
  ParagraphFormat,
  PageLayout,
  PageBreak,
  FindReplace,
];
