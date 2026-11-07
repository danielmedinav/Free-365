import { clearDraft, readDraft } from '@free360/storage';
import { AppIcon, AppShell, type EditorAppProps } from '@free360/ui';
import { useEffect, useState } from 'react';
import styles from './GridApp.module.css';
import { GridEditor } from './GridEditor';
import {
  GRID_SCHEMA_VERSION,
  readWorkbook,
  UnsupportedVersionError,
  type Workbook,
} from './workbook';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; workbook: Workbook };

/** Loads the spreadsheet, then hands over to the editor. */
export function GridApp(props: EditorAppProps) {
  const { repo, meta, shell, fileTab } = props;
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const open = async () => {
      const content = await repo.getContent<Workbook | null>(meta.id);
      // Check the version first: it also guards the recovered draft against overwriting newer data.
      const workbook = readWorkbook(content);
      const draft = readDraft<Workbook>(meta.id, meta.updatedAt);
      if (draft) await repo.saveContent(meta.id, draft, GRID_SCHEMA_VERSION);
      clearDraft(meta.id);
      return draft ?? workbook;
    };
    open()
      .then((workbook) => {
        if (!cancelled) setLoad({ status: 'ready', workbook });
      })
      .catch((error: unknown) => {
        console.error(error);
        if (cancelled) return;
        setLoad({
          status: 'error',
          message:
            error instanceof UnsupportedVersionError
              ? 'This spreadsheet was saved by a newer version of FreeGrid. Refresh the page to update.'
              : 'This spreadsheet could not be opened.',
        });
      });
    return () => {
      cancelled = true;
    };
    // Only when a different document opens: `meta.updatedAt` changes with every save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, meta.id]);

  if (load.status === 'ready') return <GridEditor {...props} initialWorkbook={load.workbook} />;

  return (
    <AppShell {...shell} ribbon={[fileTab]} status={{ left: 'FreeGrid' }}>
      <div className={styles.message}>
        <AppIcon kind="grid" size={40} />
        <p>{load.status === 'error' ? load.message : 'Opening…'}</p>
      </div>
    </AppShell>
  );
}
