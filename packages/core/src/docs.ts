export type DocKind = 'write' | 'grid' | 'deck';

export const DOC_KINDS: readonly DocKind[] = ['write', 'grid', 'deck'];

export type DocId = string;

/** Lightweight record shown in file lists. Never contains the document body. */
export type DocMeta = {
  id: DocId;
  kind: DocKind;
  title: string;
  createdAt: number;
  updatedAt: number;
};

/** Versioned document body, stored separately from its metadata. */
export type DocContent<T = unknown> = {
  id: DocId;
  kind: DocKind;
  schemaVersion: number;
  data: T;
};

export type AppInfo = {
  kind: DocKind;
  name: string;
  noun: string;
  defaultTitle: string;
  route: string;
  extension: string;
};

export const APPS: Record<DocKind, AppInfo> = {
  write: {
    kind: 'write',
    name: 'FreeWrite',
    noun: 'document',
    defaultTitle: 'Untitled document',
    route: '/write',
    extension: 'docx',
  },
  grid: {
    kind: 'grid',
    name: 'FreeGrid',
    noun: 'spreadsheet',
    defaultTitle: 'Untitled spreadsheet',
    route: '/grid',
    extension: 'xlsx',
  },
  deck: {
    kind: 'deck',
    name: 'FreeDeck',
    noun: 'presentation',
    defaultTitle: 'Untitled presentation',
    route: '/deck',
    extension: 'pptx',
  },
};

export function isDocKind(value: unknown): value is DocKind {
  return typeof value === 'string' && (DOC_KINDS as readonly string[]).includes(value);
}

export function docPath(meta: Pick<DocMeta, 'id' | 'kind'>): string {
  return `${APPS[meta.kind].route}/${meta.id}`;
}

export function newDocId(): DocId {
  return crypto.randomUUID();
}

/** Trims and collapses whitespace; falls back to the app's default title when empty. */
export function normalizeTitle(title: string, kind: DocKind): string {
  const clean = title.replace(/\s+/g, ' ').trim().slice(0, 200);
  return clean || APPS[kind].defaultTitle;
}
