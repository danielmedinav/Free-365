import { Button, DialogFrame } from '@free360/ui';
import { useState, type FormEvent } from 'react';
import styles from './PageSetupDialog.module.css';
import type { PageSetup } from './pageSetup';

type PageSetupDialogProps = {
  setup: PageSetup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: Partial<PageSetup>) => void;
};

/** Margins, header, and footer: the page settings that need typing rather than a preset. */
export function PageSetupDialog(props: PageSetupDialogProps) {
  const { open, onOpenChange } = props;
  // Remount the form each time so it starts from the current settings.
  return (
    <DialogFrame open={open} onOpenChange={onOpenChange} title="Page setup">
      {open && <PageSetupForm {...props} />}
    </DialogFrame>
  );
}

const MARGINS = [
  { key: 'marginTopIn', label: 'Top' },
  { key: 'marginBottomIn', label: 'Bottom' },
  { key: 'marginLeftIn', label: 'Left' },
  { key: 'marginRightIn', label: 'Right' },
] as const;

function PageSetupForm({ setup, onOpenChange, onSave }: PageSetupDialogProps) {
  const [draft, setDraft] = useState(setup);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave(draft);
    onOpenChange(false);
  };

  return (
    <form onSubmit={submit}>
      <fieldset className={styles.margins}>
        <legend>Margins (inches)</legend>
        {MARGINS.map(({ key, label }) => (
          <label key={key} className={styles.field}>
            {label}
            <input
              type="number"
              min="0"
              step="0.1"
              value={Math.round(draft[key] * 100) / 100}
              onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
            />
          </label>
        ))}
      </fieldset>
      <label className={styles.field}>
        Header text
        <input
          type="text"
          value={draft.headerText}
          onChange={(e) => setDraft({ ...draft, headerText: e.target.value })}
        />
      </label>
      <label className={styles.field}>
        Footer text
        <input
          type="text"
          value={draft.footerText}
          onChange={(e) => setDraft({ ...draft, footerText: e.target.value })}
        />
      </label>
      <div className={styles.actions}>
        <Button onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="submit" variant="primary">
          Save
        </Button>
      </div>
    </form>
  );
}
