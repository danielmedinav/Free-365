import type { ButtonHTMLAttributes } from 'react';
import styles from './Controls.module.css';

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant };

export function Button({ variant = 'default', className, type = 'button', ...props }: ButtonProps) {
  const variantClass = variant === 'default' ? '' : styles[variant];
  return (
    <button
      type={type}
      className={[styles.button, variantClass, className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
