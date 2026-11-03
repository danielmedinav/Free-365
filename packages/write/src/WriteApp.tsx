import { AppShell, AppIcon, type EditorAppProps } from '@free360/ui';
import styles from './WriteApp.module.css';

/** Placeholder until Milestone 1 replaces it with the real FreeWrite editor. */
export function WriteApp({ shell, fileTab }: EditorAppProps) {
  return (
    <AppShell {...shell} ribbon={[fileTab]} status={{ left: 'FreeWrite', right: 'Saved locally' }}>
      <div className={styles.placeholder}>
        <AppIcon kind="write" size={40} />
        <h2>FreeWrite is coming in Milestone 1</h2>
        <p>A document editor with headings, lists, tables, and .docx export.</p>
      </div>
    </AppShell>
  );
}
