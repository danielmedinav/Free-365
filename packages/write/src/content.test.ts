import type { DocContent } from '@free360/core';
import { describe, expect, it } from 'vitest';
import { EMPTY_DOC, readDoc, UnsupportedVersionError, type WriteData } from './content';

const stored = (schemaVersion: number, data: WriteData | null): DocContent<WriteData | null> => ({
  id: 'a',
  kind: 'write',
  schemaVersion,
  data,
});

describe('readDoc', () => {
  it('treats missing content and new (null) documents as empty', () => {
    expect(readDoc(undefined)).toEqual(EMPTY_DOC);
    expect(readDoc(stored(1, null))).toEqual(EMPTY_DOC);
  });

  it('returns the stored document', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph' }, { type: 'paragraph' }] };
    expect(readDoc(stored(1, { doc }))).toBe(doc);
  });

  it('refuses documents from a newer version', () => {
    expect(() => readDoc(stored(99, { doc: EMPTY_DOC }))).toThrow(UnsupportedVersionError);
  });
});
