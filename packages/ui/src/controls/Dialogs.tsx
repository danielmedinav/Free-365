import { Dialog } from 'radix-ui';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from './Button';
import styles from './Controls.module.css';

type BaseDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
};

export function DialogFrame({ open, onOpenChange, title, description, children }: BaseDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.dialog}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <Dialog.Title className={styles.dialogTitle}>{title}</Dialog.Title>
          {description && (
            <Dialog.Description className={styles.dialogDescription}>
              {description}
            </Dialog.Description>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type ConfirmDialogProps = Omit<BaseDialogProps, 'children'> & {
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
};

export function ConfirmDialog({
  confirmLabel = 'OK',
  danger,
  onConfirm,
  onOpenChange,
  ...props
}: ConfirmDialogProps) {
  return (
    <DialogFrame onOpenChange={onOpenChange} {...props}>
      <div className={styles.dialogActions}>
        <Button onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          onClick={() => {
            onConfirm();
            onOpenChange(false);
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </DialogFrame>
  );
}

type PromptDialogProps = Omit<BaseDialogProps, 'children'> & {
  label: string;
  initialValue: string;
  confirmLabel?: string;
  onSubmit: (value: string) => void;
};

export function PromptDialog(props: PromptDialogProps) {
  // Remount the form each time the dialog opens so it starts from `initialValue`.
  return (
    <DialogFrame {...props}>
      {props.open && <PromptForm key={props.initialValue} {...props} />}
    </DialogFrame>
  );
}

function PromptForm({
  label,
  initialValue,
  confirmLabel = 'OK',
  onSubmit,
  onOpenChange,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(value);
    onOpenChange(false);
  };
  return (
    <form onSubmit={submit}>
      <label className="fs-visually-hidden" htmlFor="fs-prompt-input">
        {label}
      </label>
      <input
        id="fs-prompt-input"
        className={styles.textField}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        autoFocus
      />
      <div className={styles.dialogActions}>
        <Button onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="submit" variant="primary">
          {confirmLabel}
        </Button>
      </div>
    </form>
  );
}
