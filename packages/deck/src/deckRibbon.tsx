import { ColorMenu, CommandSelect, type RibbonGroup, type RibbonTab } from '@free360/ui';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Baseline,
  Bold,
  BringToFront,
  Circle,
  Copy,
  FileDown,
  ImagePlus,
  Italic,
  List,
  Minus,
  PaintBucket,
  PanelsTopLeft,
  Play,
  PlaySquare,
  Plus,
  Redo2,
  SendToBack,
  Square,
  Trash2,
  Triangle,
  Type,
  Undo2,
  Wallpaper,
} from 'lucide-react';
import { FONT_SIZES, LAYOUTS, THEMES, TRANSITIONS, type Slide, type SlideElement } from './deck';
import { COLORS, slug } from './palette';

const TRANSFER_GROUP: RibbonGroup = {
  id: 'transfer',
  label: 'Export',
  items: [
    { type: 'command', command: 'deck.exportPptx', icon: FileDown, size: 'large' },
    { type: 'command', command: 'deck.exportPdf', icon: FileDown, size: 'large' },
  ],
};

type RibbonState = {
  selected: () => SlideElement | undefined;
  slide: () => Slide;
};

function swatches(prefix: string) {
  return COLORS.map(({ name, hex }) => ({
    command: `${prefix}-${slug(name)}`,
    color: hex,
  }));
}

function buildHomeTab({ selected }: RibbonState): RibbonTab {
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
        id: 'slides',
        label: 'Slides',
        width: 400,
        items: [
          { type: 'command', command: 'deck.newSlide', icon: Plus },
          { type: 'command', command: 'deck.duplicateSlide', icon: Copy },
          { type: 'command', command: 'deck.deleteSlide', icon: Trash2 },
          {
            type: 'custom',
            id: 'layout',
            render: () => (
              <CommandSelect
                label="Slide layout"
                width={170}
                options={LAYOUTS.map(({ id, name }) => ({
                  command: `deck.layout-${id}`,
                  label: name,
                }))}
              />
            ),
          },
          { type: 'command', command: 'deck.moveSlideUp', icon: ArrowUp },
          { type: 'command', command: 'deck.moveSlideDown', icon: ArrowDown },
        ],
      },
      {
        id: 'text',
        label: 'Text',
        width: 240,
        items: [
          { type: 'command', command: 'deck.bold', icon: Bold, size: 'icon' },
          { type: 'command', command: 'deck.italic', icon: Italic, size: 'icon' },
          { type: 'command', command: 'deck.bullets', icon: List, size: 'icon' },
          {
            type: 'custom',
            id: 'text-color',
            render: () => (
              <ColorMenu
                label="Text color"
                icon={Baseline}
                clearCommand="deck.textColor-default"
                current={() => {
                  const element = selected();
                  return element?.type === 'text' ? element.color : undefined;
                }}
                swatches={swatches('deck.textColor')}
              />
            ),
          },
          {
            type: 'custom',
            id: 'font-size',
            render: () => (
              <CommandSelect
                label="Font size"
                width={70}
                currentLabel={() => {
                  const element = selected();
                  return element?.type === 'text' ? String(element.fontSize) : '';
                }}
                options={FONT_SIZES.map((size) => ({
                  command: `deck.fontSize-${size}`,
                  label: String(size),
                }))}
              />
            ),
          },
          { type: 'command', command: 'deck.align-left', icon: AlignLeft, size: 'icon' },
          { type: 'command', command: 'deck.align-center', icon: AlignCenter, size: 'icon' },
          { type: 'command', command: 'deck.align-right', icon: AlignRight, size: 'icon' },
        ],
      },
    ],
  };
}

function buildInsertTab({ selected }: RibbonState): RibbonTab {
  return {
    id: 'insert',
    label: 'Insert',
    groups: [
      {
        id: 'insert',
        label: 'Insert',
        items: [
          { type: 'command', command: 'deck.textBox', icon: Type, size: 'large' },
          { type: 'command', command: 'deck.image', icon: ImagePlus, size: 'large' },
        ],
      },
      {
        id: 'shapes',
        label: 'Shapes',
        items: [
          { type: 'command', command: 'deck.shape-rectangle', icon: Square, size: 'large' },
          { type: 'command', command: 'deck.shape-ellipse', icon: Circle, size: 'large' },
          { type: 'command', command: 'deck.shape-triangle', icon: Triangle, size: 'large' },
          { type: 'command', command: 'deck.shape-arrow', icon: ArrowRight, size: 'large' },
          { type: 'command', command: 'deck.shape-line', icon: Minus, size: 'large' },
        ],
      },
      {
        id: 'arrange',
        label: 'Selected object',
        width: 340,
        items: [
          {
            type: 'custom',
            id: 'shape-color',
            render: () => (
              <ColorMenu
                label="Shape color"
                icon={PaintBucket}
                clearCommand="deck.fill-default"
                current={() => {
                  const element = selected();
                  return element?.type === 'shape' ? element.fill : undefined;
                }}
                swatches={swatches('deck.fill')}
              />
            ),
          },
          { type: 'command', command: 'deck.bringToFront', icon: BringToFront },
          { type: 'command', command: 'deck.sendToBack', icon: SendToBack },
          { type: 'command', command: 'deck.duplicateElement', icon: Copy },
          { type: 'command', command: 'deck.deleteElement', icon: Trash2 },
        ],
      },
    ],
  };
}

function buildDesignTab({ slide }: RibbonState): RibbonTab {
  return {
    id: 'design',
    label: 'Design',
    groups: [
      {
        id: 'theme',
        label: 'Theme',
        items: [
          {
            type: 'custom',
            id: 'theme',
            render: () => (
              <CommandSelect
                label="Theme"
                width={150}
                options={THEMES.map(({ id, name }) => ({
                  command: `deck.theme-${id}`,
                  label: name,
                }))}
              />
            ),
          },
        ],
      },
      {
        id: 'background',
        label: 'This slide',
        items: [
          {
            type: 'custom',
            id: 'background',
            render: () => (
              <ColorMenu
                label="Slide background"
                icon={Wallpaper}
                clearCommand="deck.background-default"
                current={() => slide().background}
                swatches={swatches('deck.background')}
              />
            ),
          },
        ],
      },
      {
        id: 'transition',
        label: 'Transition',
        width: 170,
        items: [
          {
            type: 'custom',
            id: 'transition',
            render: () => (
              <CommandSelect
                label="Transition"
                width={160}
                options={TRANSITIONS.map(({ value, label }) => ({
                  command: `deck.transition-${value}`,
                  label,
                }))}
              />
            ),
          },
          { type: 'command', command: 'deck.transitionAll', icon: PanelsTopLeft },
        ],
      },
    ],
  };
}

const PRESENT_TAB: RibbonTab = {
  id: 'present',
  label: 'Present',
  groups: [
    {
      id: 'present',
      label: 'Present',
      items: [
        { type: 'command', command: 'deck.presentFromStart', icon: Play, size: 'large' },
        { type: 'command', command: 'deck.presentFromHere', icon: PlaySquare, size: 'large' },
      ],
    },
  ],
};

export function buildDeckRibbon(fileTab: RibbonTab, state: RibbonState): RibbonTab[] {
  return [
    { ...fileTab, groups: [...fileTab.groups, TRANSFER_GROUP] },
    buildHomeTab(state),
    buildInsertTab(state),
    buildDesignTab(state),
    PRESENT_TAB,
  ];
}
