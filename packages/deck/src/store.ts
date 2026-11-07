import { createHistory, type History } from '@free360/commands';
import { applyPatches, enablePatches, produceWithPatches, type Draft } from 'immer';
import {
  applyLayout,
  copyElement,
  copySlide,
  createSlide,
  type Deck,
  type LayoutId,
  type Slide,
  type SlideElement,
  type Transition,
} from './deck';

enablePatches();

/** Holds the presentation and its undo history, which is built from Immer patches. */
export class DeckStore {
  readonly history: History = createHistory();
  private deck: Deck;
  private readonly listeners = new Set<() => void>();

  constructor(deck: Deck) {
    this.deck = deck;
  }

  getDeck = () => this.deck;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private show(next: Deck) {
    this.deck = next;
    this.listeners.forEach((listener) => listener());
  }

  private commit(label: string, recipe: (draft: Draft<Deck>) => void) {
    const [next, patches, inverse] = produceWithPatches(this.deck, recipe);
    if (!patches.length) return;
    this.show(next);
    this.history.push({
      label,
      undo: () => this.show(applyPatches(this.deck, inverse)),
      redo: () => this.show(applyPatches(this.deck, patches)),
    });
  }

  private slideIn(draft: Draft<Deck>, id: string): Draft<Slide> | undefined {
    return draft.slides.find((slide) => slide.id === id);
  }

  /** Adds a slide after the given one, and returns it. */
  addSlide(layout: LayoutId, afterId?: string): Slide {
    const slide = createSlide(layout);
    this.commit('New slide', (draft) => {
      const index = draft.slides.findIndex((s) => s.id === afterId);
      draft.slides.splice(index < 0 ? draft.slides.length : index + 1, 0, slide);
    });
    return slide;
  }

  duplicateSlide(id: string): Slide | undefined {
    const source = this.deck.slides.find((slide) => slide.id === id);
    if (!source) return undefined;
    const copy = copySlide(source);
    this.commit('Duplicate slide', (draft) => {
      draft.slides.splice(draft.slides.findIndex((s) => s.id === id) + 1, 0, copy);
    });
    return copy;
  }

  /** A presentation always keeps at least one slide. */
  removeSlide(id: string) {
    if (this.deck.slides.length < 2) return;
    this.commit('Delete slide', (draft) => {
      draft.slides = draft.slides.filter((slide) => slide.id !== id);
    });
  }

  moveSlide(id: string, toIndex: number) {
    this.commit('Move slide', (draft) => {
      const from = draft.slides.findIndex((slide) => slide.id === id);
      const to = Math.min(Math.max(toIndex, 0), draft.slides.length - 1);
      if (from < 0 || from === to) return;
      const [slide] = draft.slides.splice(from, 1);
      draft.slides.splice(to, 0, slide!);
    });
  }

  setLayout(slideId: string, layout: LayoutId) {
    this.commit('Change layout', (draft) => {
      const slide = this.slideIn(draft, slideId);
      if (!slide || slide.layout === layout) return;
      slide.elements = applyLayout(slide as Slide, layout) as Draft<SlideElement>[];
      slide.layout = layout;
    });
  }

  setNotes(slideId: string, notes: string) {
    this.commit('Edit notes', (draft) => {
      const slide = this.slideIn(draft, slideId);
      if (slide) slide.notes = notes;
    });
  }

  setTransition(slideId: string, transition: Transition) {
    this.commit('Change transition', (draft) => {
      const slide = this.slideIn(draft, slideId);
      if (slide) slide.transition = transition;
    });
  }

  setAllTransitions(transition: Transition) {
    this.commit('Change transitions', (draft) => {
      for (const slide of draft.slides) slide.transition = transition;
    });
  }

  setBackground(slideId: string, background: string | undefined) {
    this.commit('Change background', (draft) => {
      const slide = this.slideIn(draft, slideId);
      if (slide) slide.background = background;
    });
  }

  setTheme(themeId: string) {
    this.commit('Change theme', (draft) => {
      draft.themeId = themeId;
    });
  }

  addElement(slideId: string, element: SlideElement) {
    this.commit('Add', (draft) => {
      this.slideIn(draft, slideId)?.elements.push(element as Draft<SlideElement>);
    });
  }

  updateElement(slideId: string, elementId: string, patch: Partial<SlideElement>, label = 'Edit') {
    this.commit(label, (draft) => {
      const element = this.slideIn(draft, slideId)?.elements.find((e) => e.id === elementId);
      if (element) Object.assign(element, patch);
    });
  }

  removeElement(slideId: string, elementId: string) {
    this.commit('Delete', (draft) => {
      const slide = this.slideIn(draft, slideId);
      if (slide) slide.elements = slide.elements.filter((e) => e.id !== elementId);
    });
  }

  duplicateElement(slideId: string, elementId: string): SlideElement | undefined {
    const source = this.deck.slides
      .find((slide) => slide.id === slideId)
      ?.elements.find((element) => element.id === elementId);
    if (!source) return undefined;
    const copy = copyElement(source);
    this.addElement(slideId, copy);
    return copy;
  }

  /** Later elements draw on top of earlier ones. */
  moveElementInStack(slideId: string, elementId: string, place: 'front' | 'back') {
    this.commit(place === 'front' ? 'Bring to front' : 'Send to back', (draft) => {
      const slide = this.slideIn(draft, slideId);
      if (!slide) return;
      const index = slide.elements.findIndex((e) => e.id === elementId);
      const target = place === 'front' ? slide.elements.length - 1 : 0;
      if (index < 0 || index === target) return;
      const [element] = slide.elements.splice(index, 1);
      slide.elements.splice(target, 0, element!);
    });
  }
}
