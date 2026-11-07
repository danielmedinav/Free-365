import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Layer, Stage } from 'react-konva';
import { SLIDE_HEIGHT, SLIDE_WIDTH, themeOf, type Deck } from './deck';
import styles from './Presenter.module.css';
import { SlideContent } from './SlideContent';

type PresenterProps = {
  deck: Deck;
  startIndex: number;
  onExit: () => void;
};

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n']);
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p']);

/** The presentation filling the screen. Keys or clicks move through it; Esc leaves. */
export function Presenter({ deck, startIndex, onExit }: PresenterProps) {
  const [index, setIndex] = useState(startIndex);
  const [showNotes, setShowNotes] = useState(false);
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const rootRef = useRef<HTMLDivElement>(null);
  const count = deck.slides.length;
  const theme = themeOf(deck);
  const slide = deck.slides[index];

  const next = useCallback(() => setIndex((i) => Math.min(i + 1, count)), [count]);
  const previous = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    // Captured here so the app's own shortcuts don't fire while presenting.
    const onKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        onExit();
      } else if (NEXT_KEYS.has(event.key)) {
        event.preventDefault();
        next();
      } else if (PREVIOUS_KEYS.has(event.key)) {
        event.preventDefault();
        previous();
      } else if (event.key === 'Home') {
        setIndex(0);
      } else if (event.key === 'End') {
        setIndex(count - 1);
      } else if (event.key === 's') {
        setShowNotes((on) => !on);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [count, next, previous, onExit]);

  useLayoutEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Uses the whole screen where the browser allows it. Leaving full screen ends the presentation.
  useEffect(() => {
    const root = rootRef.current;
    let entered = false;
    root
      ?.requestFullscreen?.()
      .then(() => {
        entered = true;
      })
      .catch(() => {
        // Not allowed here; it still fills the window.
      });
    const onChange = () => {
      if (entered && !document.fullscreenElement) onExit();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [onExit]);

  const scale = Math.min(size.width / SLIDE_WIDTH, size.height / SLIDE_HEIGHT);

  return createPortal(
    <div
      ref={rootRef}
      className={styles.root}
      role="dialog"
      aria-label="Presentation"
      aria-modal
      onClick={next}
    >
      {slide ? (
        <div key={slide.id} className={styles.slide} data-transition={slide.transition}>
          <Stage
            width={SLIDE_WIDTH * scale}
            height={SLIDE_HEIGHT * scale}
            scaleX={scale}
            scaleY={scale}
            listening={false}
          >
            <Layer listening={false}>
              <SlideContent slide={slide} theme={theme} />
            </Layer>
          </Stage>
        </div>
      ) : (
        <p className={styles.end}>End of presentation. Press Esc to go back.</p>
      )}
      <div className={styles.counter} role="status">
        {slide ? `Slide ${index + 1} of ${count}` : `End`}
      </div>
      {showNotes && slide?.notes && <div className={styles.notes}>{slide.notes}</div>}
    </div>,
    document.body,
  );
}
