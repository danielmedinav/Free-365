import { ColorMenu, CommandSelect, type RibbonGroup, type RibbonTab } from '@free360/ui';
import type { Editor } from '@tiptap/core';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  BookOpenText,
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  Bold,
  FileDown,
  FileUp,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  FileSliders,
  Footprints,
  ImagePlus,
  Maximize2,
  Minimize2,
  PaintBucket,
  RotateCcw,
  Rows2,
  TableCellsMerge,
  TableCellsSplit,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link,
  Link2Off,
  List,
  ListOrdered,
  Minus,
  Omega,
  Pilcrow,
  SeparatorHorizontal,
  Printer,
  Redo2,
  RemoveFormatting,
  Replace,
  Search,
  SpellCheck,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  Trash2,
  Underline,
  Undo2,
} from 'lucide-react';
import {
  FONT_FAMILIES,
  FONT_SIZES,
  HIGHLIGHT_COLORS,
  LINE_SPACINGS,
  primaryFont,
  slug,
  TEXT_COLORS,
  toPoints,
} from './formatting';
import { IMAGE_LAYOUTS } from './imageExtension';
import { MARGIN_PRESETS, PAGE_SIZES } from './pageSetup';

const TRANSFER_GROUP: RibbonGroup = {
  id: 'transfer',
  label: 'Import and export',
  items: [
    { type: 'command', command: 'write.importDocx', icon: FileUp, size: 'large' },
    { type: 'command', command: 'write.exportDocx', icon: FileDown, size: 'large' },
    { type: 'command', command: 'write.print', icon: Printer, size: 'large' },
  ],
};

function buildHomeTab(editor: Editor): RibbonTab {
  const style = (name: string): unknown => editor.getAttributes('textStyle')[name];

  return {
    id: 'home',
    label: 'Home',
    groups: [
      {
        id: 'history',
        label: 'History',
        items: [
          { type: 'command', command: 'edit.undo', icon: Undo2, size: 'icon' },
          { type: 'command', command: 'edit.redo', icon: Redo2, size: 'icon' },
        ],
      },
      {
        id: 'font',
        label: 'Font',
        width: 336,
        items: [
          {
            type: 'custom',
            id: 'font-family',
            render: () => (
              <CommandSelect
                label="Font"
                width={220}
                currentLabel={() => primaryFont(style('fontFamily'))}
                options={[
                  { command: 'write.font-default', label: 'Default font' },
                  ...FONT_FAMILIES.map((font) => ({
                    command: `write.font-${slug(font)}`,
                    label: font,
                  })),
                ]}
              />
            ),
          },
          {
            type: 'custom',
            id: 'font-size',
            render: () => (
              <CommandSelect
                label="Font size"
                width={84}
                currentLabel={() => {
                  const points = toPoints(style('fontSize'));
                  return points === undefined ? undefined : String(points);
                }}
                options={[
                  { command: 'write.size-default', label: 'Default' },
                  ...FONT_SIZES.map((size) => ({
                    command: `write.size-${size}`,
                    label: String(size),
                  })),
                ]}
              />
            ),
          },
          { type: 'command', command: 'write.bold', icon: Bold, size: 'icon' },
          { type: 'command', command: 'write.italic', icon: Italic, size: 'icon' },
          { type: 'command', command: 'write.underline', icon: Underline, size: 'icon' },
          { type: 'command', command: 'write.strike', icon: Strikethrough, size: 'icon' },
          { type: 'command', command: 'write.superscript', icon: Superscript, size: 'icon' },
          { type: 'command', command: 'write.subscript', icon: Subscript, size: 'icon' },
          {
            type: 'custom',
            id: 'text-color',
            render: () => (
              <ColorMenu
                label="Text color"
                icon={Baseline}
                clearCommand="write.textColor-default"
                current={() => style('color') as string | undefined}
                swatches={TEXT_COLORS.map(({ name, hex }) => ({
                  command: `write.textColor-${slug(name)}`,
                  color: hex,
                }))}
              />
            ),
          },
          {
            type: 'custom',
            id: 'highlight-color',
            render: () => (
              <ColorMenu
                label="Highlight color"
                icon={Highlighter}
                clearCommand="write.highlight-default"
                current={() => style('backgroundColor') as string | undefined}
                swatches={HIGHLIGHT_COLORS.map(({ name, hex }) => ({
                  command: `write.highlight-${slug(name)}`,
                  color: hex,
                }))}
              />
            ),
          },
          {
            type: 'command',
            command: 'write.clearFormatting',
            icon: RemoveFormatting,
            size: 'icon',
          },
        ],
      },
      {
        id: 'paragraph',
        label: 'Paragraph',
        width: 232,
        items: [
          { type: 'command', command: 'write.bulletList', icon: List, size: 'icon' },
          { type: 'command', command: 'write.orderedList', icon: ListOrdered, size: 'icon' },
          { type: 'command', command: 'write.outdent', icon: IndentDecrease, size: 'icon' },
          { type: 'command', command: 'write.indent', icon: IndentIncrease, size: 'icon' },
          {
            type: 'custom',
            id: 'line-spacing',
            render: () => (
              <CommandSelect
                label="Line spacing"
                width={84}
                options={[
                  { command: 'write.lineSpacing-default', label: 'Default' },
                  ...LINE_SPACINGS.map((spacing) => ({
                    command: `write.lineSpacing-${slug(spacing)}`,
                    label: String(spacing),
                  })),
                ]}
              />
            ),
          },
          { type: 'command', command: 'write.align-left', icon: AlignLeft, size: 'icon' },
          { type: 'command', command: 'write.align-center', icon: AlignCenter, size: 'icon' },
          { type: 'command', command: 'write.align-right', icon: AlignRight, size: 'icon' },
          { type: 'command', command: 'write.align-justify', icon: AlignJustify, size: 'icon' },
        ],
      },
      {
        id: 'styles',
        label: 'Styles',
        items: [
          { type: 'command', command: 'write.paragraph', icon: Pilcrow, size: 'large' },
          { type: 'command', command: 'write.heading1', icon: Heading1, size: 'large' },
          { type: 'command', command: 'write.heading2', icon: Heading2, size: 'large' },
          { type: 'command', command: 'write.heading3', icon: Heading3, size: 'large' },
        ],
      },
      {
        id: 'editing',
        label: 'Editing',
        items: [
          { type: 'command', command: 'write.find', icon: Search, size: 'large' },
          { type: 'command', command: 'write.replace', icon: Replace, size: 'large' },
          { type: 'command', command: 'write.spellCheck', icon: SpellCheck, size: 'large' },
        ],
      },
    ],
  };
}

