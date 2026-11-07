export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

export type Autosaver = {
  /** Call on every change; the save runs once changes pause for `delay` ms. */
  markDirty(): void;
  /** Saves now if there are unsaved changes. Resolves once everything is written. */
  flush(): Promise<void>;
  getStatus(): SaveStatus;
  subscribe(listener: () => void): () => void;
};

type AutosaverOptions = {
  save: () => Promise<unknown>;
  delay?: number;
};

export function createAutosaver({ save, delay = 500 }: AutosaverOptions): Autosaver {
  const listeners = new Set<() => void>();
  let status: SaveStatus = 'saved';
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Saves run one at a time so an older snapshot can never overwrite a newer one.
  let queue: Promise<void> = Promise.resolve();

  function setStatus(next: SaveStatus) {
    if (next === status) return;
    status = next;
    listeners.forEach((l) => l());
  }

  async function saveIfDirty() {
    if (!dirty) return;
    dirty = false;
    setStatus('saving');
    try {
      await save();
      setStatus(dirty ? 'pending' : 'saved');
    } catch (error) {
      // Stay dirty so the next change or flush retries.
      dirty = true;
      setStatus('error');
      console.error('Autosave failed', error);
    }
  }

  function flush() {
    clearTimeout(timer);
    queue = queue.then(saveIfDirty);
    return queue;
  }

  return {
    markDirty() {
      dirty = true;
      setStatus('pending');
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), delay);
    },
    flush,
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
