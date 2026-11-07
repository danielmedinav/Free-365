import { useState } from 'react';
import type { Slide, Theme } from './deck';
import styles from './SlideSorter.module.css';
import { SlideThumb } from './SlideThumb';

type SlideSorterProps = {
  slides: Slide[];
  theme: Theme;
  currentId: string;
  onSelect: (id: string) => void;
  onMove: (id: string, toIndex: number) => void;
};

/** The list of slides down the side. Drag one to reorder, or use the ribbon's move buttons. */
export function SlideSorter({ slides, theme, currentId, onSelect, onMove }: SlideSorterProps) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);

  return (
    <nav className={styles.sorter} aria-label="Slides">
      <ol className={styles.list}>
        {slides.map((slide, index) => (
          <li
            key={slide.id}
            className={styles.item}
            data-over={over === index}
            onDragOver={(event) => {
              if (!dragging) return;
              event.preventDefault();
              setOver(index);
            }}
            onDragLeave={() => setOver((current) => (current === index ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              if (dragging) onMove(dragging, index);
              setDragging(null);
              setOver(null);
            }}
          >
            <span className={styles.number} aria-hidden>
              {index + 1}
            </span>
            <button
              type="button"
              className={styles.thumb}
              aria-label={`Slide ${index + 1}`}
              aria-current={slide.id === currentId ? 'true' : undefined}
              data-slide-index={index}
              draggable
              onClick={() => onSelect(slide.id)}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', String(index + 1));
                setDragging(slide.id);
              }}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
            >
              <SlideThumb slide={slide} theme={theme} />
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