const INSERT_TAB: RibbonTab = {
  id: 'insert',
  label: 'Insert',
  groups: [
    {
      id: 'insert',
      label: 'Insert',
      items: [
        { type: 'command', command: 'write.insertTable', icon: Table, size: 'large' },
        { type: 'command', command: 'write.insertImage', icon: ImagePlus, size: 'large' },
        { type: 'command', command: 'write.horizontalRule', icon: Minus, size: 'large' },
        { type: 'command', command: 'write.symbol', icon: Omega, size: 'large' },
      ],
    },
    {
      id: 'references',
      label: 'References',
      items: [
        { type: 'command', command: 'write.tableOfContents', icon: BookOpenText, size: 'large' },
        { type: 'command', command: 'write.footnote', icon: Footprints, size: 'large' },
      ],
    },
    {
      id: 'links',
      label: 'Links',
      items: [
        { type: 'command', command: 'write.link', icon: Link, size: 'large' },
        { type: 'command', command: 'write.unlink', icon: Link2Off },
      ],
    },
    {
      id: 'picture',
      label: 'Selected image',
      width: 230,
      items: [
        {
          type: 'custom',
          id: 'image-layout',
          render: () => (
            <CommandSelect
              label="Image position"
              width={220}
              currentLabel={() => 'Select an image first'}
              options={IMAGE_LAYOUTS.map(({ value, label }) => ({
                command: `write.imageLayout-${value}`,
                label,
              }))}
            />
          ),
        },
        { type: 'command', command: 'write.imageSmaller', icon: Minimize2, size: 'icon' },
        { type: 'command', command: 'write.imageLarger', icon: Maximize2, size: 'icon' },
        { type: 'command', command: 'write.imageOriginalSize', icon: RotateCcw, size: 'icon' },
      ],
    },
  ],
};

