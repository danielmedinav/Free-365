import {
  createAutosaver,
  pickFiles,
  saveBlob,
  toFileName,
  writeDraft,
  type FileTypeOption,
  type SaveStatus,
} from '@free360/storage';
import {
  AppShell,
  Button,
  DialogFrame,
  useRegisterCommands,
  useRegistry,
  type EditorAppProps,
} from '@free360/ui';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import { createDeckCommands } from './commands';
import { buildDeckRibbon } from './deckRibbon';
import {
  createImage,
  createTextBox,
  DECK_SCHEMA_VERSION,
  themeOf,
  type Deck,
  type SlideElement,
} from './deck';
import styles from './DeckEditor.module.css';
import { loadImage } from './imageCache';
import { Presenter } from './Presenter';
import { SlideCanvas } from './SlideCanvas';
import { SlideSorter } from './SlideSorter';
import { DeckStore } from './store';

const IMAGE_FILE_TYPE: FileTypeOption = {
  description: 'Images',
  mimeType: 'image/png',
  extensions: ['.png', '.jpg', '.jpeg', '.gif'],
};

const PPTX_FILE_TYPE: FileTypeOption = {
  description: 'Presentation',
  mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  extensions: ['.pptx'],
};

const PDF_FILE_TYPE: FileTypeOption = {
  description: 'PDF',
  mimeType: 'application/pdf',
  extensions: ['.pdf'],
};

const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif'];
/** Images live inside the presentation, so a huge one slows every save. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const SAVE_LABELS: Record<SaveStatus, string> = {
  saved: 'Saved locally',
  pending: 'Saving…',
  saving: 'Saving…',
  error: 'Could not save. Export a copy to keep your work.',
};

/** Pixels per arrow key press; holding Shift moves further. */
const NUDGE = 4;
const BIG_NUDGE = 20;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

type DeckEditorProps = EditorAppProps & { initialDeck: Deck };

