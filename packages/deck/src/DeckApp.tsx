import { clearDraft, readDraft } from '@free360/storage';
import { AppIcon, AppShell, type EditorAppProps } from '@free360/ui';
import { useEffect, useState } from 'react';
import { DECK_SCHEMA_VERSION, readDeck, UnsupportedVersionError, type Deck } from './deck';
import styles from './DeckApp.module.css';
import { DeckEditor } from './DeckEditor';

type LoadState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; deck: Deck };

/** Loads the presentation, then hands over to the editor. */
export function DeckApp(props: EditorAppProps) {
  const { repo, meta, shell, fileTab } = props;
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const open = async () => {
      const content = await repo.getContent<Deck | null>(meta.id);
      // Check the version first: it also guards the recovered draft against overwriting newer data.
      const deck = readDeck(content);
      const draft = readDraft<Deck>(meta.id, meta.updatedAt);
      if (draft) await repo.saveContent(meta.id, draft, DECK_SCHEMA_VERSION);
      clearDraft(meta.id);
      return draft ?? deck;
    };
    open()
      .then((deck) => {
        if (!cancelled) setLoad({ status: 'ready', deck });
      })
      .catch((error: unknown) => {
        console.error(error);
        if (cancelled) return;
        setLoad({
          status: 'error',
          message:
            error instanceof UnsupportedVersionError
              ? 'This presentation was saved by a newer version of FreeDeck. Refresh the page to update.'
              : 'This presentation could not be opened.',
        });
      });
    return () => {
      cancelled = true;
    };
    // Only when a different document opens: `meta.updatedAt` changes with every save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, meta.id]);

  if (load.status === 'ready') return <DeckEditor {...props} initialDeck={load.deck} />;

  return (
    <AppShell {...shell} ribbon={[fileTab]} status={{ left: 'FreeDeck' }}>
      <div className={styles.message}>
        <AppIcon kind="deck" size={40} />
        <p>{load.status === 'error' ? load.message : 'Opening…'}</p>
      </div>
    </AppShell>
  );
}
