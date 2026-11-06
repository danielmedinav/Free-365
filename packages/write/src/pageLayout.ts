import { Extension, Node } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { DEFAULT_PAGE_SETUP, readPageSetup, type PageSetup } from './pageSetup';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageLayout: {
      updatePageSetup: (patch: Partial<PageSetup>) => ReturnType;
    };
    pageBreak: {
      setPageBreak: () => ReturnType;
    };
  }
}

/** Keeps the page setup in an attribute of the document, so changes are undoable and autosaved. */
export const PageLayout = Extension.create({
  name: 'pageLayout',

  addGlobalAttributes() {
    return [
      {
        types: ['doc'],
        attributes: {
          pageSetup: { default: DEFAULT_PAGE_SETUP, rendered: false },
        },
      },
    ];
  },

  addCommands() {
    return {
      updatePageSetup:
        (patch) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            const current = readPageSetup(tr.doc.attrs.pageSetup);
            tr.setDocAttribute('pageSetup', readPageSetup({ ...current, ...patch }));
          }
          return true;
        },
    };
  },
});

/** Ends the page here; whatever follows starts at the top of the next one. */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'hr.fs-page-break', priority: 60 }];
  },

  renderHTML() {
    return ['hr', { class: 'fs-page-break' }];
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ state, tr, dispatch }) => {
          const { pageBreak, paragraph } = state.schema.nodes;
          if (!pageBreak || !paragraph) return false;
          if (dispatch) {
            const start = tr.selection.from;
            tr.replaceSelectionWith(pageBreak.create());

            // It may land outside the paragraph the cursor was in, so look for where it went.
            let after = -1;
            tr.doc.nodesBetween(start, tr.doc.content.size, (node, pos) => {
              if (after < 0 && node.type === pageBreak && pos >= start - 1) after = pos + 1;
              return after < 0;
            });
            if (after < 0) return false;

            // Typing continues on the new page, which needs a paragraph to type in.
            const next = tr.doc.resolve(after).nodeAfter;
            if (!next || !next.isTextblock) tr.insert(after, paragraph.create());
            tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView();
          }
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => {
        if (this.editor.isActive('codeBlock')) return false;
        return this.editor.commands.setPageBreak();
      },
    };
  },
});
