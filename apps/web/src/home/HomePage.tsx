import {
  APPS,
  DOC_KINDS,
  docPath,
  formatRelativeTime,
  type DocKind,
  type DocMeta,
} from '@free360/core';
import { getStorageStatus } from '@free360/storage';
import { AppIcon, AppShell, ConfirmDialog, IconButton, Menu, PromptDialog } from '@free360/ui';
import { useLiveQuery } from 'dexie-react-hooks';
import { ExternalLink, MoreHorizontal, PencilLine, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useRepo } from '../services';
import { useCreateDoc } from '../useDocActions';
import styles from './HomePage.module.css';

type Filter = 'all' | DocKind;

const FILTER_LABELS: Record<Filter, string> = {
  all: 'All',
  write: 'Documents',
  grid: 'Spreadsheets',
  deck: 'Presentations',
};

export function HomePage() {
  const repo = useRepo();
  const createDoc = useCreateDoc();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<DocMeta | null>(null);
  const [deleting, setDeleting] = useState<DocMeta | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  const docs = useLiveQuery(
    () => repo.listRecent(filter === 'all' ? {} : { kind: filter }),
    [repo, filter],
  );

  useEffect(() => {
    void getStorageStatus().then((s) => setPersisted(s.persisted));
  }, []);

  const needle = query.trim().toLowerCase();
  const visible = docs?.filter((d) => d.title.toLowerCase().includes(needle));

  return (
    <AppShell
      status={{
        left: docs ? `${docs.length} ${docs.length === 1 ? 'file' : 'files'}` : '',
        right:
          persisted === false
            ? 'Stored in this browser (the browser may clear it if space runs low; export important files)'
            : 'Stored in this browser',
      }}
    >
      <div className={styles.page}>
        <section aria-labelledby="new-heading">
          <h2 id="new-heading" className={styles.heading}>
            Start something new
          </h2>
          <div className={styles.newGrid}>
            {DOC_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                className={styles.newCard}
                data-app={kind}
                onClick={() => void createDoc(kind)}
              >
                <AppIcon kind={kind} size={22} />
                <span className={styles.newText}>
                  <strong>Blank {APPS[kind].noun}</strong>
                  <span>{APPS[kind].name}</span>
                </span>
                <Plus size={18} aria-hidden className={styles.newPlus} />
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="recent-heading" className={styles.recent}>
          <div className={styles.recentHeader}>
            <h2 id="recent-heading" className={styles.heading}>
              Recent files
            </h2>
            <div className={styles.filters} role="group" aria-label="Filter by app">
              {(Object.keys(FILTER_LABELS) as Filter[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={styles.filter}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {FILTER_LABELS[value]}
                </button>
              ))}
            </div>
            <label className={styles.search}>
              <Search size={16} aria-hidden />
              <span className="fs-visually-hidden">Search files</span>
              <input
                type="search"
                placeholder="Search files"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>

          {visible && visible.length > 0 && (
            <ul className={styles.list} aria-label="Files">
              {visible.map((doc) => (
                <FileRow key={doc.id} doc={doc} onRename={setRenaming} onDelete={setDeleting} />
              ))}
            </ul>
          )}
          {visible && visible.length === 0 && (
            <p className={styles.empty}>
              {needle
                ? `No files match “${query.trim()}”.`
                : filter === 'all'
                  ? 'No files yet. Create one above; everything is saved in this browser.'
                  : `No ${FILTER_LABELS[filter].toLowerCase()} yet.`}
            </p>
          )}
        </section>
      </div>

      <PromptDialog
        open={!!renaming}
        onOpenChange={(open) => !open && setRenaming(null)}
        title="Rename"
        label="New name"
        initialValue={renaming?.title ?? ''}
        confirmLabel="Rename"
        onSubmit={(title) => renaming && void repo.rename(renaming.id, title)}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.title ?? ''}”?`}
        description="This permanently removes it from this browser. Export a copy first if you need one."
        confirmLabel="Delete"
        danger
        onConfirm={() => deleting && void repo.remove(deleting.id)}
      />
    </AppShell>
  );
}

type FileRowProps = {
  doc: DocMeta;
  onRename: (doc: DocMeta) => void;
  onDelete: (doc: DocMeta) => void;
};

function FileRow({ doc, onRename, onDelete }: FileRowProps) {
  const navigate = useNavigate();
  return (
    <li className={styles.row} data-app={doc.kind}>
      <Link to={docPath(doc)} className={styles.rowLink}>
        <AppIcon kind={doc.kind} size={16} />
        <span className={styles.rowTitle}>{doc.title}</span>
        <span className={styles.rowApp}>{APPS[doc.kind].name}</span>
        <time className={styles.rowTime} dateTime={new Date(doc.updatedAt).toISOString()}>
          {formatRelativeTime(doc.updatedAt)}
        </time>
      </Link>
      <Menu
        trigger={
          <IconButton label={`More actions for ${doc.title}`}>
            <MoreHorizontal size={18} aria-hidden />
          </IconButton>
        }
        items={[
          {
            label: 'Open',
            icon: <ExternalLink size={16} aria-hidden />,
            onSelect: () => navigate(docPath(doc)),
          },
          {
            label: 'Rename',
            icon: <PencilLine size={16} aria-hidden />,
            onSelect: () => onRename(doc),
          },
          { type: 'separator' },
          {
            label: 'Delete',
            icon: <Trash2 size={16} aria-hidden />,
            danger: true,
            onSelect: () => onDelete(doc),
          },
        ]}
      />
    </li>
  );
}