export function DeckEditor({ meta, repo, shell, fileTab, initialDeck }: DeckEditorProps) {
  const registry = useRegistry();
  const [store] = useState(() => new DeckStore(initialDeck));
  const deck = useSyncExternalStore(store.subscribe, store.getDeck);
  const theme = themeOf(deck);

  const [currentId, setCurrentId] = useState(initialDeck.slides[0]!.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [presentingFrom, setPresentingFrom] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);

  // Undo can remove the slide being shown, so fall back to the first.
  const slide = deck.slides.find((s) => s.id === currentId) ?? deck.slides[0]!;
  const slideNumber = deck.slides.indexOf(slide) + 1;
  const selected = slide.elements.find((element) => element.id === selectedId);

  const focusCanvas = () => areaRef.current?.focus({ preventScroll: true });

  const goToSlide = (id: string) => {
    setCurrentId(id);
    setSelectedId(null);
    setEditingId(null);
  };

  const autosaver = useMemo(
    () =>
      createAutosaver({
        save: () => repo.saveContent(meta.id, store.getDeck(), DECK_SCHEMA_VERSION),
      }),
    [repo, meta.id, store],
  );
  const saveStatus = useSyncExternalStore(autosaver.subscribe, autosaver.getStatus);

  useEffect(() => {
    const unsubscribe = store.subscribe(() => autosaver.markDirty());
    const onLeave = () => {
      if (autosaver.getStatus() === 'saved') return;
      writeDraft(meta.id, store.getDeck());
      void autosaver.flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void autosaver.flush();
    };
    window.addEventListener('pagehide', onLeave);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      void autosaver.flush();
    };
  }, [store, autosaver, meta.id]);

  // Ribbon buttons depend on the slide and selection, which live in this component.
  useEffect(() => registry.notify(), [registry, deck, currentId, selectedId]);

  const finishText = (id: string, text: string) => {
    setEditingId(null);
    const element = slide.elements.find((e) => e.id === id);
    if (element?.type !== 'text') return;
    if (!text.trim() && !element.role) {
      // A text box that never got any text isn't worth keeping.
      store.removeElement(slide.id, id);
      setSelectedId(null);
    } else if (text !== element.text) {
      store.updateElement(slide.id, id, { text }, 'Edit text');
    }
    focusCanvas();
  };

  const nudge = (dx: number, dy: number) => {
    if (selected) {
      store.updateElement(
        slide.id,
        selected.id,
        { x: selected.x + dx, y: selected.y + dy },
        'Move',
      );
    }
  };

  const onCanvasKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const step = event.shiftKey ? BIG_NUDGE : NUDGE;
    const { elements } = slide;
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        return nudge(-step, 0);
      case 'ArrowRight':
        event.preventDefault();
        return nudge(step, 0);
      case 'ArrowUp':
        event.preventDefault();
        return nudge(0, -step);
      case 'ArrowDown':
        event.preventDefault();
        return nudge(0, step);
      case 'Tab': {
        if (!elements.length) return;
        event.preventDefault();
        const index = elements.findIndex((e) => e.id === selectedId);
        const delta = event.shiftKey ? -1 : 1;
        const next = elements[(index + delta + elements.length) % elements.length]!;
        setSelectedId(next.id);
        return;
      }
      case 'Enter':
      case 'F2':
        if (selected?.type === 'text') {
          event.preventDefault();
          setEditingId(selected.id);
        }
        return;
      case 'Delete':
      case 'Backspace':
        if (selected) {
          event.preventDefault();
          registry.execute('deck.deleteElement');
        }
        return;
      case 'Escape':
        setSelectedId(null);
    }
  };

  const exitPresenter = useCallback(() => setPresentingFrom(null), []);

  // Back on the slide once a presentation has really gone, so the keyboard works straight away.
  const presenting = presentingFrom !== null;
  useEffect(() => {
    if (!presenting) areaRef.current?.focus({ preventScroll: true });
  }, [presenting]);

  const failed = (message: string) => (error: unknown) => {
    console.error(error);
    setNotice(message);
  };

  // These only use the refs when a command runs, not while rendering.
  useRegisterCommands(
    // eslint-disable-next-line react-hooks/refs
    createDeckCommands({
      store,
      currentSlide: () => slide,
      selected: () => selected,
      goToSlide,
      select: setSelectedId,
      focusCanvas,
      addTextBox() {
        const box = createTextBox();
        store.addElement(slide.id, box);
        setSelectedId(box.id);
        setEditingId(box.id);
      },
      async insertImage() {
        const [file] = await pickFiles([IMAGE_FILE_TYPE]);
        if (!file) return;
        if (!IMAGE_MIME_TYPES.includes(file.type)) {
          setNotice(`“${file.name}” isn't a PNG, JPEG, or GIF image.`);
          return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          setNotice(`“${file.name}” is larger than 10 MB.`);
          return;
        }
        try {
          const src = await readAsDataUrl(file);
          const { naturalWidth, naturalHeight } = await loadImage(src);
          const image = createImage(src, file.name, naturalWidth, naturalHeight);
          store.addElement(slide.id, image);
          setSelectedId(image.id);
          focusCanvas();
        } catch (error) {
          failed(`Could not read “${file.name}”.`)(error);
        }
      },
      present(fromStart) {
        if (editingId) focusCanvas();
        setPresentingFrom(fromStart ? 0 : deck.slides.indexOf(slide));
      },
      save: () => autosaver.flush(),
      async exportPptx() {
        try {
          const { exportPptx } = await import('./io/pptx');
          const blob = await exportPptx(store.getDeck(), meta.title);
          await saveBlob(blob, toFileName(meta.title, 'pptx'), PPTX_FILE_TYPE);
        } catch (error) {
          failed('Could not export this presentation.')(error);
        }
      },
      async exportPdf() {
        try {
          const { exportPdf } = await import('./io/pdf');
          const blob = await exportPdf(store.getDeck());
          await saveBlob(blob, toFileName(meta.title, 'pdf'), PDF_FILE_TYPE);
        } catch (error) {
          failed('Could not export this presentation.')(error);
        }
      },
    }),
  );

  const handleChange = (id: string, patch: Partial<SlideElement>, label: string) => {
    store.updateElement(slide.id, id, patch, label);
  };

  return (
    <AppShell
      {...shell}
      ribbon={buildDeckRibbon(fileTab, { selected: () => selected, slide: () => slide })}
      status={{
        left: (
          <>
            <span>FreeDeck</span>
            <span>{`Slide ${slideNumber} of ${deck.slides.length}`}</span>
          </>
        ),
        right: <span role="status">{SAVE_LABELS[saveStatus]}</span>,
      }}
    >
      <div className={styles.layout}>
        <SlideSorter
          slides={deck.slides}
          theme={theme}
          currentId={slide.id}
          onSelect={goToSlide}
          onMove={(id, index) => store.moveSlide(id, index)}
        />
        <div className={styles.main}>
          <SlideCanvas
            slide={slide}
            theme={theme}
            selectedId={selectedId}
            editingId={editingId}
            areaRef={areaRef}
            onSelect={setSelectedId}
            onEditText={setEditingId}
            onFinishText={finishText}
            onChange={handleChange}
            onKeyDown={onCanvasKeyDown}
          />
          <label className={styles.notes}>
            <span className={styles.notesLabel}>Speaker notes</span>
            {/* Saved when it loses focus, so one edit is one undo step. Remade if undo changes it. */}
            <textarea
              key={`${slide.id}:${slide.notes}`}
              className={styles.notesText}
              defaultValue={slide.notes}
              placeholder="Notes for this slide. Press S while presenting to see them."
              rows={2}
              onBlur={(event) => store.setNotes(slide.id, event.target.value)}
            />
          </label>
        </div>
      </div>
      {presentingFrom !== null && (
        <Presenter deck={deck} startIndex={presentingFrom} onExit={exitPresenter} />
      )}
      <DialogFrame
        open={notice !== null}
        onOpenChange={(open) => {
          if (!open) setNotice(null);
        }}
        title="Something went wrong"
        description={notice}
      >
        <div className={styles.noticeActions}>
          <Button variant="primary" onClick={() => setNotice(null)}>
            OK
          </Button>
        </div>
      </DialogFrame>
    </AppShell>
  );
}
