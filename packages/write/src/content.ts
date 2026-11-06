import type { DocContent } from '@free360/core';
import type { JSONContent } from '@tiptap/core';

/**
 * 2: added text style, sub/superscript, line spacing, and indent. Version 1 documents are still
 * valid; the bump stops an older cached copy of the app from opening, and then overwriting, newer ones.
 */
export const WRITE_SCHEMA_VERSION = 2;

/** The stored body of a FreeWrite document: TipTap's JSON document, wrapped so it can grow. */
export type WriteData = { doc: JSONContent };

export const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

export class UnsupportedVersionError extends Error {
  constructor(readonly version: number) {
    super(`Document was saved by a newer version of FreeWrite (schema ${version})`);
    this.name = 'UnsupportedVersionError';
  }
}

/** Reads a stored body, migrating older versions. New documents are stored with null data. */
export function readDoc(content: DocContent<WriteData | null> | undefined): JSONContent {
  if (!content) return EMPTY_DOC;
  // Refuse rather than load: autosave would overwrite data this version doesn't understand.
  if (content.schemaVersion > WRITE_SCHEMA_VERSION) {
    throw new UnsupportedVersionError(content.schemaVersion);
  }
  return content.data?.doc ?? EMPTY_DOC;
}
