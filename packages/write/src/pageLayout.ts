import { Extension, Node } from '@tiptap/core';
import { insertBlockAndContinue } from './insertBlock';
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
          const { pageBreak } = state.schema.nodes;
          if (!pageBreak) return false;
          if (dispatch) insertBlockAndContinue(state, tr, pageBreak);
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
