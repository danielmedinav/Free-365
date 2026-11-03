import { AppShell, AppIcon, type EditorAppProps } from '@free360/ui';
import styles from './GridApp.module.css';

/** Placeholder until Milestone 2 replaces it with the real FreeGrid editor. */
export function GridApp({ shell, fileTab }: EditorAppProps) {
  return (
    <AppShell {...shell} ribbon={[fileTab]} status={{ left: 'FreeGrid', right: 'Saved locally' }}>
      <div className={styles.placeholder}>
        <AppIcon kind="grid" size={40} />
        <h2>FreeGrid is coming in Milestone 2</h2>
        <p>A spreadsheet with formulas, charts, and .xlsx import/export.</p>
      </div>
    </AppShell>
  );
}
