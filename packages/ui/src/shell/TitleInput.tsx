import { useRef, useState } from 'react';
import styles from './AppShell.module.css';

type TitleInputProps = {
  value: string;
  onCommit: (title: string) => void;
  label?: string;
};

/** Inline-editable title. Commits on Enter or blur; Escape reverts. */
export function TitleInput({ value, onCommit, label = 'Document title' }: TitleInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);

  const finish = () => {
    if (!cancelled.current && draft !== null && draft !== value) onCommit(draft);
    cancelled.current = false;
    setDraft(null);
  };

  const shown = draft ?? value;

  return (
    <input
      className={styles.title}
      aria-label={label}
      value={shown}
      size={Math.max(8, Math.min(48, shown.length + 1))}
      onFocus={(e) => {
        setDraft(value);
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}
