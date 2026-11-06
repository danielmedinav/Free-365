import { Extension } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import { INDENT_STEP_INCHES, MAX_INDENT } from './formatting';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphFormat: {
      setLineSpacing: (spacing: number) => ReturnType;
      unsetLineSpacing: () => ReturnType;
      indent: () => ReturnType;
      outdent: () => ReturnType;
      unsetIndent: () => ReturnType;
    };
  }
}

const BLOCK_TYPES = ['heading', 'paragraph'];

type BlockAttrs = Record<string, unknown>;

/**
 * Applies `update` to each paragraph and heading in the selection. Returns whether any would change,
 * so a command can report that it has nothing to do.
 */
function updateBlocks(
  tr: Transaction,
  dispatch: unknown,
  update: (attrs: BlockAttrs, inList: boolean) => BlockAttrs | undefined,
): boolean {
  const { from, to } = tr.selection;
  let changed = false;
  tr.doc.nodesBetween(from, to, (node, pos, parent) => {
    if (!BLOCK_TYPES.includes(node.type.name)) return true;
    const attrs = update(node.attrs, parent?.type.name === 'listItem');
    if (attrs) {
      changed = true;
      if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
    }
    return false;
  });
  return changed;
}

function currentIndent(attrs: BlockAttrs): number {
  return Number(attrs.indent ?? 0);
}

function parseIndent(element: HTMLElement): number {
  const match = /^([\d.]+)(in|pt|px)$/.exec(element.style.marginLeft);
  if (!match) return 0;
  const perInch = { in: 1, pt: 72, px: 96 }[match[2] as 'in' | 'pt' | 'px'];
  const levels = Math.round(Number(match[1]) / perInch / INDENT_STEP_INCHES);
  return Math.min(levels, MAX_INDENT);
}

function parseLineSpacing(element: HTMLElement): number | null {
  const value = Number(element.style.lineHeight);
  return element.style.lineHeight && value > 0 ? value : null;
}

/** Line spacing and indent. Both belong to whole paragraphs, unlike fonts and colors. */
export const ParagraphFormat = Extension.create({
  name: 'paragraphFormat',

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          lineSpacing: {
            default: null,
            parseHTML: parseLineSpacing,
            renderHTML: (attrs: BlockAttrs) =>
              attrs.lineSpacing ? { style: `line-height: ${String(attrs.lineSpacing)}` } : {},
          },
          indent: {
            default: 0,
            parseHTML: parseIndent,
            renderHTML: (attrs: BlockAttrs) => {
              const level = currentIndent(attrs);
              return level ? { style: `margin-left: ${level * INDENT_STEP_INCHES}in` } : {};
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineSpacing:
        (spacing) =>
        ({ tr, dispatch }) =>
          updateBlocks(tr, dispatch, (attrs) =>
            attrs.lineSpacing === spacing ? undefined : { lineSpacing: spacing },
          ),

      unsetLineSpacing:
        () =>
        ({ tr, dispatch }) =>
          updateBlocks(tr, dispatch, (attrs) =>
            attrs.lineSpacing === null ? undefined : { lineSpacing: null },
          ),

      // In a list, indenting means nesting the item one level deeper.
      indent:
        () =>
        ({ editor, commands, tr, dispatch }) => {
          if (editor.isActive('listItem')) return commands.sinkListItem('listItem');
          return updateBlocks(tr, dispatch, (attrs, inList) => {
            const level = currentIndent(attrs);
            return inList || level >= MAX_INDENT ? undefined : { indent: level + 1 };
          });
        },

      outdent:
        () =>
        ({ editor, commands, tr, dispatch }) => {
          if (editor.isActive('listItem')) return commands.liftListItem('listItem');
          return updateBlocks(tr, dispatch, (attrs, inList) => {
            const level = currentIndent(attrs);
            return inList || level <= 0 ? undefined : { indent: level - 1 };
          });
        },

      unsetIndent:
        () =>
        ({ tr, dispatch }) =>
          updateBlocks(tr, dispatch, (attrs) => (currentIndent(attrs) ? { indent: 0 } : undefined)),
    };
  },
});
