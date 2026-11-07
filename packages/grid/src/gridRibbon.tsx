import { ColorMenu, CommandSelect, type RibbonGroup, type RibbonTab } from '@free360/ui';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownAZ,
  ArrowUpZA,
  Baseline,
  BetweenHorizontalStart,
  BetweenVerticalStart,
  Bold,
  ChartColumn,
  ChartLine,
  ChartPie,
  FileDown,
  FileUp,
  Filter,
  Italic,
  PaintBucket,
  Redo2,
  Trash2,
  Underline,
  Undo2,
} from 'lucide-react';
import { NUMBER_FORMATS } from './commands';
import { HIGHLIGHT_COLORS, slug, TEXT_COLORS } from './palette';
import type { CellStyle } from './workbook';

const TRANSFER_GROUP: RibbonGroup = {
  id: 'transfer',
  label: 'Import and export',
  items: [
    { type: 'command', command: 'grid.importXlsx', icon: FileUp, size: 'large' },
    { type: 'command', command: 'grid.exportXlsx', icon: FileDown, size: 'large' },
    { type: 'command', command: 'grid.importCsv', icon: FileUp, size: 'large' },
    { type: 'command', command: 'grid.exportCsv', icon: FileDown, size: 'large' },
  ],
};

function buildHomeTab(activeStyle: () => CellStyle): RibbonTab {
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
        items: [
          { type: 'command', command: 'grid.bold', icon: Bold, size: 'icon' },
          { type: 'command', command: 'grid.italic', icon: Italic, size: 'icon' },
          { type: 'command', command: 'grid.underline', icon: Underline, size: 'icon' },
          {
            type: 'custom',
            id: 'text-color',
            render: () => (
              <ColorMenu
                label="Text color"
                icon={Baseline}
                clearCommand="grid.textColor-default"
                current={() => activeStyle().color}
                swatches={TEXT_COLORS.map(({ name, hex }) => ({
                  command: `grid.textColor-${slug(name)}`,
                  color: hex,
                }))}
              />
            ),
          },
          {
            type: 'custom',
            id: 'fill-color',
            render: () => (
              <ColorMenu
                label="Fill color"
                icon={PaintBucket}
                clearCommand="grid.fill-default"
                current={() => activeStyle().fill}
                swatches={HIGHLIGHT_COLORS.map(({ name, hex }) => ({
                  command: `grid.fill-${slug(name)}`,
                  color: hex,
                }))}
              />
            ),
          },
        ],
      },
      {
        id: 'alignment',
        label: 'Alignment',
        items: [
          { type: 'command', command: 'grid.align-left', icon: AlignLeft, size: 'icon' },
          { type: 'command', command: 'grid.align-center', icon: AlignCenter, size: 'icon' },
          { type: 'command', command: 'grid.align-right', icon: AlignRight, size: 'icon' },
        ],
      },
      {
        id: 'number',
        label: 'Number',
        items: [
          {
            type: 'custom',
            id: 'number-format',
            render: () => (
              <CommandSelect
                label="Number format"
                width={120}
                options={NUMBER_FORMATS.map(({ value, label }) => ({
                  command: `grid.format-${value}`,
                  label,
                }))}
              />
            ),
          },
        ],
      },
      {
        id: 'cells',
        label: 'Rows and columns',
        width: 270,
        items: [
          { type: 'command', command: 'grid.insertRows', icon: BetweenHorizontalStart },
          { type: 'command', command: 'grid.insertColumns', icon: BetweenVerticalStart },
          { type: 'command', command: 'grid.deleteRows', icon: Trash2 },
          { type: 'command', command: 'grid.deleteColumns', icon: Trash2 },
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
      id: 'charts',
      label: 'Charts',
      items: [
        { type: 'command', command: 'grid.chart-bar', icon: ChartColumn, size: 'large' },
        { type: 'command', command: 'grid.chart-line', icon: ChartLine, size: 'large' },
        { type: 'command', command: 'grid.chart-pie', icon: ChartPie, size: 'large' },
      ],
    },
  ],
};

const DATA_TAB: RibbonTab = {
  id: 'data',
  label: 'Data',
  groups: [
    {
      id: 'sort',
      label: 'Sort and filter',
      items: [
        { type: 'command', command: 'grid.sortAscending', icon: ArrowDownAZ, size: 'large' },
        { type: 'command', command: 'grid.sortDescending', icon: ArrowUpZA, size: 'large' },
        { type: 'command', command: 'grid.filter', icon: Filter, size: 'large' },
      ],
    },
  ],
};

export function buildGridRibbon(fileTab: RibbonTab, activeStyle: () => CellStyle): RibbonTab[] {
  return [
    { ...fileTab, groups: [...fileTab.groups, TRANSFER_GROUP] },
    buildHomeTab(activeStyle),
    INSERT_TAB,
    DATA_TAB,
  ];
}
