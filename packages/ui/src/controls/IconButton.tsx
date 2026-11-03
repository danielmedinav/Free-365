import { forwardRef, type ButtonHTMLAttributes } from 'react';
import styles from './Controls.module.css';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Accessible name; also shown as the native tooltip. */
  label: string;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={[styles.iconButton, className].filter(Boolean).join(' ')}
      {...props}
    />
  );
});
