import type { RibbonGroup, RibbonTab } from '@free360/ui';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  Bold,
  FileDown,
  FileUp,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Printer,
  Redo2,
  Replace,
  Search,
  Strikethrough,
  Table,
  Trash2,
  Underline,
  Undo2,
} from 'lucide-react';

const TRANSFER_GROUP: RibbonGroup = {
  id: 'transfer',
  label: 'Import and export',
  items: [
    { type: 'command', command: 'write.importDocx', icon: FileUp, size: 'large' },
    { type: 'command', command: 'write.exportDocx', icon: FileDown, size: 'large' },
    { type: 'command', command: 'write.print', icon: Printer, size: 'large' },
  ],
};

const HOME_TAB: RibbonTab = {
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
      items: [
        { type: 'command', command: 'write.bold', icon: Bold, size: 'icon' },
        { type: 'command', command: 'write.italic', icon: Italic, size: 'icon' },
        { type: 'command', command: 'write.underline', icon: Underline, size: 'icon' },
        { type: 'command', command: 'write.strike', icon: Strikethrough, size: 'icon' },
      ],
    },
    {
      id: 'paragraph',
      label: 'Paragraph',
      items: [
        { type: 'command', command: 'write.bulletList', icon: List, size: 'icon' },
        { type: 'command', command: 'write.orderedList', icon: ListOrdered, size: 'icon' },
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
      ],
    },
  ],
};

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
      ],
    },
    {
      id: 'table',
      label: 'Table',
      items: [
        { type: 'command', command: 'write.addRow', icon: BetweenHorizontalEnd },
        { type: 'command', command: 'write.addColumn', icon: BetweenVerticalEnd },
        { type: 'command', command: 'write.deleteRow', icon: Trash2 },
        { type: 'command', command: 'write.deleteColumn', icon: Trash2 },
        { type: 'command', command: 'write.deleteTable', icon: Trash2 },
      ],
    },
  ],
};

export function buildWriteRibbon(fileTab: RibbonTab): RibbonTab[] {
  return [{ ...fileTab, groups: [...fileTab.groups, TRANSFER_GROUP] }, HOME_TAB, INSERT_TAB];
}
