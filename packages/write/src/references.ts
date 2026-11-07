import { Node, type Editor } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';
import type { EditorView, NodeView } from '@tiptap/pm/view';
import { insertBlockAndContinue } from './insertBlock';
import { pageOfPosition, paginationKey } from './paginationPlugin';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    references: {
      insertTableOfContents: () => ReturnType;
      setColumns: (count: number) => ReturnType;
    };
  }
}

/** A footnote's mark in the text. The note is plain text, and numbers come from document order. */
export const Footnote = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      text: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-footnote') ?? '',
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-footnote': attributes.text,
        }),
      },
    };
  },

  parseHTML() {
    // Ahead of superscript, which also reads `sup`.
    return [{ tag: 'sup[data-footnote]', priority: 60 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['sup', { ...HTMLAttributes, class: 'fs-footnote' }];
  },

  addKeyboardShortcuts() {
    // Browsers ignore these keys when the cursor sits right after a mark at the end of a line.
    return {
      'Mod-Home': () => this.editor.commands.focus('start', { scrollIntoView: true }),
      'Mod-End': () => this.editor.commands.focus('end', { scrollIntoView: true }),
    };
  },
});

export type DocumentFootnote = { pos: number; number: number; text: string };

export function collectFootnotes(doc: PmNode): DocumentFootnote[] {
  const notes: DocumentFootnote[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'footnote') {
      notes.push({ pos, number: notes.length + 1, text: String(node.attrs.text ?? '') });
    }
  });
  return notes;
}

/** A part of the document whose text runs in several columns. */
export const ColumnSection = Node.create({
  name: 'columnSection',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      count: {
        default: 2,
        parseHTML: (element) => Number(element.getAttribute('data-count')) || 2,
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-count': attributes.count,
          style: `column-count: ${String(attributes.count)}`,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="column-section"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { ...HTMLAttributes, 'data-type': 'column-section', class: 'fs-columns' }, 0];
  },

  addCommands() {
    return {
      setColumns:
        (count) =>
        ({ state, tr, dispatch, commands }) => {
          const sections = columnSectionsInSelection(state);
          if (!sections.length) return count > 1 && commands.wrapIn(this.name, { count });
          if (dispatch) {
            // Back to front, so removing one doesn't move the others.
            for (const { node, pos } of [...sections].reverse()) {
              if (count > 1) tr.setNodeAttribute(pos, 'count', count);
              else tr.replaceWith(pos, pos + node.nodeSize, node.content);
            }
          }
          return true;
        },
    };
  },
});

export function columnSectionsInSelection(state: EditorState) {
  const sections: { node: PmNode; pos: number }[] = [];
  const { from, to } = state.selection;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'columnSection') return true;
    sections.push({ node, pos });
    return false;
  });
  return sections;
}

export type DocumentHeading = { pos: number; level: number; text: string };

export function collectHeadings(doc: PmNode): DocumentHeading[] {
  const headings: DocumentHeading[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading' && node.textContent.trim()) {
      headings.push({ pos, level: Number(node.attrs.level ?? 1), text: node.textContent });
    }
    return !node.isTextblock;
  });
  return headings;
}

/** Page number of each heading, in document order. */
export function headingPages(state: EditorState): number[] {
  const gaps = paginationKey.getState(state)?.gaps ?? [];
  return collectHeadings(state.doc).map(({ pos }) => pageOfPosition(gaps, pos + 1));
}

/** Lists the headings with their page numbers, staying up to date as the document changes. */
class TableOfContentsView implements NodeView {
  dom: HTMLElement;
  private rendered = '';

  constructor(
    private readonly editor: Editor,
    // The editor's own state isn't set yet while the document is first being drawn.
    private readonly view: EditorView,
  ) {
    this.dom = document.createElement('div');
    this.dom.className = 'fs-toc';
    this.dom.contentEditable = 'false';
    this.render();
    editor.on('transaction', this.render);
  }

  private readonly render = () => {
    const pages = headingPages(this.view.state);
    const headings = collectHeadings(this.view.state.doc);
    const entries = headings.map((heading, index) => ({ ...heading, page: pages[index] ?? 1 }));
    // Skips the redraw unless something shows differently, as this runs on every keystroke.
    const signature = JSON.stringify(entries);
    if (signature === this.rendered) return;
    this.rendered = signature;

    const title = document.createElement('div');
    title.className = 'fs-toc-title';
    title.textContent = 'Contents';
    this.dom.replaceChildren(title);

    if (!entries.length) {
      const hint = document.createElement('div');
      hint.className = 'fs-toc-empty';
      hint.textContent = 'Headings you add will be listed here.';
      this.dom.append(hint);
    }

    for (const { pos, level, text, page } of entries) {
      const entry = document.createElement('button');
      entry.type = 'button';
      entry.className = 'fs-toc-entry';
      entry.style.paddingLeft = `${(level - 1) * 16}px`;
      const label = document.createElement('span');
      label.textContent = text;
      const number = document.createElement('span');
      number.textContent = String(page);
      entry.append(label, number);
      entry.addEventListener('click', () => {
        this.editor
          .chain()
          .focus()
          .setTextSelection(pos + 1)
          .scrollIntoView()
          .run();
      });
      this.dom.append(entry);
    }
  };

  stopEvent(event: Event): boolean {
    return event.target instanceof Element && !!event.target.closest('button');
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy() {
    this.editor.off('transaction', this.render);
  }
}

export const TableOfContents = Node.create({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="table-of-contents"]' }];
  },

  renderHTML() {
    return ['div', { 'data-type': 'table-of-contents' }];
  },

  addCommands() {
    return {
      insertTableOfContents:
        () =>
        ({ state, tr, dispatch }) => {
          const type = state.schema.nodes[this.name];
          if (!type) return false;
          if (dispatch) insertBlockAndContinue(state, tr, type);
          return true;
        },
    };
  },

  addNodeView() {
    return ({ editor, view }) => new TableOfContentsView(editor, view);
  },
});
