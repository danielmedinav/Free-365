import { createUndoCommands, type Command } from '@free360/commands';
import {
  createShape,
  FONT_SIZES,
  LAYOUTS,
  THEMES,
  TRANSITIONS,
  type ShapeElement,
  type ShapeKind,
  type Slide,
  type SlideElement,
  type TextElement,
} from './deck';
import { COLORS, slug } from './palette';
import type { DeckStore } from './store';

export const SHAPE_KINDS: { kind: ShapeKind; label: string }[] = [
  { kind: 'rectangle', label: 'Rectangle' },
  { kind: 'ellipse', label: 'Ellipse' },
  { kind: 'triangle', label: 'Triangle' },
  { kind: 'arrow', label: 'Arrow' },
  { kind: 'line', label: 'Line' },
];

export type DeckActions = {
  store: DeckStore;
  currentSlide: () => Slide;
  selected: () => SlideElement | undefined;
  goToSlide: (id: string) => void;
  select: (id: string | null) => void;
  focusCanvas: () => void;
  addTextBox: () => void;
  insertImage: () => void | Promise<unknown>;
  present: (fromStart: boolean) => void;
  save: () => void | Promise<unknown>;
  exportPptx: () => void | Promise<unknown>;
  exportPdf: () => void | Promise<unknown>;
};

