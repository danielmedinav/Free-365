import type { ReactNode } from 'react';
import styles from './AppShell.module.css';

export function StatusBar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <footer className={styles.statusBar}>
      <div className={styles.statusGroup}>{left}</div>
      <div className={styles.statusGroup}>{right}</div>
    </footer>
  );
}
