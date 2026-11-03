import { AppShell, AppIcon, type EditorAppProps } from '@free360/ui';
import styles from './DeckApp.module.css';

/** Placeholder until Milestone 3 replaces it with the real FreeDeck editor. */
export function DeckApp({ shell, fileTab }: EditorAppProps) {
  return (
    <AppShell {...shell} ribbon={[fileTab]} status={{ left: 'FreeDeck', right: 'Saved locally' }}>
      <div className={styles.placeholder}>
        <AppIcon kind="deck" size={40} />
        <h2>FreeDeck is coming in Milestone 3</h2>
        <p>A slide editor with themes, presenter mode, and .pptx export.</p>
      </div>
    </AppShell>
  );
}