export function createDeckCommands(actions: DeckActions): Command[] {
  const { store, currentSlide, selected, goToSlide, select, focusCanvas } = actions;

  /** Keeps the keyboard on the slide after using a button. */
  const onCanvas = (run: () => void) => () => {
    run();
    focusCanvas();
    // Again once any menu that ran this has closed, as it holds on to focus until then. By then
    // the keyboard may have moved on to something else, which keeps it.
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) focusCanvas();
    });
  };
  const selectedText = () => {
    const element = selected();
    return element?.type === 'text' ? element : undefined;
  };
  const isText = () => !!selectedText();
  const isSelected = () => !!selected();

  const updateText = (patch: Partial<TextElement>) =>
    onCanvas(() => {
      const element = selectedText();
      if (element) store.updateElement(currentSlide().id, element.id, patch, 'Format text');
    });

  const toggle = (
    id: string,
    label: string,
    shortcut: string | undefined,
    key: 'bold' | 'italic' | 'bullets',
  ): Command => ({
    id,
    label,
    shortcut,
    run: () => updateText({ [key]: !selectedText()?.[key] })(),
    isEnabled: isText,
    isActive: () => !!selectedText()?.[key],
  });

  const moveSlideBy = (delta: number) =>
    onCanvas(() => {
      const slide = currentSlide();
      const index = store.getDeck().slides.findIndex((s) => s.id === slide.id);
      store.moveSlide(slide.id, index + delta);
    });

  const slideIndex = () => store.getDeck().slides.findIndex((s) => s.id === currentSlide().id);

  return [
    // In a text box or the notes, Ctrl+Z must undo that field's text, not the presentation.
    ...createUndoCommands(() => store.history).map((command) => ({
      ...command,
      allowInInputs: false,
    })),

    {
      id: 'deck.newSlide',
      label: 'New slide',
      description: 'Add a slide after this one',
      shortcut: 'Mod+M',
      allowInInputs: true,
      run: onCanvas(() => goToSlide(store.addSlide('content', currentSlide().id).id)),
    },
    {
      id: 'deck.duplicateSlide',
      label: 'Duplicate',
      description: 'Copy this slide',
      run: onCanvas(() => {
        const copy = store.duplicateSlide(currentSlide().id);
        if (copy) goToSlide(copy.id);
      }),
    },
    {
      id: 'deck.deleteSlide',
      label: 'Delete slide',
      run: onCanvas(() => {
        const { slides } = store.getDeck();
        const index = slideIndex();
        const neighbor = slides[index + 1] ?? slides[index - 1];
        if (!neighbor) return;
        store.removeSlide(currentSlide().id);
        goToSlide(neighbor.id);
      }),
      isEnabled: () => store.getDeck().slides.length > 1,
    },
    {
      id: 'deck.moveSlideUp',
      label: 'Move up',
      description: 'Move this slide earlier',
      run: moveSlideBy(-1),
      isEnabled: () => slideIndex() > 0,
    },
    {
      id: 'deck.moveSlideDown',
      label: 'Move down',
      description: 'Move this slide later',
      run: moveSlideBy(1),
      isEnabled: () => slideIndex() < store.getDeck().slides.length - 1,
    },
    ...LAYOUTS.map(({ id, name }): Command => ({
      id: `deck.layout-${id}`,
      label: name,
      run: onCanvas(() => store.setLayout(currentSlide().id, id)),
      isActive: () => currentSlide().layout === id,
    })),

    toggle('deck.bold', 'Bold', 'Mod+B', 'bold'),
    toggle('deck.italic', 'Italic', 'Mod+I', 'italic'),
    toggle('deck.bullets', 'Bullets', undefined, 'bullets'),
    ...(['left', 'center', 'right'] as const).map((align): Command => ({
      id: `deck.align-${align}`,
      label: `Align ${align}`,
      run: updateText({ align }),
      isEnabled: isText,
      isActive: () => selectedText()?.align === align,
    })),
    ...FONT_SIZES.map((size): Command => ({
      id: `deck.fontSize-${size}`,
      label: String(size),
      run: updateText({ fontSize: size }),
      isEnabled: isText,
      isActive: () => selectedText()?.fontSize === size,
    })),
    {
      id: 'deck.textColor-default',
      label: 'Theme color',
      run: updateText({ color: undefined }),
      isEnabled: isText,
    },
    ...COLORS.map(({ name, hex }): Command => ({
      id: `deck.textColor-${slug(name)}`,
      label: `${name} text`,
      run: updateText({ color: hex }),
      isEnabled: isText,
    })),

    {
      id: 'deck.textBox',
      label: 'Text box',
      run: actions.addTextBox,
    },
    ...SHAPE_KINDS.map(({ kind, label }): Command => ({
      id: `deck.shape-${kind}`,
      label,
      run: onCanvas(() => {
        const shape = createShape(kind);
        store.addElement(currentSlide().id, shape);
        select(shape.id);
      }),
    })),
    {
      id: 'deck.image',
      label: 'Image',
      description: 'Add a picture from your computer',
      run: actions.insertImage,
    },

    {
      id: 'deck.fill-default',
      label: 'Theme color',
      run: onCanvas(() => {
        const element = selected();
        if (element?.type === 'shape') {
          store.updateElement(currentSlide().id, element.id, { fill: undefined }, 'Change color');
        }
      }),
      isEnabled: () => selected()?.type === 'shape',
    },
    ...COLORS.map(({ name, hex }): Command => ({
      id: `deck.fill-${slug(name)}`,
      label: `${name} shape`,
      run: onCanvas(() => {
        const element = selected();
        if (element?.type === 'shape') {
          const patch: Partial<ShapeElement> = { fill: hex };
          store.updateElement(currentSlide().id, element.id, patch, 'Change color');
        }
      }),
      isEnabled: () => selected()?.type === 'shape',
    })),
    {
      id: 'deck.bringToFront',
      label: 'To front',
      description: 'Draw this over everything else',
      run: onCanvas(() => {
        const element = selected();
        if (element) store.moveElementInStack(currentSlide().id, element.id, 'front');
      }),
      isEnabled: isSelected,
    },
    {
      id: 'deck.sendToBack',
      label: 'To back',
      description: 'Draw this behind everything else',
      run: onCanvas(() => {
        const element = selected();
        if (element) store.moveElementInStack(currentSlide().id, element.id, 'back');
      }),
      isEnabled: isSelected,
    },
    {
      id: 'deck.duplicateElement',
      label: 'Copy object',
      shortcut: 'Mod+D',
      run: onCanvas(() => {
        const element = selected();
        if (!element) return;
        const copy = store.duplicateElement(currentSlide().id, element.id);
        if (copy) select(copy.id);
      }),
      isEnabled: isSelected,
    },
    {
      id: 'deck.deleteElement',
      label: 'Delete object',
      run: onCanvas(() => {
        const element = selected();
        if (!element) return;
        store.removeElement(currentSlide().id, element.id);
        select(null);
      }),
      isEnabled: isSelected,
    },

    ...THEMES.map(({ id, name }): Command => ({
      id: `deck.theme-${id}`,
      label: name,
      run: onCanvas(() => store.setTheme(id)),
      isActive: () => store.getDeck().themeId === id,
    })),
    {
      id: 'deck.background-default',
      label: 'Theme background',
      run: onCanvas(() => store.setBackground(currentSlide().id, undefined)),
    },
    ...COLORS.map(({ name, hex }): Command => ({
      id: `deck.background-${slug(name)}`,
      label: `${name} background`,
      run: onCanvas(() => store.setBackground(currentSlide().id, hex)),
    })),
    ...TRANSITIONS.map(({ value, label }): Command => ({
      id: `deck.transition-${value}`,
      label,
      run: onCanvas(() => store.setTransition(currentSlide().id, value)),
      isActive: () => currentSlide().transition === value,
    })),
    {
      id: 'deck.transitionAll',
      label: 'Use on all slides',
      description: 'Give every slide the same transition as this one',
      run: onCanvas(() => store.setAllTransitions(currentSlide().transition)),
    },

    {
      id: 'deck.presentFromStart',
      label: 'From start',
      description: 'Present from the first slide',
      shortcut: 'F5',
      allowInInputs: true,
      run: () => actions.present(true),
    },
    {
      id: 'deck.presentFromHere',
      label: 'From this slide',
      description: 'Present from the slide you are on',
      shortcut: 'Shift+F5',
      allowInInputs: true,
      run: () => actions.present(false),
    },

    {
      id: 'deck.save',
      label: 'Save',
      description: 'Your work saves automatically; this saves right now',
      shortcut: 'Mod+S',
      allowInInputs: true,
      run: actions.save,
    },
    {
      id: 'deck.exportPptx',
      label: 'Export .pptx',
      description: 'Save a copy as a .pptx file',
      run: actions.exportPptx,
    },
    {
      id: 'deck.exportPdf',
      label: 'Export PDF',
      description: 'Save a copy as a PDF, with one page per slide',
      run: actions.exportPdf,
    },
  ];
}
