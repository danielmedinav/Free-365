import type { UndoStack } from '@free360/commands';
import type { Editor } from '@tiptap/core';

/** Adapts TipTap's history to the shared `UndoStack` interface. */
export function createEditorUndoStack(editor: Editor): UndoStack {
  return {
    canUndo: () => editor.can().undo(),
    canRedo: () => editor.can().redo(),
    undo: () => void editor.chain().focus().undo().run(),
    redo: () => void editor.chain().focus().redo().run(),
  };
}
