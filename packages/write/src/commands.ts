import { createUndoCommands, type Command } from '@free360/commands';
import type { ChainedCommands, Editor } from '@tiptap/core';
import { findReplaceKey } from './findReplace';
import {
  FONT_FAMILIES,
  FONT_SIZES,
  HIGHLIGHT_COLORS,
  LINE_SPACINGS,
  primaryFont,
  slug,
  TEXT_COLORS,
  toHexColor,
} from './formatting';
import { IMAGE_LAYOUTS, MIN_IMAGE_WIDTH } from './imageExtension';
import {
  isLandscape,
  MARGIN_PRESETS,
  matchesMargins,
  matchesPageSize,
  PAGE_SIZES,
  readPageSetup,
  withOrientation,
  withPageSize,
} from './pageSetup';
import { columnSectionsInSelection } from './references';
import { createEditorUndoStack } from './undoStack';

export type WriteActions = {
  openFind: (mode: 'find' | 'replace') => void;
  closeFind: () => void;
  isFindOpen: () => boolean;
  save: () => void | Promise<unknown>;
  insertImage: () => void | Promise<unknown>;
  editLink: () => void;
  openPageSetup: () => void;
  editFootnote: () => void;
  openSymbols: () => void;
  toggleSpellCheck: () => void;
  isSpellCheckOn: () => boolean;
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
    id: 'write.superscript',
    label: 'Superscript',
    shortcut: 'Mod+.',
    apply: (c) => c.toggleSuperscript(),
    active: ['superscript'],
  },
  {
    id: 'write.subscript',
    label: 'Subscript',
    shortcut: 'Mod+,',
    apply: (c) => c.toggleSubscript(),
    active: ['subscript'],
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
  { id: 'write.mergeCells', label: 'Merge cells', apply: (c) => c.mergeCells() },
  { id: 'write.splitCell', label: 'Split cell', apply: (c) => c.splitCell() },
  { id: 'write.headerRow', label: 'Header row', apply: (c) => c.toggleHeaderRow() },
];

