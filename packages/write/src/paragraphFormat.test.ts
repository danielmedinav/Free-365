import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { writeExtensions } from './extensions';
import { MAX_INDENT } from './formatting';

let editor: Editor | undefined;

function create(content: string) {
  editor = new Editor({ extensions: writeExtensions, content });
  return editor;
}

afterEach(() => editor?.destroy());

const firstAttrs = (e: Editor) => e.state.doc.firstChild!.attrs;

describe('line spacing', () => {
  it('applies to paragraphs and headings in the selection', () => {
    const e = create('<h1>a</h1><p>b</p>');
    e.commands.selectAll();
    expect(e.commands.setLineSpacing(2)).toBe(true);
    expect(e.getHTML()).toBe('<h1 style="line-height: 2;">a</h1><p style="line-height: 2;">b</p>');
  });

  it('can be removed, and survives a trip through HTML', () => {
    const e = create('<p style="line-height: 1.5">a</p>');
    expect(firstAttrs(e).lineSpacing).toBe(1.5);
    e.commands.selectAll();
    e.commands.unsetLineSpacing();
    expect(firstAttrs(e).lineSpacing).toBeNull();
  });

  it('reports when there is nothing to change', () => {
    const e = create('<p>a</p>');
    expect(e.commands.unsetLineSpacing()).toBe(false);
  });
});

describe('indent', () => {
  it('steps in and out, and stops at the edges', () => {
    const e = create('<p>a</p>');
    expect(e.commands.outdent()).toBe(false);

    e.commands.indent();
    e.commands.indent();
    expect(firstAttrs(e).indent).toBe(2);
    expect(e.getHTML()).toBe('<p style="margin-left: 1in;">a</p>');

    e.commands.outdent();
    expect(firstAttrs(e).indent).toBe(1);

    for (let i = 0; i < MAX_INDENT + 2; i++) e.commands.indent();
    expect(firstAttrs(e).indent).toBe(MAX_INDENT);
    expect(e.commands.indent()).toBe(false);
  });

  it('reads the units other programs use', () => {
    expect(firstAttrs(create('<p style="margin-left: 0.5in">a</p>')).indent).toBe(1);
    expect(firstAttrs(create('<p style="margin-left: 72pt">a</p>')).indent).toBe(2);
    expect(firstAttrs(create('<p style="margin-left: 48px">a</p>')).indent).toBe(1);
  });

  it('nests list items instead of adding a margin', () => {
    const e = create('<ul><li><p>one</p></li><li><p>two</p></li></ul>');
    e.commands.setTextSelection(8);
    e.commands.indent();
    expect(e.getHTML()).toContain('<ul><li><p>two</p></li></ul>');
    expect(e.getHTML()).not.toContain('margin-left');

    e.commands.outdent();
    expect(e.getHTML()).not.toContain('<ul><li><p>two</p></li></ul>');
  });
});
