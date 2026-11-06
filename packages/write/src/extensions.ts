import type { Extensions } from '@tiptap/core';
import { Image } from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { TextAlign } from '@tiptap/extension-text-align';
import { StarterKit } from '@tiptap/starter-kit';
import { FindReplace } from './findReplace';

/** The document schema. Shared by the editor and .docx import so they accept the same content. */
export const writeExtensions: Extensions = [
  StarterKit.configure({ link: { openOnClick: false } }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Image.configure({ allowBase64: true }),
  TableKit.configure({ table: { resizable: false } }),
  FindReplace,
];
