import { useEffect, useState, type KeyboardEvent, type RefObject } from 'react';
import styles from './FormulaBar.module.css';

type FormulaBarProps = {
  /** The selected cell or range, as text like `B2` or `A1:C3`. */
  location: string;
  value: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onFocus: () => void;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** Goes to a typed location. Returns false if it isn't one. */
  onGoTo: (location: string) => boolean;
};

/** Shows and edits what's really in the selected cell, including formulas. */
export function FormulaBar({
  location,
  value,
  inputRef,
  onFocus,
  onChange,
  onKeyDown,
  onGoTo,
}: FormulaBarProps) {
  const [typed, setTyped] = useState<string | null>(null);

  // A new selection replaces whatever was being typed here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTyped(null);
  }, [location]);

  return (
    <div className={styles.bar}>
      <input
        className={styles.location}
        aria-label="Selected cell"
        value={typed ?? location}
        onChange={(event) => setTyped(event.target.value)}
        onFocus={(event) => event.target.select()}
        onBlur={() => setTyped(null)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (onGoTo(event.currentTarget.value)) setTyped(null);
          } else if (event.key === 'Escape') {
            setTyped(null);
          }
        }}
      />
      <span className={styles.fx} aria-hidden>
        fx
      </span>
      <input
        ref={inputRef}
        className={styles.formula}
        aria-label="Cell contents"
        spellCheck={false}
        value={value}
        onFocus={onFocus}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
