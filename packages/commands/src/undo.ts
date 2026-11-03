import type { Command } from './registry';

/** What every app exposes so shared Undo/Redo buttons and shortcuts work the same way. */
export type UndoStack = {
  canUndo(): boolean;
  canRedo(): boolean;
  undo(): void;
  redo(): void;
};

export type UndoEntry = {
  label: string;
  undo: () => void;
  redo: () => void;
};

export type History = UndoStack & {
  /** Records an action that has already been applied. Clears the redo stack. */
  push(entry: UndoEntry): void;
  clear(): void;
  undoLabel(): string | undefined;
  redoLabel(): string | undefined;
  subscribe(listener: () => void): () => void;
};

/** A generic undo/redo history for apps that don't bring their own (FreeDeck, grid formatting). */
export function createHistory({ limit = 200 }: { limit?: number } = {}): History {
  let past: UndoEntry[] = [];
  let future: UndoEntry[] = [];
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  return {
    push(entry) {
      past = [...past, entry].slice(-limit);
      future = [];
      emit();
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    undo() {
      const entry = past[past.length - 1];
      if (!entry) return;
      entry.undo();
      past = past.slice(0, -1);
      future = [...future, entry];
      emit();
    },
    redo() {
      const entry = future[future.length - 1];
      if (!entry) return;
      entry.redo();
      future = future.slice(0, -1);
      past = [...past, entry];
      emit();
    },
    clear() {
      past = [];
      future = [];
      emit();
    },
    undoLabel: () => past[past.length - 1]?.label,
    redoLabel: () => future[future.length - 1]?.label,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Standard `edit.undo` / `edit.redo` commands bound to whichever stack is current. */
export function createUndoCommands(getStack: () => UndoStack | undefined): Command[] {
  return [
    {
      id: 'edit.undo',
      label: 'Undo',
      shortcut: 'Mod+Z',
      allowInInputs: true,
      isEnabled: () => getStack()?.canUndo() ?? false,
      run: () => getStack()?.undo(),
    },
    {
      id: 'edit.redo',
      label: 'Redo',
      shortcut: ['Mod+Shift+Z', 'Mod+Y'],
      allowInInputs: true,
      isEnabled: () => getStack()?.canRedo() ?? false,
      run: () => getStack()?.redo(),
    },
  ];
}
