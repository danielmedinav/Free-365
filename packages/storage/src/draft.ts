/**
 * A page that is closing can be torn down before an IndexedDB save finishes, and localStorage is
 * the only storage that writes synchronously. So unsaved work is also parked here on the way out,
 * then moved into the document the next time it opens.
 */
type Draft<T> = { doc: T; savedAt: number };

const draftKey = (id: string) => `free360.draft.${id}`;

/** Best effort: a document with large images may not fit, and then only the normal save runs. */
export function writeDraft<T>(id: string, doc: T, now: number = Date.now()): void {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify({ doc, savedAt: now } satisfies Draft<T>));
  } catch (error) {
    console.warn('Could not store a recovery copy', error);
  }
}

/** Returns the parked document if it is at least as new as the last save. */
export function readDraft<T>(id: string, updatedAt: number): T | undefined {
  const stored = localStorage.getItem(draftKey(id));
  if (!stored) return undefined;
  try {
    const draft = JSON.parse(stored) as Draft<T>;
    return draft.savedAt >= updatedAt ? draft.doc : undefined;
  } catch {
    return undefined;
  }
}

export function clearDraft(id: string): void {
  localStorage.removeItem(draftKey(id));
}
