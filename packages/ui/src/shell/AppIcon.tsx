import type { DocKind } from '@free360/core';
import { FileText, Presentation, Sheet } from 'lucide-react';
import styles from './AppShell.module.css';

const ICONS = { write: FileText, grid: Sheet, deck: Presentation } as const;

export function AppIcon({ kind, size = 18 }: { kind: DocKind; size?: number }) {
  const Icon = ICONS[kind];
  return (
    <span
      className={styles.appIcon}
      data-app={kind}
      style={{ width: size + 10, height: size + 10 }}
    >
      <Icon size={size} aria-hidden />
    </span>
  );
}