/** Removed by Clear formatting. Links stay: they're content as much as appearance. */
const CLEARED_MARKS = [
  'bold',
  'code',
  'italic',
  'strike',
  'subscript',
  'superscript',
  'textStyle',
  'underline',
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

    ...createTextStyleCommands(editor, run, can),

    {
      id: 'write.indent',
      label: 'Increase indent',
      shortcut: 'Mod+]',
      allowInInputs: true,
      run: run((c) => c.indent()),
      isEnabled: can((c) => c.indent()),
    },
    {
      id: 'write.outdent',
      label: 'Decrease indent',
      shortcut: 'Mod+[',
      allowInInputs: true,
      run: run((c) => c.outdent()),
      isEnabled: can((c) => c.outdent()),
    },
    {
      id: 'write.lineSpacing-default',
      label: 'Default',
      run: run((c) => c.unsetLineSpacing()),
      isActive: () => !editor.getAttributes(currentBlockType(editor)).lineSpacing,
    },
    ...LINE_SPACINGS.map((spacing): Command => ({
      id: `write.lineSpacing-${slug(spacing)}`,
      label: String(spacing),
      run: run((c) => c.setLineSpacing(spacing)),
      isActive: () => editor.getAttributes(currentBlockType(editor)).lineSpacing === spacing,
    })),
    {
      id: 'write.clearFormatting',
      label: 'Clear formatting',
      description: 'Back to plain text: removes fonts, colors, headings, lists, and spacing',
      shortcut: 'Mod+\\',
      allowInInputs: true,
      run: run((c) =>
        CLEARED_MARKS.reduce((chain, mark) => chain.unsetMark(mark), c)
          .clearNodes()
          .unsetTextAlign()
          .unsetLineSpacing()
          .unsetIndent(),
      ),
    },

    {
      id: 'write.link',
      label: 'Link',
      description: 'Add or edit a link. Ctrl+click a link to open it.',
      shortcut: 'Mod+K',
      allowInInputs: true,
      run: actions.editLink,
      isActive: () => editor.isActive('link'),
    },
    {
      id: 'write.unlink',
      label: 'Remove link',
      run: run((c) => c.extendMarkRange('link').unsetLink()),
      isEnabled: () => editor.isActive('link'),
    },

    ...createPageCommands(editor, run, can, actions),
    ...[1, 2, 3].map((count): Command => ({
      id: `write.columns-${count}`,
      label: count === 1 ? 'One column' : `${count} columns`,
      description: 'Applies to the selected paragraphs',
      run: run((c) => c.setColumns(count)),
      isActive: () =>
        Number(columnSectionsInSelection(editor.state)[0]?.node.attrs.count ?? 1) === count,
    })),
    {
      id: 'write.tableOfContents',
      label: 'Contents',
      description: 'Insert a table of contents built from your headings',
      run: run((c) => c.insertTableOfContents()),
      isEnabled: can((c) => c.insertTableOfContents()),
    },
    {
      id: 'write.footnote',
      label: 'Footnote',
      description: 'Add a note at the bottom of the page. Click a note number to edit it.',
      shortcut: 'Mod+Alt+F',
      allowInInputs: true,
      run: actions.editFootnote,
    },
    {
      id: 'write.symbol',
      label: 'Symbol',
      description: 'Insert a character that is not on your keyboard',
      run: actions.openSymbols,
    },
    {
      id: 'write.spellCheck',
      label: 'Spell check',
      description: 'Underline misspelled words, using the spell checker built into your browser',
      run: actions.toggleSpellCheck,
      isActive: actions.isSpellCheckOn,
    },
    ...createImageCommands(editor, run),
    ...createCellColorCommands(editor, run, can),

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

function currentBlockType(editor: Editor): string {
  return editor.isActive('heading') ? 'heading' : 'paragraph';
}

type ChainStep = (apply: (chain: ChainedCommands) => ChainedCommands) => () => void;
type ChainCheck = (apply: (chain: ChainedCommands) => ChainedCommands) => () => boolean;

/** One command per font, size, and color, so menus can list them like any other action. */
function createTextStyleCommands(editor: Editor, run: ChainStep, can: ChainCheck): Command[] {
  const style = (name: string): unknown => editor.getAttributes('textStyle')[name];
  const canStyle = can((c) => c.setColor('#000000'));

  return [
    {
      id: 'write.font-default',
      label: 'Default',
      run: run((c) => c.unsetFontFamily()),
      isEnabled: canStyle,
      isActive: () => !style('fontFamily'),
    },
    ...FONT_FAMILIES.map((font): Command => ({
      id: `write.font-${slug(font)}`,
      label: font,
      run: run((c) => c.setFontFamily(font)),
      isEnabled: canStyle,
      isActive: () => primaryFont(style('fontFamily')) === font,
    })),
    {
      id: 'write.size-default',
      label: 'Default',
      run: run((c) => c.unsetFontSize()),
      isEnabled: canStyle,
      isActive: () => !style('fontSize'),
    },
    ...FONT_SIZES.map((size): Command => ({
      id: `write.size-${size}`,
      label: String(size),
      run: run((c) => c.setFontSize(`${size}pt`)),
      isEnabled: canStyle,
      isActive: () => style('fontSize') === `${size}pt`,
    })),
    {
      id: 'write.textColor-default',
      label: 'Automatic color',
      run: run((c) => c.unsetColor()),
      isEnabled: canStyle,
    },
    ...TEXT_COLORS.map(({ name, hex }): Command => ({
      id: `write.textColor-${slug(name)}`,
      label: `${name} text`,
      run: run((c) => c.setColor(hex)),
      isEnabled: canStyle,
      isActive: () => toHexColor(style('color')) === hex,
    })),
    {
      id: 'write.highlight-default',
      label: 'No highlight',
      run: run((c) => c.unsetBackgroundColor()),
      isEnabled: canStyle,
    },
    ...HIGHLIGHT_COLORS.map(({ name, hex }): Command => ({
      id: `write.highlight-${slug(name)}`,
      label: `${name} highlight`,
      run: run((c) => c.setBackgroundColor(hex)),
      isEnabled: canStyle,
      isActive: () => toHexColor(style('backgroundColor')) === hex,
    })),
  ];
}

function createPageCommands(
  editor: Editor,
  run: ChainStep,
  can: ChainCheck,
  actions: WriteActions,
): Command[] {
  const setup = () => readPageSetup(editor.state.doc.attrs.pageSetup);

  return [
    ...PAGE_SIZES.map((size): Command => ({
      id: `write.pageSize-${size.id}`,
      label: size.label,
      run: run((c) => c.updatePageSetup(withPageSize(setup(), size))),
      isActive: () => matchesPageSize(setup(), size),
    })),
    ...[false, true].map((landscape): Command => ({
      id: `write.orientation-${landscape ? 'landscape' : 'portrait'}`,
      label: landscape ? 'Landscape' : 'Portrait',
      run: run((c) => c.updatePageSetup(withOrientation(setup(), landscape))),
      isActive: () => isLandscape(setup()) === landscape,
    })),
    ...MARGIN_PRESETS.map((margins): Command => ({
      id: `write.margins-${margins.id}`,
      label: margins.label,
      run: run((c) =>
        c.updatePageSetup({
          marginTopIn: margins.top,
          marginBottomIn: margins.bottom,
          marginLeftIn: margins.left,
          marginRightIn: margins.right,
        }),
      ),
      isActive: () => matchesMargins(setup(), margins),
    })),
    ...(['none', 'footer', 'header'] as const).map((placement): Command => ({
      id: `write.pageNumbers-${placement}`,
      label: { none: 'None', footer: 'In footer', header: 'In header' }[placement],
      run: run((c) => c.updatePageSetup({ pageNumbers: placement })),
      isActive: () => setup().pageNumbers === placement,
    })),
    {
      id: 'write.pageBreak',
      label: 'Page break',
      description: 'Start the next page here',
      shortcut: 'Mod+Enter',
      run: run((c) => c.setPageBreak()),
      isEnabled: can((c) => c.setPageBreak()),
    },
    {
      id: 'write.pageSetup',
      label: 'Margins, header, and footer',
      description: 'Set exact margins and the text at the top and bottom of every page',
      run: actions.openPageSetup,
    },
  ];
}

/** Displayed width of the selected image, including any limit from the page margins. */
function selectedImageWidth(editor: Editor): number | undefined {
  const dom = editor.view.nodeDOM(editor.state.selection.from);
  const image = dom instanceof HTMLElement ? dom.querySelector('img') : null;
  return image?.getBoundingClientRect().width;
}

function createImageCommands(editor: Editor, run: ChainStep): Command[] {
  const isImage = () => editor.isActive('image');
  const scale = (factor: number) => () => {
    const width = selectedImageWidth(editor);
    if (width === undefined) return;
    const next = Math.max(MIN_IMAGE_WIDTH, Math.round(width * factor));
    editor.chain().focus().updateAttributes('image', { width: next }).run();
  };

  return [
    ...IMAGE_LAYOUTS.map(({ value, label }): Command => ({
      id: `write.imageLayout-${value}`,
      label,
      run: run((c) => c.updateAttributes('image', { layout: value })),
      isEnabled: isImage,
      isActive: () => editor.isActive('image', { layout: value }),
    })),
    {
      id: 'write.imageSmaller',
      label: 'Smaller',
      description: 'Make the selected image 10% smaller, or drag its corner',
      run: scale(0.9),
      isEnabled: isImage,
    },
    {
      id: 'write.imageLarger',
      label: 'Larger',
      description: 'Make the selected image 10% larger, or drag its corner',
      run: scale(1.1),
      isEnabled: isImage,
    },
    {
      id: 'write.imageOriginalSize',
      label: 'Original size',
      run: run((c) => c.updateAttributes('image', { width: null })),
      isEnabled: isImage,
    },
  ];
}

function createCellColorCommands(editor: Editor, run: ChainStep, can: ChainCheck): Command[] {
  const clear = (c: ChainedCommands) => c.setCellColor(null);
  return [
    {
      id: 'write.cellColor-default',
      label: 'No color',
      run: run(clear),
      isEnabled: can(clear),
    },
    ...HIGHLIGHT_COLORS.map(({ name, hex }): Command => {
      const apply = (c: ChainedCommands) => c.setCellColor(hex);
      return {
        id: `write.cellColor-${slug(name)}`,
        label: `${name} cell`,
        run: run(apply),
        isEnabled: can(apply),
      };
    }),
  ];
}
