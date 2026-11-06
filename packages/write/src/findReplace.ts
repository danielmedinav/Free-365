import { Extension, type CommandProps } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export type FindMatch = { from: number; to: number };

export type FindState = {
  query: string;
  replacement: string;
  caseSensitive: boolean;
  matches: FindMatch[];
  /** Index into `matches`; -1 when there are none. */
  current: number;
  decorations: DecorationSet;
};

type FindPatch = Partial<Pick<FindState, 'query' | 'replacement' | 'caseSensitive'>>;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    findReplace: {
      setFind: (patch: FindPatch) => ReturnType;
      findNext: () => ReturnType;
      findPrevious: () => ReturnType;
      replaceCurrent: () => ReturnType;
      replaceAll: () => ReturnType;
    };
  }
}

export const findReplaceKey = new PluginKey<FindState>('fsFindReplace');

/** Finds every occurrence within each text block; a match can span formatting changes. */
export function findMatches(doc: PmNode, query: string, caseSensitive = false): FindMatch[] {
  if (!query) return [];
  const pattern = new RegExp(
    query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    caseSensitive ? 'gu' : 'giu',
  );
  const matches: FindMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // One character per document position, so string offsets map straight back.
    let text = '';
    node.forEach((child) => {
      text += child.isText ? child.text : '￼'.repeat(child.nodeSize);
    });
    for (const match of text.matchAll(pattern)) {
      const from = pos + 1 + match.index;
      matches.push({ from, to: from + match[0].length });
    }
    return false;
  });
  return matches;
}

function firstMatchFrom(matches: FindMatch[], pos: number): number {
  if (!matches.length) return -1;
  const index = matches.findIndex((m) => m.from >= pos);
  return index === -1 ? 0 : index; // wrap around to the start
}

function decorate(doc: PmNode, matches: FindMatch[], current: number): DecorationSet {
  return DecorationSet.create(
    doc,
    matches.map((m, i) =>
      Decoration.inline(m.from, m.to, {
        class: i === current ? 'fs-find-match fs-find-current' : 'fs-find-match',
      }),
    ),
  );
}

function selectMatch(tr: Transaction, match: FindMatch | undefined) {
  if (match) {
    tr.setSelection(TextSelection.create(tr.doc, match.from, match.to)).scrollIntoView();
  }
}

function replaceRange(tr: Transaction, { from, to }: FindMatch, replacement: string) {
  // Its own undo step, even right after typing.
  closeHistory(tr);
  if (replacement) tr.insertText(replacement, from, to);
  else tr.delete(from, to);
}

function stepCommand(direction: 1 | -1) {
  return () =>
    ({ state, tr, dispatch }: CommandProps) => {
      const find = findReplaceKey.getState(state);
      if (!find?.matches.length) return false;
      if (dispatch) {
        const { length } = find.matches;
        const current = (find.current + direction + length) % length;
        selectMatch(tr, find.matches[current]);
        tr.setMeta(findReplaceKey, { current });
      }
      return true;
    };
}

export const FindReplace = Extension.create({
  name: 'findReplace',

  addCommands() {
    return {
      setFind:
        (patch) =>
        ({ state, tr, dispatch }) => {
          const find = findReplaceKey.getState(state);
          if (!find) return false;
          if (dispatch) {
            const next = { ...find, ...patch };
            const searchChanged =
              next.query !== find.query || next.caseSensitive !== find.caseSensitive;
            if (searchChanged) {
              const matches = findMatches(tr.doc, next.query, next.caseSensitive);
              const current = firstMatchFrom(matches, tr.selection.from);
              selectMatch(tr, matches[current]);
              tr.setMeta(findReplaceKey, { ...patch, matches, current });
            } else {
              tr.setMeta(findReplaceKey, patch);
            }
          }
          return true;
        },

      findNext: stepCommand(1),
      findPrevious: stepCommand(-1),

      replaceCurrent:
        () =>
        ({ state, tr, dispatch }) => {
          const find = findReplaceKey.getState(state);
          const match = find?.matches[find.current];
          if (!find || !match) return false;
          if (dispatch) replaceRange(tr, match, find.replacement);
          return true;
        },

      replaceAll:
        () =>
        ({ state, tr, dispatch }) => {
          const find = findReplaceKey.getState(state);
          if (!find?.matches.length) return false;
          if (dispatch) {
            // Back to front, so earlier positions stay valid.
            for (const match of [...find.matches].reverse()) {
              replaceRange(tr, match, find.replacement);
            }
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findReplaceKey,
        state: {
          init: () => ({
            query: '',
            replacement: '',
            caseSensitive: false,
            matches: [],
            current: -1,
            decorations: DecorationSet.empty,
          }),
          apply(tr, prev) {
            const meta = tr.getMeta(findReplaceKey) as Partial<FindState> | undefined;
            if (!meta && !tr.docChanged) return prev;
            const next = { ...prev, ...meta };
            if (tr.docChanged) {
              next.matches = findMatches(tr.doc, next.query, next.caseSensitive);
              next.current = firstMatchFrom(next.matches, tr.selection.from);
            }
            next.decorations = decorate(tr.doc, next.matches, next.current);
            return next;
          },
        },
        props: {
          decorations: (state) => findReplaceKey.getState(state)?.decorations,
        },
      }),
    ];
  },
});
