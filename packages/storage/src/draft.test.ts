import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDraft, readDraft, writeDraft } from './draft';

const doc = { type: 'doc', content: [{ type: 'paragraph' }] };

describe('recovery drafts', () => {
  afterEach(() => void vi.restoreAllMocks());

  it('returns a draft newer than the last save, until cleared', () => {
    writeDraft('a', doc, 200);
    expect(readDraft('a', 100)).toEqual(doc);
    expect(readDraft('a', 200)).toEqual(doc);
    clearDraft('a');
    expect(readDraft('a', 100)).toBeUndefined();
  });

  it('ignores a draft older than the last save', () => {
    writeDraft('a', doc, 100);
    expect(readDraft('a', 200)).toBeUndefined();
  });

  it('keeps documents separate', () => {
    writeDraft('a', doc, 100);
    expect(readDraft('b', 0)).toBeUndefined();
  });

  it('ignores corrupt data', () => {
    localStorage.setItem('free360.draft.a', '{not json');
    expect(readDraft('a', 0)).toBeUndefined();
  });

  it('survives storage being full', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(() => writeDraft('a', doc)).not.toThrow();
  });
});
