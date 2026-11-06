import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { writeExtensions } from './extensions';
import { findMatches, findReplaceKey } from './findReplace';

let editor: Editor | undefined;

function create(content: string) {
  editor = new Editor({ extensions: writeExtensions, content });
  return editor;
}

const find = (e: Editor) => findReplaceKey.getState(e.state)!;
const selected = (e: Editor) => {
  const { from, to } = e.state.selection;
  return e.state.doc.textBetween(from, to);
};

afterEach(() => editor?.destroy());

describe('findMatches', () => {
  it('finds case-insensitively by default, and exactly on request', () => {
    const { state } = create('<p>Cat cat CAT</p>');
    expect(findMatches(state.doc, 'cat')).toHaveLength(3);
    expect(findMatches(state.doc, 'cat', true)).toEqual([{ from: 5, to: 8 }]);
  });

  it('treats the query as plain text, not a pattern', () => {
    const { state } = create('<p>a.c abc (x)</p>');
    expect(findMatches(state.doc, 'a.c')).toHaveLength(1);
    expect(findMatches(state.doc, '(x)')).toHaveLength(1);
  });

  it('matches across formatting, but not across paragraphs', () => {
    const { state } = create('<p>he<strong>llo</strong></p><p>wor</p><p>ld</p>');
    expect(findMatches(state.doc, 'hello')).toHaveLength(1);
    expect(findMatches(state.doc, 'world')).toHaveLength(0);
  });

  it('keeps positions right after a line break and inside tables', () => {
    const { state } = create(
      '<p>one<br>two</p><table><tbody><tr><td><p>two</p></td></tr></tbody></table>',
    );
    const matches = findMatches(state.doc, 'two');
    expect(matches).toHaveLength(2);
    for (const { from, to } of matches) expect(state.doc.textBetween(from, to)).toBe('two');
  });

  it('returns nothing for an empty query', () => {
    expect(findMatches(create('<p>abc</p>').state.doc, '')).toEqual([]);
  });
});

describe('FindReplace commands', () => {
  it('selects the first match while searching and cycles with next/previous', () => {
    const e = create('<p>a1 a2 a3</p>');
    e.commands.setFind({ query: 'a' });
    expect(find(e).matches).toHaveLength(3);
    expect(find(e).current).toBe(0);
    expect(selected(e)).toBe('a');

    e.commands.findNext();
    e.commands.findNext();
    expect(find(e).current).toBe(2);
    e.commands.findNext();
    expect(find(e).current).toBe(0);
    e.commands.findPrevious();
    expect(find(e).current).toBe(2);
  });

  it('replaces the current match and moves to the next one', () => {
    const e = create('<p>a b a</p>');
    e.commands.setFind({ query: 'a', replacement: 'zz' });
    e.commands.replaceCurrent();
    expect(e.getText()).toBe('zz b a');
    expect(find(e).matches).toHaveLength(1);
    expect(find(e).current).toBe(0);

    e.commands.replaceCurrent();
    expect(e.getText()).toBe('zz b zz');
    expect(find(e).current).toBe(-1);
  });

  it('replaces everything in one undo step, even when the replacement contains the query', () => {
    const e = create('<p>a a</p><p>a</p>');
    e.commands.setFind({ query: 'a', replacement: 'aa' });
    e.commands.replaceAll();
    expect(e.getText({ blockSeparator: '|' })).toBe('aa aa|aa');
    e.commands.undo();
    expect(e.getText({ blockSeparator: '|' })).toBe('a a|a');
  });

  it('deletes matches when the replacement is empty, and keeps formatting otherwise', () => {
    const e = create('<p><strong>keep</strong> drop</p>');
    e.commands.setFind({ query: ' drop', replacement: '' });
    e.commands.replaceAll();
    expect(e.getText()).toBe('keep');

    e.commands.setFind({ query: 'keep', replacement: 'kept' });
    e.commands.replaceAll();
    expect(e.getHTML()).toContain('<strong>kept</strong>');
  });

  it('keeps matches up to date as the document changes, and clears with the query', () => {
    const e = create('<p>a</p>');
    e.commands.setFind({ query: 'a' });
    e.commands.insertContentAt(1, 'a ');
    expect(find(e).matches).toHaveLength(2);

    e.commands.setFind({ query: '' });
    expect(find(e).matches).toHaveLength(0);
    expect(find(e).decorations.find()).toHaveLength(0);
  });

  it('reports failure when there is nothing to act on', () => {
    const e = create('<p>a</p>');
    expect(e.commands.findNext()).toBe(false);
    expect(e.commands.replaceAll()).toBe(false);
  });
});
