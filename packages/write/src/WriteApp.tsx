import { clearDraft, readDraft } from '@free360/storage';
import { AppIcon, AppShell, type EditorAppProps } from '@free360/ui';
import type { JSONContent } from '@tiptap/core';
import { useEffect, useState } from 'react';
import { readDoc, UnsupportedVersionError, WRITE_SCHEMA_VERSION, type WriteData } from './content';
import styles from './WriteApp.module.css';
import { WriteEditor } from './WriteEditor';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; doc: JSONContent };

/** Loads the document body, then hands over to the editor. */
export function WriteApp(props: EditorAppProps) {
  const { repo, meta, shell, fileTab } = props;
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const open = async () => {
      const content = await repo.getContent<WriteData | null>(meta.id);
      // Check the version first: it also guards the recovered draft against overwriting newer data.
      const doc = readDoc(content);
      const draft = readDraft<JSONContent>(meta.id, meta.updatedAt);
      if (draft) await repo.saveContent<WriteData>(meta.id, { doc: draft }, WRITE_SCHEMA_VERSION);
      clearDraft(meta.id);
      return draft ?? doc;
    };
    open()
      .then((doc) => {
        if (!cancelled) setLoad({ status: 'ready', doc });
      })
      .catch((error: unknown) => {
        console.error(error);
        if (cancelled) return;
        setLoad({
          status: 'error',
          message:
            error instanceof UnsupportedVersionError
              ? 'This document was saved by a newer version of FreeWrite. Refresh the page to update.'
              : 'This document could not be opened.',
        });
      });
    return () => {
      cancelled = true;
    };
    // Only when a different document opens: `meta.updatedAt` changes with every save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, meta.id]);

  if (load.status === 'ready') return <WriteEditor {...props} initialDoc={load.doc} />;

  return (
    <AppShell {...shell} ribbon={[fileTab]} status={{ left: 'FreeWrite' }}>
      <div className={styles.message}>
        <AppIcon kind="write" size={40} />
        <p>{load.status === 'error' ? load.message : 'Opening…'}</p>
      </div>
    </AppShell>
  );
}
