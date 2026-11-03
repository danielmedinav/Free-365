import { APPS, docPath, isDocKind, type DocKind, type DocMeta } from '@free360/core';
import {
  AppShell,
  ConfirmDialog,
  PromptDialog,
  useRegisterCommands,
  type EditorAppProps,
  type RibbonTab,
} from '@free360/ui';
import { useLiveQuery } from 'dexie-react-hooks';
import { FilePlus, FolderOpen, Moon, PencilLine, Trash2 } from 'lucide-react';
import { lazy, Suspense, useState, type ComponentType, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useRepo } from '../services';
import { useCreateDoc } from '../useDocActions';
import styles from './EditorRoute.module.css';

const EDITORS: Record<DocKind, ComponentType<EditorAppProps>> = {
  write: lazy(() => import('@free360/write').then((m) => ({ default: m.WriteApp }))),
  grid: lazy(() => import('@free360/grid').then((m) => ({ default: m.GridApp }))),
  deck: lazy(() => import('@free360/deck').then((m) => ({ default: m.DeckApp }))),
};

const FILE_TAB: RibbonTab = {
  id: 'file',
  label: 'File',
  groups: [
    {
      id: 'document',
      label: 'Document',
      items: [
        { type: 'command', command: 'file.home', icon: FolderOpen, size: 'large' },
        { type: 'command', command: 'file.new', icon: FilePlus, size: 'large' },
        { type: 'command', command: 'file.rename', icon: PencilLine },
        { type: 'command', command: 'file.delete', icon: Trash2 },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [{ type: 'command', command: 'view.toggleTheme', icon: Moon }],
    },
  ],
};

export function EditorRoute() {
  const { kind, id } = useParams();
  const repo = useRepo();
  // `null` = not found; `undefined` = still loading.
  const meta = useLiveQuery(
    async () => (id ? ((await repo.getMeta(id)) ?? null) : null),
    [repo, id],
  );

  if (meta === undefined) return <CenteredMessage title="Opening…" />;
  if (meta === null || !isDocKind(kind)) {
    return (
      <CenteredMessage title="File not found">
        <p>It may have been deleted, or it was created in a different browser.</p>
        <Link to="/">Back to all files</Link>
      </CenteredMessage>
    );
  }
  if (meta.kind !== kind) return <Navigate to={docPath(meta)} replace />;
  return <Editor key={meta.id} meta={meta} />;
}

function Editor({ meta }: { meta: DocMeta }) {
  const repo = useRepo();
  const navigate = useNavigate();
  const createDoc = useCreateDoc();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const app = APPS[meta.kind];

  useRegisterCommands([
    {
      id: 'file.home',
      label: 'All files',
      description: 'Back to your files',
      run: () => navigate('/'),
    },
    {
      id: 'file.new',
      label: `New ${app.noun}`,
      shortcut: 'Alt+N',
      run: () => createDoc(meta.kind),
    },
    { id: 'file.rename', label: 'Rename', shortcut: 'F2', run: () => setRenaming(true) },
    { id: 'file.delete', label: 'Delete', run: () => setDeleting(true) },
  ]);

  const AppEditor = EDITORS[meta.kind];

  return (
    <>
      <Suspense fallback={<CenteredMessage title={`Loading ${app.name}…`} />}>
        <AppEditor
          meta={meta}
          repo={repo}
          fileTab={FILE_TAB}
          shell={{
            app: meta.kind,
            title: meta.title,
            onTitleChange: (title) => void repo.rename(meta.id, title),
            onHome: () => navigate('/'),
          }}
        />
      </Suspense>
      <PromptDialog
        open={renaming}
        onOpenChange={setRenaming}
        title={`Rename ${app.noun}`}
        label="New name"
        initialValue={meta.title}
        confirmLabel="Rename"
        onSubmit={(title) => void repo.rename(meta.id, title)}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${meta.title}”?`}
        description="This permanently removes it from this browser. Export a copy first if you need one."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          navigate('/');
          void repo.remove(meta.id);
        }}
      />
    </>
  );
}

function CenteredMessage({ title, children }: { title: string; children?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <AppShell onHome={() => navigate('/')}>
      <div className={styles.message}>
        <h2>{title}</h2>
        {children}
      </div>
    </AppShell>
  );
}