function buildTableTab(editor: Editor): RibbonTab {
  return {
    id: 'table',
    label: 'Table',
    groups: [
      {
        id: 'rows',
        label: 'Rows and columns',
        width: 240,
        items: [
          { type: 'command', command: 'write.addRow', icon: BetweenHorizontalEnd },
          { type: 'command', command: 'write.addColumn', icon: BetweenVerticalEnd },
          { type: 'command', command: 'write.deleteRow', icon: Trash2 },
          { type: 'command', command: 'write.deleteColumn', icon: Trash2 },
        ],
      },
      {
        id: 'cells',
        label: 'Cells',
        items: [
          { type: 'command', command: 'write.mergeCells', icon: TableCellsMerge, size: 'large' },
          { type: 'command', command: 'write.splitCell', icon: TableCellsSplit, size: 'large' },
          {
            type: 'custom',
            id: 'cell-color',
            render: () => (
              <ColorMenu
                label="Cell color"
                icon={PaintBucket}
                clearCommand="write.cellColor-default"
                current={() => {
                  const cell = editor.isActive('tableHeader') ? 'tableHeader' : 'tableCell';
                  return editor.getAttributes(cell).backgroundColor as string | undefined;
                }}
                swatches={HIGHLIGHT_COLORS.map(({ name, hex }) => ({
                  command: `write.cellColor-${slug(name)}`,
                  color: hex,
                }))}
              />
            ),
          },
        ],
      },
      {
        id: 'table',
        label: 'Table',
        items: [
          { type: 'command', command: 'write.headerRow', icon: Rows2, size: 'large' },
          { type: 'command', command: 'write.deleteTable', icon: Trash2, size: 'large' },
        ],
      },
    ],
  };
}

const LAYOUT_TAB: RibbonTab = {
  id: 'layout',
  label: 'Layout',
  groups: [
    {
      id: 'page',
      label: 'Page',
      width: 346,
      items: [
        {
          type: 'custom',
          id: 'page-size',
          render: () => (
            <CommandSelect
              label="Paper size"
              width={170}
              currentLabel={() => 'Custom size'}
              options={PAGE_SIZES.map((size) => ({
                command: `write.pageSize-${size.id}`,
                label: size.label,
              }))}
            />
          ),
        },
        {
          type: 'custom',
          id: 'orientation',
          render: () => (
            <CommandSelect
              label="Orientation"
              width={170}
              options={[
                { command: 'write.orientation-portrait', label: 'Portrait' },
                { command: 'write.orientation-landscape', label: 'Landscape' },
              ]}
            />
          ),
        },
        {
          type: 'custom',
          id: 'margins',
          render: () => (
            <CommandSelect
              label="Margins"
              width={170}
              currentLabel={() => 'Custom margins'}
              options={MARGIN_PRESETS.map((margins) => ({
                command: `write.margins-${margins.id}`,
                label: `${margins.label} margins`,
              }))}
            />
          ),
        },
        {
          type: 'custom',
          id: 'page-numbers',
          render: () => (
            <CommandSelect
              label="Page numbers"
              width={170}
              options={[
                { command: 'write.pageNumbers-none', label: 'No page numbers' },
                { command: 'write.pageNumbers-footer', label: 'Numbers in footer' },
                { command: 'write.pageNumbers-header', label: 'Numbers in header' },
              ]}
            />
          ),
        },
      ],
    },
    {
      id: 'columns',
      label: 'Columns',
      items: [
        {
          type: 'custom',
          id: 'column-count',
          render: () => (
            <CommandSelect
              label="Columns"
              width={120}
              options={[1, 2, 3].map((count) => ({
                command: `write.columns-${count}`,
                label: count === 1 ? 'One column' : `${count} columns`,
              }))}
            />
          ),
        },
      ],
    },
    {
      id: 'breaks',
      label: 'Breaks',
      items: [
        { type: 'command', command: 'write.pageBreak', icon: SeparatorHorizontal, size: 'large' },
      ],
    },
    {
      id: 'setup',
      label: 'Setup',
      items: [{ type: 'command', command: 'write.pageSetup', icon: FileSliders, size: 'large' }],
    },
  ],
};

export function buildWriteRibbon(fileTab: RibbonTab, editor: Editor): RibbonTab[] {
  return [
    { ...fileTab, groups: [...fileTab.groups, TRANSFER_GROUP] },
    buildHomeTab(editor),
    INSERT_TAB,
    LAYOUT_TAB,
    buildTableTab(editor),
  ];
}
