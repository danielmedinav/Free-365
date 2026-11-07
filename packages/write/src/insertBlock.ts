import type { NodeType } from '@tiptap/pm/model';
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';

/**
 * Inserts a block at the cursor and moves the cursor into a paragraph after it. Left to itself the
 * editor keeps the new block selected, and the next key typed would replace it.
 */
export function insertBlockAndContinue(state: EditorState, tr: Transaction, type: NodeType): void {
  const { paragraph } = state.schema.nodes;
  const start = Math.max(tr.selection.from - 1, 0);
  tr.replaceSelectionWith(type.create());

  // It can replace an empty paragraph, or land after the one the cursor was in, so look for where
  // it went, starting just before the cursor.
  let after = -1;
  tr.doc.nodesBetween(start, tr.doc.content.size, (node, pos) => {
    if (after < 0 && node.type === type && pos >= start) after = pos + 1;
    return after < 0;
  });
  if (after < 0 || !paragraph) return;

  const next = tr.doc.resolve(after).nodeAfter;
  if (!next || !next.isTextblock) tr.insert(after, paragraph.create());
  tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView();
}
