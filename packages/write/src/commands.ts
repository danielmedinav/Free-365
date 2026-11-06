import { createUndoCommands, type Command } from '@free360/commands';
import type { ChainedCommands, Editor } from '@tiptap/core';
import { findReplaceKey } from './findReplace';
import { createEditorUndoStack } from './undoStack';

export type WriteActions = {
  openFind: (mode: 'find' | 'replace') => void;
  closeFind: () => void;
  isFindOpen: () => boolean;
  save: () => void | Promise<unknown>;
  insertImage: () => void | Promise<unknown>;
  importDocx: () => void | Promise<unknown>;
  exportDocx: () => void | Promise<unknown>;
  print: () => void;
};

type ToggleSpec = {
  id: string;
  label: string;
  shortcut?: string;
  apply: (chain: ChainedCommands) => ChainedCommands;
  active: [name: string, attributes?: Record<string, unknown>];
};

const TOGGLES: ToggleSpec[] = [
  {
    id: 'write.bold',
    label: 'Bold',
    shortcut: 'Mod+B',
    apply: (c) => c.toggleBold(),
    active: ['bold'],
  },
  {
    id: 'write.italic',
    label: 'Italic',
    shortcut: 'Mod+I',
    apply: (c) => c.toggleItalic(),
    active: ['italic'],
  },
  {
    id: 'write.underline',
    label: 'Underline',
    shortcut: 'Mod+U',
    apply: (c) => c.toggleUnderline(),
    active: ['underline'],
  },
  {
    id: 'write.strike',
    label: 'Strikethrough',
    shortcut: 'Mod+Shift+S',
    apply: (c) => c.toggleStrike(),
    active: ['strike'],
  },
  {
    id: 'write.paragraph',
    label: 'Normal text',
    shortcut: 'Mod+Alt+0',
    apply: (c) => c.setParagraph(),
    active: ['paragraph'],
  },
  ...([1, 2, 3] as const).map((level): ToggleSpec => ({
    id: `write.heading${level}`,
    label: `Heading ${level}`,
    shortcut: `Mod+Alt+${level}`,
    apply: (c) => c.toggleHeading({ level }),
    active: ['heading', { level }],
  })),
  {
    id: 'write.bulletList',
    label: 'Bulleted list',
    shortcut: 'Mod+Shift+8',
    apply: (c) => c.toggleBulletList(),
    active: ['bulletList'],
  },
  {
    id: 'write.orderedList',
    label: 'Numbered list',
    shortcut: 'Mod+Shift+7',
    apply: (c) => c.toggleOrderedList(),
    active: ['orderedList'],
  },
];

const ALIGNMENTS = [
  { value: 'left', label: 'Align left', shortcut: 'Mod+Shift+L' },
  { value: 'center', label: 'Align center', shortcut: 'Mod+Shift+E' },
  { value: 'right', label: 'Align right', shortcut: 'Mod+Shift+R' },
  { value: 'justify', label: 'Justify', shortcut: 'Mod+Shift+J' },
] as const;

type TableAction = {
  id: string;
  label: string;
  apply: (chain: ChainedCommands) => ChainedCommands;
};

const TABLE_ACTIONS: TableAction[] = [
  { id: 'write.addRow', label: 'Add row', apply: (c) => c.addRowAfter() },
  { id: 'write.addColumn', label: 'Add column', apply: (c) => c.addColumnAfter() },
  { id: 'write.deleteRow', label: 'Delete row', apply: (c) => c.deleteRow() },
  { id: 'write.deleteColumn', label: 'Delete column', apply: (c) => c.deleteColumn() },
  { id: 'write.deleteTable', label: 'Delete table', apply: (c) => c.deleteTable() },
];

function hasMatches(editor: Editor): boolean {
  return !!findReplaceKey.getState(editor.state)?.matches.length;
}

/**
 * Every FreeWrite action. While the cursor is in the document, TipTap's keymap handles the same
 * formatting shortcuts first; the registry takes over when focus is elsewhere (e.g. the ribbon).
 */
