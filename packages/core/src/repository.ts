import type { DocContent, DocId, DocKind, DocMeta } from './docs';

export type CreateDocInput<T = unknown> = {
  kind: DocKind;
  title?: string;
  schemaVersion?: number;
  data?: T;
};

export type ListDocsOptions = {
  kind?: DocKind;
  limit?: number;
};

/**
 * Storage contract shared by all apps. `@free360/storage` implements it with IndexedDB;
 * tests can use any in-memory implementation.
 */
export type DocRepository = {
  create<T>(input: CreateDocInput<T>): Promise<DocMeta>;
  getMeta(id: DocId): Promise<DocMeta | undefined>;
  getContent<T>(id: DocId): Promise<DocContent<T> | undefined>;
  saveContent<T>(id: DocId, data: T, schemaVersion: number): Promise<DocMeta>;
  rename(id: DocId, title: string): Promise<DocMeta>;
  remove(id: DocId): Promise<void>;
  listRecent(options?: ListDocsOptions): Promise<DocMeta[]>;
};

export class DocNotFoundError extends Error {
  constructor(readonly id: DocId) {
    super(`Document not found: ${id}`);
    this.name = 'DocNotFoundError';
  }
}
