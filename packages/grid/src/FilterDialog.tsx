import { Button, DialogFrame } from '@free360/ui';
import { useState, type FormEvent } from 'react';
import styles from './FilterDialog.module.css';

type FilterDialogProps = {
  columnName: string;
  /** Every different value in the column. */
  values: string[];
  /** The values currently hidden. */
  hidden: string[];
  onClose: () => void;
  onApply: (hidden: string[]) => void;
};

/** A checklist of a column's values; unchecking one hides the rows that have it. */
export function FilterDialog({ columnName, values, hidden, onClose, onApply }: FilterDialogProps) {
  const [unchecked, setUnchecked] = useState(() => new Set(hidden));

  const toggle = (value: string, checked: boolean) => {
    const next = new Set(unchecked);
    if (checked) next.delete(value);
    else next.add(value);
    setUnchecked(next);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onApply([...unchecked]);
    onClose();
  };

  return (
    <DialogFrame
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Filter column ${columnName}`}
    >
      <form onSubmit={submit}>
        <div className={styles.shortcuts}>
          <Button variant="ghost" onClick={() => setUnchecked(new Set())}>
            Select all
          </Button>
          <Button variant="ghost" onClick={() => setUnchecked(new Set(values))}>
            Clear all
          </Button>
        </div>
        <ul className={styles.list}>
          {values.map((value) => (
            <li key={value}>
              <label className={styles.item}>
                <input
                  type="checkbox"
                  checked={!unchecked.has(value)}
                  onChange={(event) => toggle(value, event.target.checked)}
                />
                {value === '' ? <em>(Empty)</em> : value}
              </label>
            </li>
          ))}
        </ul>
        <div className={styles.actions}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Apply
          </Button>
        </div>
      </form>
    </DialogFrame>
  );
}