export function createWriteCommands(editor: Editor, actions: WriteActions): Command[] {
  const stack = createEditorUndoStack(editor);
  const run = (apply: (chain: ChainedCommands) => ChainedCommands) => () =>
    void apply(editor.chain().focus()).run();
  const can = (apply: (chain: ChainedCommands) => ChainedCommands) => () =>
    apply(editor.can().chain()).run();

  return [
    // In the title box and find fields, Ctrl+Z must undo that field's text, not the document.
    ...createUndoCommands(() => stack).map((c) => ({ ...c, allowInInputs: false })),

    ...TOGGLES.map(({ id, label, shortcut, apply, active }): Command => ({
      id,
      label,
      shortcut,
      run: run(apply),
      isEnabled: can(apply),
      isActive: () => editor.isActive(active[0], active[1]),
    })),

    ...ALIGNMENTS.map(({ value, label, shortcut }): Command => ({
      id: `write.align-${value}`,
      label,
      shortcut,
      run: run((c) => c.setTextAlign(value)),
      isEnabled: can((c) => c.setTextAlign(value)),
      // Text with no explicit alignment is left-aligned.
      isActive: () =>
        value === 'left'
          ? !ALIGNMENTS.some((a) => a.value !== 'left' && editor.isActive({ textAlign: a.value }))
          : editor.isActive({ textAlign: value }),
    })),

    {
      id: 'write.insertTable',
      label: 'Table',
      description: 'Insert a 3 × 3 table',
      run: run((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true })),
      isEnabled: can((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true })),
    },
    ...TABLE_ACTIONS.map(({ id, label, apply }): Command => ({
      id,
      label,
      run: run(apply),
      isEnabled: can(apply),
    })),
    {
      id: 'write.insertImage',
      label: 'Image',
      description: 'Insert a picture from your computer',
      run: actions.insertImage,
    },
    {
      id: 'write.horizontalRule',
      label: 'Divider',
      description: 'Insert a horizontal line',
      run: run((c) => c.setHorizontalRule()),
      isEnabled: can((c) => c.setHorizontalRule()),
    },

    {
      id: 'write.find',
      label: 'Find',
      shortcut: 'Mod+F',
      allowInInputs: true,
      run: () => actions.openFind('find'),
    },
    {
      id: 'write.replace',
      label: 'Replace',
      shortcut: 'Mod+H',
      allowInInputs: true,
      run: () => actions.openFind('replace'),
    },
    {
      id: 'write.findNext',
      label: 'Next',
      description: 'Go to the next match',
      shortcut: 'F3',
      allowInInputs: true,
      run: () => void editor.commands.findNext(),
      isEnabled: () => hasMatches(editor),
    },
    {
      id: 'write.findPrevious',
      label: 'Previous',
      description: 'Go to the previous match',
      shortcut: 'Shift+F3',
      allowInInputs: true,
      run: () => void editor.commands.findPrevious(),
      isEnabled: () => hasMatches(editor),
    },
    {
      id: 'write.replaceCurrent',
      label: 'Replace',
      description: 'Replace this match',
      run: () => void editor.commands.replaceCurrent(),
      isEnabled: () => hasMatches(editor),
    },
    {
      id: 'write.replaceAll',
      label: 'Replace all',
      run: () => void editor.commands.replaceAll(),
      isEnabled: () => hasMatches(editor),
    },
    {
      id: 'write.closeFind',
      label: 'Close',
      shortcut: 'Escape',
      allowInInputs: true,
      run: actions.closeFind,
      isEnabled: actions.isFindOpen,
    },

    {
      id: 'write.save',
      label: 'Save',
      description: 'Your work saves automatically; this saves right now',
      shortcut: 'Mod+S',
      allowInInputs: true,
      run: actions.save,
    },
    {
      id: 'write.importDocx',
      label: 'Import .docx',
      description: 'Replace this document with the contents of a .docx file',
      run: actions.importDocx,
    },
    {
      id: 'write.exportDocx',
      label: 'Export .docx',
      description: 'Save a copy as a .docx file',
      run: actions.exportDocx,
    },
    {
      id: 'write.print',
      label: 'Print / PDF',
      description: 'Print, or choose "Save as PDF" in the print dialog',
      shortcut: 'Mod+P',
      allowInInputs: true,
      run: actions.print,
    },
  ];
}
